import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { sendEditNotificationEmail, sendApprovalEmail } from "@/lib/email";
import { swapDataUrisForHostedImages } from "@/lib/hubspot";
import { refineFlyerContent, classifyEditRequestScope } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
// Auto-refine can take up to 30 s for the Claude call + image processing.
export const maxDuration = 60;

// A salesperson's edit request only ever gets auto-applied by the AI when
// it's purely about wording/copy — never formatting, color, images, spacing,
// layout, or an explicit request for a human to make the change. Anything
// else (including mixed or ambiguous requests) routes straight to the
// marketing-team notification. See classifyEditRequestScope in lib/anthropic.ts.
const MAX_AUTO_REFINE_ROUNDS = 3;

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

  // ── Fallback: route to the marketing team, with a reason for context ───────
  async function notifyMarketing(reason: string, refineNote: string | null = null) {
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
          reason,
        });
      } catch (e) {
        console.error("[draft-approval/edits] notification email failed:", e);
      }
    }

    return NextResponse.json({ ok: true, autoRefined: false, refineNote });
  }

  // ── Strike limit: after this many prior edit-request rounds on this draft,
  // stop attempting AI auto-refine entirely and always go to a human ─────────
  // Every prior edit-request round (whether AI-handled or routed to a human)
  // left exactly one approval row with decision="edits_requested" for this
  // draft — count those, not unrelated fresh re-sends of the same draft.
  const priorRounds = await db
    .select({ token: savedDraftApprovals.token })
    .from(savedDraftApprovals)
    .where(and(
      eq(savedDraftApprovals.savedDraftId, approval.savedDraftId),
      eq(savedDraftApprovals.decision, "edits_requested"),
    ));
  const priorEditRequestCount = priorRounds.filter((r) => r.token !== token).length;

  if (priorEditRequestCount >= MAX_AUTO_REFINE_ROUNDS) {
    return notifyMarketing(
      `This draft has already had ${priorEditRequestCount} rounds of edit requests — routing directly to the marketing team rather than attempting another automatic revision.`,
    );
  }

  // ── Classify: is this purely a wording/copy request? ───────────────────────
  const classification = await classifyEditRequestScope(editNotes);
  if (classification.scope !== "text_content") {
    return notifyMarketing(classification.reason);
  }

  // ── Load the saved draft ────────────────────────────────────────────────────
  const [draftRow] = await db
    .select()
    .from(savedDrafts)
    .where(eq(savedDrafts.id, approval.savedDraftId))
    .limit(1);

  const draftData = (draftRow?.data as Record<string, unknown>) ?? {};
  // Support both new format (fields) and old format (extracted)
  const currentExtracted = (draftData.fields ?? draftData.extracted) as ExtractedFlyer | undefined;
  const isNewFormat = !!draftData.fields;
  const currentHtml = (draftData.html as string) ?? "";
  const currentImages = draftData.images as { hero?: { url: string; originalUrl: string } | null; secondary?: { url: string; originalUrl: string } | null; gallery?: Array<{ url: string; originalUrl: string }> } | undefined;

  if (!currentExtracted || (!currentHtml && !isNewFormat)) {
    return notifyMarketing("Could not load this draft's content to apply an automatic text edit.");
  }

  // Current image arrangement is carried through UNCHANGED — this endpoint
  // never edits images, so there's no layout to resolve, only to preserve.
  let heroImageUrl: string | undefined;
  let secondaryImageUrl: string | undefined;
  let galleryImageUrls: string[];
  if (isNewFormat && currentImages) {
    // currentImages.url fields are empty strings when read from a draft saved by the
    // client — buildDraftPayload clears them to avoid the 4.5 MB payload limit; the
    // actual data URIs live in draftImageBank. Fall back to the CDN HTML (saved after
    // the first successful approval send) so images are never lost.
    heroImageUrl = currentImages.hero?.url || extractImgSrc(currentHtml, "Hero image");
    secondaryImageUrl = currentImages.secondary?.url || extractImgSrc(currentHtml, "Secondary image");
    galleryImageUrls = (currentImages.gallery ?? []).map((g) => g.url).filter(Boolean);
    if (galleryImageUrls.length === 0) galleryImageUrls = extractGalleryImgs(currentHtml);
  } else {
    heroImageUrl = extractImgSrc(currentHtml, "Hero image");
    secondaryImageUrl = extractImgSrc(currentHtml, "Secondary image");
    galleryImageUrls = extractGalleryImgs(currentHtml);
  }

  try {
    const community = await getCommunity(approval.communitySlug);
    if (!community) throw new Error("Community not found");

    const pastSends = await getRecentSendsForCommunity({ communityId: community.id, limit: 12 });

    // No imageManifestText is passed — this endpoint is text-only, so the
    // model has no image context and no basis to touch photos.
    const result = await refineFlyerContent({
      current: currentExtracted,
      instruction: editNotes,
      community,
      pastSends,
    });

    // Even though we classified this as text_content up front, the model
    // itself may still decide the request can't be fulfilled through copy
    // edits alone — respect that and route to a human instead of guessing.
    if (result.isOutOfScope) {
      return notifyMarketing(result.refineNote ?? "The AI could not apply this as a text-only edit.");
    }

    const mergedExtracted: ExtractedFlyer = { ...currentExtracted, ...result.flyer };
    const textChanged = stableStringify(mergedExtracted) !== stableStringify(currentExtracted);

    if (!textChanged) {
      return notifyMarketing(result.refineNote ?? "The AI did not find a text-only change to apply.");
    }

    // Apply the refinement — images pass through exactly as they were.
    const newHtml = await inlineRelativeImages(buildEblastHtml(mergedExtracted, community, {
      heroImageUrl,
      secondaryImageUrl,
      galleryImageUrls,
    }));

    const updatedData = {
      ...draftData,
      ...(isNewFormat ? { fields: mergedExtracted } : {}),
      extracted: mergedExtracted,
      html: newHtml,
    };
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
      // Snapshot the exact HTML emailed for this new approval so the eventual
      // push matches what the salesperson approved (survives draft saves).
      html: emailHtml,
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

    return NextResponse.json({ ok: true, autoRefined: true, refineNote: result.refineNote ?? null });
  } catch (e: any) {
    console.error("[draft-approval/edits] auto-refine failed:", e);
    return notifyMarketing("The automatic text edit failed unexpectedly — please make this change manually.");
  }
}
