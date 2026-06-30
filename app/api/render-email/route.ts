import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { SENTINEL_HERO, SENTINEL_SECONDARY, sentinelGallery } from "@/lib/render-sentinels";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

export const runtime = "nodejs";

// Accepts boolean presence flags instead of actual image data URIs.
// Large base64 images are never sent to this endpoint — the client injects
// them into the returned HTML template after receiving it.
export async function POST(req: NextRequest) {
  let body: {
    extracted: ExtractedFlyer;
    communitySlug: string;
    hasHero?: boolean;
    hasSecondary?: boolean;
    galleryCount?: number;
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

  const galleryCount = body.galleryCount ?? 0;
  const html = await inlineRelativeImages(buildEblastHtml(body.extracted, community, {
    heroImageUrl: body.hasHero ? SENTINEL_HERO : undefined,
    secondaryImageUrl: body.hasSecondary ? SENTINEL_SECONDARY : undefined,
    galleryImageUrls: galleryCount > 0
      ? Array.from({ length: galleryCount }, (_, i) => sentinelGallery(i))
      : undefined,
  }));

  return NextResponse.json({ ok: true, html });
}
