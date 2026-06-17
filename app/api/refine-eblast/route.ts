import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { refineFlyerContent } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

// Order-independent deep stringify, so a true no-op is detected even for fields
// getChangedFields doesn't enumerate (event details, footer overrides, alt text…).
function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

function getChangedFields(before: ExtractedFlyer, after: ExtractedFlyer): string[] {
  const changes: string[] = [];
  const fieldLabels: Array<[keyof ExtractedFlyer, string]> = [
    ["subject", "Subject"],
    ["previewText", "Preview text"],
    ["eyebrow", "Eyebrow"],
    ["headline", "Headline"],
    ["scriptSubheadline", "Script subheadline"],
    ["heroHook", "Hero hook"],
    ["storyEyebrow", "Story eyebrow"],
    ["storyScriptTitle", "Story title"],
    ["pullQuoteEyebrow", "Quote eyebrow"],
    ["pullQuote", "Pull quote"],
    ["pullQuoteAttribution", "Attribution"],
    ["ctaEyebrow", "CTA eyebrow"],
    ["ctaHeadline", "CTA headline"],
    ["ctaSubline", "CTA subline"],
    ["ctaButtonLabel", "CTA button"],
  ];
  for (const [field, label] of fieldLabels) {
    if (before[field] !== after[field]) changes.push(label);
  }
  const bp1 = before.bodyParagraphs ?? [];
  const bp2 = after.bodyParagraphs ?? [];
  if (bp1.length !== bp2.length || bp1.some((p, i) => p !== bp2[i])) changes.push("Body text");
  return changes;
}

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  current: ExtractedFlyer;
  instruction: string;
  communitySlug: string;
  heroImageUrl?: string;
  secondaryImageUrl?: string;
  galleryImageUrls?: string[];
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  if (!body.current || !body.instruction || !body.communitySlug) {
    return NextResponse.json(
      { ok: false, error: "Missing current, instruction, or communitySlug" },
      { status: 400 },
    );
  }

  const community = await getCommunity(body.communitySlug);
  if (!community) {
    return NextResponse.json({ ok: false, error: `Unknown community: ${body.communitySlug}` }, { status: 404 });
  }

  try {
    const pastSends = await getRecentSendsForCommunity({ communityId: community.id, limit: 12 });

    // Build a stable photo manifest the model can reference by index. Order:
    // current hero, current secondary, then gallery photos in order.
    const pool: Array<{ url: string; role: string }> = [];
    if (body.heroImageUrl) pool.push({ url: body.heroImageUrl, role: "currently the hero image" });
    if (body.secondaryImageUrl) pool.push({ url: body.secondaryImageUrl, role: "currently the inline secondary image" });
    (body.galleryImageUrls ?? []).forEach((u, i) => pool.push({ url: u, role: `currently gallery photo ${i + 1}` }));
    const imageManifestText = pool.length
      ? pool.map((p, i) => `  [${i}] ${p.role}`).join("\n")
      : "  (no photos are currently in this email)";

    const result = await refineFlyerContent({
      current: body.current,
      instruction: body.instruction,
      community,
      pastSends,
      imageManifestText,
    });

    // Merge onto the prior draft so any field the model omitted is preserved
    // (the model is told to return the full object and to set "" to clear a
    // field, so explicit clears still work; omissions never silently drop data).
    const mergedExtracted: ExtractedFlyer = { ...body.current, ...result.flyer };

    // Resolve the image arrangement. Default: keep exactly what the client sent.
    let nextHero = body.heroImageUrl;
    let nextSecondary = body.secondaryImageUrl;
    let nextGallery = body.galleryImageUrls ?? [];
    if (result.imageLayout && pool.length) {
      const at = (idx: number) =>
        Number.isInteger(idx) && idx >= 0 && idx < pool.length ? pool[idx].url : undefined;
      const newHero = at(result.imageLayout.hero);
      const newSecondary = at(result.imageLayout.secondary);
      const used = new Set([newHero, newSecondary].filter(Boolean) as string[]);
      const newGallery = (result.imageLayout.gallery ?? [])
        .map(at)
        .filter((u): u is string => !!u && !used.has(u))
        .slice(0, 4);
      nextHero = newHero;
      nextSecondary = newSecondary;
      nextGallery = newGallery;
    }
    const imagesChanged =
      nextHero !== body.heroImageUrl ||
      nextSecondary !== body.secondaryImageUrl ||
      JSON.stringify(nextGallery) !== JSON.stringify(body.galleryImageUrls ?? []);

    const html = buildEblastHtml(mergedExtracted, community, {
      heroImageUrl: nextHero,
      secondaryImageUrl: nextSecondary,
      galleryImageUrls: nextGallery,
    });
    // Human-readable labels for the history pill (a tracked subset)…
    const changedFields = getChangedFields(body.current, mergedExtracted);
    // …but the "nothing happened" decision compares the ENTIRE object, so an
    // edit to an untracked field (event time, footer, alt text, etc.) is never
    // mislabeled as a no-op.
    const textChanged = stableStringify(mergedExtracted) !== stableStringify(body.current);
    const noChange = !textChanged && !imagesChanged;

    return NextResponse.json({
      ok: true,
      extracted: mergedExtracted,
      html,
      changedFields,
      images: { hero: nextHero, secondary: nextSecondary, gallery: nextGallery },
      imagesChanged,
      refineNote: result.refineNote ?? null,
      noChange,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
