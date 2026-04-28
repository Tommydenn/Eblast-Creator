import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { extractFlyerContent } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";

export const runtime = "nodejs";
export const maxDuration = 60; // PDF extraction can take 20–40s

/**
 * POST multipart/form-data:
 *   - file: the flyer PDF
 *   - communitySlug: which community's brand/voice to use
 *
 * Returns: { extracted, html } — the structured fields and rendered HTML.
 * The client previews and edits, then POSTs to /api/push-eblast to send.
 */
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Bad form data: ${e.message}` }, { status: 400 });
  }

  const file = formData.get("file");
  const communitySlug = formData.get("communitySlug");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No PDF file uploaded under field 'file'" }, { status: 400 });
  }
  if (typeof communitySlug !== "string") {
    return NextResponse.json({ ok: false, error: "Missing communitySlug" }, { status: 400 });
  }

  const community = getCommunity(communitySlug);
  if (!community) {
    return NextResponse.json({ ok: false, error: `Unknown community: ${communitySlug}` }, { status: 404 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ ok: false, error: `Expected application/pdf, got ${file.type}` }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buffer.toString("base64");

  try {
    const extracted = await extractFlyerContent({ pdfBase64, community });
    const html = buildEblastHtml(extracted, community);
    return NextResponse.json({
      ok: true,
      community: { slug: community.slug, displayName: community.displayName },
      extracted,
      html,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message ?? String(e), step: "extract_or_render" },
      { status: 500 },
    );
  }
}
