import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { refineFlyerContent } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

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
    const updated = await refineFlyerContent({
      current: body.current,
      instruction: body.instruction,
      community,
      pastSends,
    });
    const html = buildEblastHtml(updated, community, {
      heroImageUrl: body.heroImageUrl,
      secondaryImageUrl: body.secondaryImageUrl,
      galleryImageUrls: body.galleryImageUrls,
    });
    const changedFields = getChangedFields(body.current, updated);
    return NextResponse.json({ ok: true, extracted: updated, html, changedFields });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
