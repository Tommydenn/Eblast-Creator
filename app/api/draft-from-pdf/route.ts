import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { extractFlyerContent } from "@/lib/anthropic";
import { buildEblastHtml } from "@/lib/render-email";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function fileToDataUri(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buf.toString("base64")}`;
}

/**
 * POST multipart/form-data:
 *   - file: the flyer PDF (required)
 *   - communitySlug: which community's brand/voice to use (required)
 *   - heroImage: optional image file used as the hero
 *   - secondaryImage: optional image file used inline in the body
 *
 * Returns: { extracted, html, heroImageUrl, secondaryImageUrl }
 *
 * Note: images are currently embedded as base64 data URIs in the rendered HTML.
 * Fine for preview and HubSpot's editor; we'll move to hosted URLs (Vercel Blob
 * or HubSpot Files) before sending eblasts at scale.
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
  const heroImage = formData.get("heroImage");
  const secondaryImage = formData.get("secondaryImage");

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

  let heroImageUrl: string | undefined;
  let secondaryImageUrl: string | undefined;

  if (heroImage instanceof File && heroImage.size > 0) {
    if (!ACCEPT_IMAGE_TYPES.includes(heroImage.type)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported hero image type: ${heroImage.type}` },
        { status: 415 },
      );
    }
    heroImageUrl = await fileToDataUri(heroImage);
  }

  if (secondaryImage instanceof File && secondaryImage.size > 0) {
    if (!ACCEPT_IMAGE_TYPES.includes(secondaryImage.type)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported secondary image type: ${secondaryImage.type}` },
        { status: 415 },
      );
    }
    secondaryImageUrl = await fileToDataUri(secondaryImage);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buffer.toString("base64");

  try {
    const extracted = await extractFlyerContent({ pdfBase64, community });
    const html = buildEblastHtml(extracted, community, { heroImageUrl, secondaryImageUrl });
    return NextResponse.json({
      ok: true,
      community: { slug: community.slug, displayName: community.displayName },
      extracted,
      html,
      heroImageUrl,
      secondaryImageUrl,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message ?? String(e), step: "extract_or_render" },
      { status: 500 },
    );
  }
}
