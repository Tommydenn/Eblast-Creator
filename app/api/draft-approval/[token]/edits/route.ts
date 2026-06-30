import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts, draftImageBank } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { sendEditNotificationEmail, sendApprovalEmail } from "@/lib/email";
import { swapDataUrisForHostedImages } from "@/lib/hubspot";
import { refineFlyerContent } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
// Auto-refine can take up to 30 s for the Claude call + image processing.
export const maxDuration = 60;

/** Extract the src of the first img with the given data-img-label. */
function extractImgSrc(html: string, label: string): string | undefined {
  // Match the full <img ...> tag that contains the given label, then pull src.
  const tagRe = new RegExp(`<img[^>]*data-img-label="${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`, "i");
  const tagMatch = html.match(tagRe);
  if (!tagMatch) return undefined;
  const srcMatch = tagMatch[0].match(/src="([^"]*)"/);
  const src = srcMatch?.[1];
  return src && src.length > 0 ? src : undefined;
}

/** Extract all gallery image src values in order ("Gallery image 1", "Gallery image 2", …). */
function extractGalleryImgs(html: string): string[] {
  const srcs: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const src = extractImgSrc(html, `Gallery image ${i}`);
    if (src) srcs.push(src);
  }
  return srcs;
}

/** Order-independent stringify for change detection. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${(value as unknown[]).map(stableStringify).join(",")}]`;
  return `{${Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let body: { editNotes: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  const { token } = params;
  const editNotes = body.editNotes?.trim();
  if (!editNotes) {
    return NextResponse.json({ ok: false, error: "editNotes is required" }, { status: 400 });
  }

  const [approval] = await db
    .select()
    .from(savedDraftApprovals)
    .where(eq(savedDraftApprovals.token, token))
    .limit(1);

  if (!approval) {
    return NextResponse.json({ ok: false, error: "Approval thread not found" }, { status: 404 });
  }

  if (approval.decision !== "pending") {
    return NextResponse.json({ ok: false, error: "This draft has already been decided" }, { status: 409 });
  }

  // ── Load the saved draft ────────────────────────────────────────────────────
  const [draftRow] = await db
    .select()
    .from(savedDrafts)
    .where(eq(savedDrafts.id, approval.savedDraftId))
    .limit(1);

  const draftData = (draftRow?.data as Record<string, unknown>) ?? {};
  const currentExtracted = draftData.extracted as ExtractedFlyer | undefined;
  const currentHtml = (draftData.html as string) ?? "";

  // ── Attempt AI auto-refine ─────────────────────────────────────────────────
  let autoRefined = false;
  let refineNote: string | null = null;

  if (currentExtracted && currentHtml) {
    try {
      const community = await getCommunity(approval.communitySlug);
      if (!community) throw new Error("Community not found");

      const pastSends = await getRecentSendsForCommunity({ communityId: community.id, limit: 12 });

      // Build image pool from placed images in the HTML + full image bank.
      const heroImageUrl = extractImgSrc(currentHtml, "Hero image");
      const secondaryImageUrl = extractImgSrc(currentHtml, "Secondary image");
      const galleryImageUrls = extractGalleryImgs(currentHtml);

      const bankRows = await db
        .select({ url: draftImageBank.url })
        .from(draftImageBank)
        .where(eq(draftImageBank.draftId, approval.savedDraftId))
        .orderBy(asc(draftImageBank.idx));
      const allExtractedImageUrls = bankRows.map((r) => r.url);

      const pool: Array<{ url: string; name: string; isOriginal: boolean }> = [];
      if (heroImageUrl) pool.push({ url: heroImageUrl, name: "Hero image", isOriginal: false });
      if (secondaryImageUrl) pool.push({ url: secondaryImageUrl, name: "Secondary image", isOriginal: false });
      galleryImageUrls.forEach((u, i) =>
        pool.push({ url: u, name: `Gallery image ${i + 1}`, isOriginal: false }),
      );
      const placed = new Set(pool.map((p) => p.url));
      allExtractedImageUrls.forEach((url) => {
        if (!placed.has(url)) {
          pool.push({ url, name: `Original image ${pool.length + 1}`, isOriginal: true });
          placed.add(url);
        }
      });

      const imageManifestText = pool.length
        ? pool
            .map((p, i) =>
              p.isOriginal
                ? `  [${i}] "${p.name}" — full-resolution original`
                : `  [${i}] "${p.name}" — currently placed`,
            )
            .join("\n")
        : "  (no photos in this email)";

      const result = await refineFlyerContent({
        current: currentExtracted,
        instruction: editNotes,
        community,
        pastSends,
        imageManifestText,
      });

      // If the model flagged this as out of scope (e.g. "use a different image",
      // "add a new photo"), skip the apply path entirely and fall through to the
      // human notification so no half-baked edit gets saved or emailed.
      if (result.isOutOfScope) {
        refineNote = result.refineNote ?? null;
        throw new Error("out-of-scope");
      }

      const mergedExtracted: ExtractedFlyer = { ...currentExtracted, ...result.flyer };
      const textChanged = stableStringify(mergedExtracted) !== stableStringify(currentExtracted);

      // Resolve image arrangement after refinement.
      let nextHero = heroImageUrl;
      let nextSecondary = secondaryImageUrl;
      let nextGallery = galleryImageUrls;
      let imagesChanged = false;

      if (result.imageLayout && pool.length) {
        const at = (idx: number) =>
          Number.isInteger(idx) && idx >= 0 && idx < pool.length ? pool[idx].url : undefined;
        const newHero = at(result.imageLayout.hero ?? -1);
        const newSecondary = at(result.imageLayout.secondary ?? -1);
        const used = new Set([newHero, newSecondary].filter(Boolean) as string[]);
        const newGallery = (result.imageLayout.gallery ?? [])
          .map((i: number) => at(i))
          .filter((u: string | undefined): u is string => !!u && !used.has(u))
          .slice(0, 4);
        if (newHero !== undefined) nextHero = newHero;
        if (newSecondary !== undefined) nextSecondary = newSecondary;
        nextGallery = newGallery;
        imagesChanged =
          nextHero !== heroImageUrl ||
          nextSecondary !== secondaryImageUrl ||
          JSON.stringify(nextGallery) !== JSON.stringify(galleryImageUrls);
      }

      refineNote = result.refineNote ?? null;

      if (textChanged || imagesChanged) {
        // Apply the refinement.
        const newHtml = await inlineRelativeImages(buildEblastHtml(mergedExtracted, community, {
          heroImageUrl: nextHero,
          secondaryImageUrl: nextSecondary,
          galleryImageUrls: nextGallery,
        }));

        // Update the saved draft with the refined content.
        const updatedData = { ...draftData, extracted: mergedExtracted, html: newHtml };
        await db
          .update(savedDrafts)
          .set({ data: updatedData, subject: mergedExtracted.subject })
          .where(eq(savedDrafts.id, approval.savedDraftId));

        // Mark this approval as edits_requested (decided).
        await db
          .update(savedDraftApprovals)
          .set({ decision: "edits_requested", editNotes, decidedAt: new Date() })
          .where(eq(savedDraftApprovals.token, token));

        // Upload images for the new approval email so they render in inbox.
        let emailHtml = newHtml;
        try {
          const swap = await swapDataUrisForHostedImages({
            html: newHtml,
            folderPath: `/eblast-drafter/${approval.communitySlug}/approval-previews`,
          });
          if (swap.failures.length === 0) emailHtml = swap.html;
        } catch { /* fall back to raw HTML */ }

        // Create a new approval token and send a fresh review email.
        const newToken = randomBytes(24).toString("base64url");
        await db.insert(savedDraftApprovals).values({
          token: newToken,
          savedDraftId: approval.savedDraftId,
          communitySlug: approval.communitySlug,
          recipientName: approval.recipientName,
          recipientEmail: approval.recipientEmail,
          notifyEmail: approval.notifyEmail,
          draftSubject: mergedExtracted.subject,
          decision: "pending",
        });

        await sendApprovalEmail({
          to: approval.recipientEmail,
          recipientName: approval.recipientName,
          communityName: community.displayName,
          draftSubject: mergedExtracted.subject,
          draftHtml: emailHtml,
          token: newToken,
        });

        autoRefined = true;
        return NextResponse.json({ ok: true, autoRefined: true, refineNote });
      }

      // Refinement produced no changes → treat as out-of-scope, fall through to notification.
    } catch (e: any) {
      if (e?.message !== "out-of-scope") {
        console.error("[draft-approval/edits] auto-refine failed:", e);
      }
      // Fall through to manual notification.
    }
  }

  // ── Fallback: manual edit notification ─────────────────────────────────────
  // Reaches here when auto-refine was skipped, produced no changes, or threw.
  await db
    .update(savedDraftApprovals)
    .set({ decision: "edits_requested", editNotes, decidedAt: new Date() })
    .where(eq(savedDraftApprovals.token, token));

  if (approval.notifyEmail) {
    try {
      const community = await getCommunity(approval.communitySlug);
      await sendEditNotificationEmail({
        to: approval.notifyEmail,
        recipientName: approval.recipientName,
        communityName: community?.displayName ?? approval.communitySlug,
        draftSubject: approval.draftSubject ?? "(no subject)",
        editNotes,
        savedDraftId: approval.savedDraftId,
      });
    } catch (e) {
      console.error("[draft-approval/edits] notification email failed:", e);
    }
  }

  return NextResponse.json({ ok: true, autoRefined: false, refineNote });
}
