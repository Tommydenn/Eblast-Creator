import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { extractFlyerContent } from "@/lib/anthropic";
import { extractImagesFromPdf } from "@/lib/pdf-images";
import { buildEblastHtml } from "@/lib/render-email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST multipart/form-data:
 *   - file: the flyer PDF (required)
 *   - communitySlug: which community's brand/voice to use (required)
 *
 * Returns: { extracted, html, heroImageUrl, secondaryImageUrl, imageCount }
 *
 * Pipeline:
 *   1. Walk the PDF's image XObjects → list of base64 data URIs sorted by size.
 *   2. Send PDF text+visuals to Claude → structured ExtractedFlyer.
 *   3. Render HTML using community brand + extracted text + extracted images
 *      (largest → hero, second-largest → inline).
 *
 * Note: extracted images are embedded as base64 data URIs. Fine for preview
 * and HubSpot's editor; we'll move to hosted URLs (Vercel Blob or HubSpot
 * Files) before sending eblasts at scale.
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

  // Run image extraction and Claude content extraction in parallel — both
  // independently consume the PDF buffer.
  const [imagesResult, extractedResult] = await Promise.allSettled([
    extractImagesFromPdf(buffer),
    extractFlyerContent({ pdfBase64: buffer.toString("base64"), community }),
  ]);

  if (extractedResult.status === "rejected") {
    return NextResponse.json(
      { ok: false, error: `Claude extraction failed: ${extractedResult.reason}`, step: "extract" },
      { status: 500 },
    );
  }
  const extracted = extractedResult.value;

  const imageRun =
    imagesResult.status === "fulfilled"
      ? imagesResult.value
      : {
          images: [],
          diagnostic: {
            method: "none" as const,
            totalStreams: 0,
            imageStreams: 0,
            imagesExtracted: 0,
            imagesSkipped: 0,
            imagesByFormat: { jpeg: 0, jpeg2000: 0, flate: 0, ccitt: 0, other: 0 },
            errors: [String((imagesResult as any).reason)],
            imageDetails: [],
          },
        };

  const heroImageUrl = imageRun.images[0]?.dataUri;
  const secondaryImageUrl = imageRun.images[1]?.dataUri;
  const galleryImageUrls = imageRun.images.slice(2, 6).map((i) => i.dataUri);

  const html = buildEblastHtml(extracted, community, { heroImageUrl, secondaryImageUrl, galleryImageUrls });

  return NextResponse.json({
    ok: true,
    community: { slug: community.slug, displayName: community.displayName },
    extracted,
    html,
    heroImageUrl,
    secondaryImageUrl,
    galleryImageUrls,
    imageCount: imageRun.images.length,
    imageDiagnostic: imageRun.diagnostic,
  });
}
