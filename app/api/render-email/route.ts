import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    extracted: ExtractedFlyer;
    communitySlug: string;
    heroImageUrl?: string;
    secondaryImageUrl?: string;
    galleryImageUrls?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  if (!body.extracted || !body.communitySlug) {
    return NextResponse.json({ ok: false, error: "Missing extracted or communitySlug" }, { status: 400 });
  }

  const community = await getCommunity(body.communitySlug);
  if (!community) {
    return NextResponse.json({ ok: false, error: `Unknown community: ${body.communitySlug}` }, { status: 404 });
  }

  const html = await inlineRelativeImages(buildEblastHtml(body.extracted, community, {
    heroImageUrl: body.heroImageUrl,
    secondaryImageUrl: body.secondaryImageUrl,
    galleryImageUrls: body.galleryImageUrls,
  }));

  return NextResponse.json({ ok: true, html });
}
