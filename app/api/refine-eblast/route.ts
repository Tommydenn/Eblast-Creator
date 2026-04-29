import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { refineFlyerContent } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

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
    return NextResponse.json({ ok: true, extracted: updated, html });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
