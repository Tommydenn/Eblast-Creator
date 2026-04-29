import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { reviewDraft } from "@/lib/critic";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  extracted: ExtractedFlyer;
  communitySlug: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  if (!body.extracted || !body.communitySlug) {
    return NextResponse.json(
      { ok: false, error: "Missing extracted or communitySlug" },
      { status: 400 },
    );
  }

  const community = await getCommunity(body.communitySlug);
  if (!community) {
    return NextResponse.json(
      { ok: false, error: `Unknown community: ${body.communitySlug}` },
      { status: 404 },
    );
  }

  try {
    const review = await reviewDraft({ flyer: body.extracted, community });
    return NextResponse.json({ ok: true, review });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
