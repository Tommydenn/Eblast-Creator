import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { refineFlyerContent } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { SENTINEL_HERO, SENTINEL_SECONDARY, sentinelGallery } from "@/lib/render-sentinels";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import { cropDataUriToFocusAndRatio } from "@/lib/pdf-images";
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
    ["storyEyebrow", "Story eyebrow"],
    ["storyScriptTitle", "Story title"],
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
  // allExtractedImageUrls intentionally omitted — too large for request body.
  // The model can rearrange/crop currently placed images; new images are swapped
  // via the client-side image bank UI.
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

    // Build a stable photo manifest the model can reference by index. The names
    // here MUST match the hover labels shown on each image in the preview
    // (render-email.ts data-img-label) so a user can call a photo out by name
    // and the model maps it to the right slot. Only currently-placed images are
    // included — the full image bank is too large to transmit in the request body.
    const pool: Array<{ url: string; name: string; isOriginal: boolean }> = [];
    if (body.heroImageUrl) pool.push({ url: body.heroImageUrl, name: "Hero image", isOriginal: false });
    if (body.secondaryImageUrl) pool.push({ url: body.secondaryImageUrl, name: "Secondary image", isOriginal: false });
    (body.galleryImageUrls ?? []).forEach((u, i) => pool.push({ url: u, name: `Gallery image ${i + 1}`, isOriginal: false }));
    const imageManifestText = pool.length
      ? pool.map((p, i) =>
          p.isOriginal
            ? `  [${i}] "${p.name}" — full-resolution original, use for imageCropInstructions`
            : `  [${i}] "${p.name}" — already placed and cropped`
        ).join("\n")
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
    if (result.imageCropInstructions?.length && pool.length) {
      const validFoci = ["top", "center", "bottom", "left", "right"] as const;
      type Focus = typeof validFoci[number];
      for (const crop of result.imageCropInstructions) {
        const { imageIndex, focus } = crop;
        if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= pool.length) continue;
        const safeFocus: Focus = (validFoci as readonly string[]).includes(focus) ? focus as Focus : "center";
        const url = pool[imageIndex].url;
        // Use the correct aspect ratio for whichever slot the image occupies.
        const isInGallery = nextGallery.includes(url);
        const targetRatio = isInGallery ? 4 / 3 : 16 / 9;
        const cropped = await cropDataUriToFocusAndRatio(url, targetRatio, safeFocus);
        if (nextHero === url) nextHero = cropped;
        if (nextSecondary === url) nextSecondary = cropped;
        nextGallery = nextGallery.map((u) => (u === url ? cropped : u));
      }
    }

    const imagesChanged =
      nextHero !== body.heroImageUrl ||
      nextSecondary !== body.secondaryImageUrl ||
      JSON.stringify(nextGallery) !== JSON.stringify(body.galleryImageUrls ?? []);

    // Return sentinel HTML — no image data URIs embedded. The client injects
    // images from the `images` field (or its own current state) after receiving.
    const galleryCount = nextGallery.length;
    const html = await inlineRelativeImages(buildEblastHtml(mergedExtracted, community, {
      heroImageUrl: nextHero ? SENTINEL_HERO : undefined,
      secondaryImageUrl: nextSecondary ? SENTINEL_SECONDARY : undefined,
      galleryImageUrls: galleryCount > 0
        ? Array.from({ length: galleryCount }, (_, i) => sentinelGallery(i))
        : undefined,
    }));
    // Human-readable labels for the history pill (a tracked subset)…
    const changedFields = getChangedFields(body.current, mergedExtracted);
    // …but the "nothing happened" decision compares the ENTIRE object, so an
    // edit to an untracked field (event time, footer, alt text, etc.) is never
    // mislabeled as a no-op.
    const textChanged = stableStringify(mergedExtracted) !== stableStringify(body.current);
    const noChange = !textChanged && !imagesChanged;

    // Only return image data when the layout actually changed — avoids echoing
    // large base64 data URIs back to the client when images are unchanged.
    const images = imagesChanged
      ? { hero: nextHero, secondary: nextSecondary, gallery: nextGallery }
      : null;

    return NextResponse.json({
      ok: true,
      extracted: mergedExtracted,
      html,
      changedFields,
      images,
      imagesChanged,
      refineNote: result.refineNote ?? null,
      noChange,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
