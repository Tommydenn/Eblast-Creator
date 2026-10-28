import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { refineFlyerContent } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { SENTINEL_HERO, SENTINEL_SECONDARY, sentinelGallery } from "@/lib/render-sentinels";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import { withParagraphSpacing } from "@/lib/extracted-flyer";
import { boundToSection, isEblastSection, sectionScopeInstruction } from "@/lib/eblast-sections";

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
  /**
   * The section the user is working in, or absent for the whole email.
   *
   * Narrows what the instruction is taken to mean — "make it shorter" means
   * something different in the Hero than in the Footer — and bounds what the
   * answer is allowed to touch.
   */
  section?: string;
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

    const section = isEblastSection(body.section) ? body.section : null;

    const result = await refineFlyerContent({
      current: body.current,
      instruction: body.instruction,
      community,
      pastSends,
      sectionScope: section ? sectionScopeInstruction(section) : undefined,
    });

    // Merge onto the prior draft so any field the model omitted is preserved
    // (the model is told to return the full object and to set "" to clear a
    // field, so explicit clears still work; omissions never silently drop data).
    const mergedExtracted: ExtractedFlyer = { ...body.current, ...result.flyer };

    // The model returns paragraphs with no blank line between them. Put the
    // spacing back only when it actually rewrote the body — a body it left
    // alone keeps whatever spacing the writer gave it.
    if (result.flyer.bodyParagraphs) {
      mergedExtracted.bodyParagraphs = withParagraphSpacing(result.flyer.bodyParagraphs);
    }
    // Working in a section means changes land in that section.
    const bounded = boundToSection(
      body.current as unknown as Record<string, unknown>,
      mergedExtracted as unknown as Record<string, unknown>,
      section,
    ) as unknown as ExtractedFlyer;

    // Photos are not the AI's to touch. It used to be able to reorder,
    // remove, swap and re-crop them when asked, and that is now done by hand
    // in the Images tab, where what happens is visible and undoing it is a
    // matter of picking the old photo again rather than hoping a refinement
    // put it back.
    const nextHero = body.heroImageUrl;
    const nextSecondary = body.secondaryImageUrl;
    const nextGallery = body.galleryImageUrls ?? [];
    const imagesChanged = false;

    // Return sentinel HTML — no image data URIs embedded. The client injects
    // images from the `images` field (or its own current state) after receiving.
    const galleryCount = nextGallery.length;
    const html = await inlineRelativeImages(buildEblastHtml(bounded, community, {
      heroImageUrl: nextHero ? SENTINEL_HERO : undefined,
      secondaryImageUrl: nextSecondary ? SENTINEL_SECONDARY : undefined,
      galleryImageUrls: galleryCount > 0
        ? Array.from({ length: galleryCount }, (_, i) => sentinelGallery(i))
        : undefined,
    }));
    // Human-readable labels for the history pill (a tracked subset)…
    const changedFields = getChangedFields(body.current, bounded);
    // …but the "nothing happened" decision compares the ENTIRE object, so an
    // edit to an untracked field (event time, footer, alt text, etc.) is never
    // mislabeled as a no-op.
    const textChanged = stableStringify(bounded) !== stableStringify(body.current);
    const noChange = !textChanged && !imagesChanged;

    // Only return image data when the layout actually changed — avoids echoing
    // large base64 data URIs back to the client when images are unchanged.
    const images = imagesChanged
      ? { hero: nextHero, secondary: nextSecondary, gallery: nextGallery }
      : null;

    return NextResponse.json({
      ok: true,
      extracted: bounded,
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
