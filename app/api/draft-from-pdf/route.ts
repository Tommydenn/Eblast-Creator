import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { agenticDraftLoop } from "@/lib/agentic-draft";
import { extractFlyerContent } from "@/lib/anthropic";
import { extractImagesFromPdf } from "@/lib/pdf-images";
import { buildEblastHtml } from "@/lib/render-email";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";

export const runtime = "nodejs";
// The agentic loop can take 3 rounds × (refine + review). Bumped from 60 →
// 300 (Vercel Pro max) so we don't 504 mid-loop.
export const maxDuration = 300;

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

  const community = await getCommunity(communitySlug);
  if (!community) {
    return NextResponse.json({ ok: false, error: `Unknown community: ${communitySlug}` }, { status: 404 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ ok: false, error: `Expected application/pdf, got ${file.type}` }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Pull recent sends for this community first — feeds both the initial
  // draft and the critic so the agents have memory.
  const pastSends = await getRecentSendsForCommunity({ communityId: community.id, limit: 12 });

  // Image extraction runs in parallel with the initial draft so the agentic
  // loop has both ready before its first critic review. The critic now looks
  // at the actual images, so they need to exist by then.
  const [imagesResult, initialDraftResult] = await Promise.allSettled([
    extractImagesFromPdf(buffer),
    extractFlyerContent({ pdfBase64: buffer.toString("base64"), community, pastSends }),
  ]);

  if (initialDraftResult.status === "rejected") {
    return NextResponse.json(
      {
        ok: false,
        error: `Initial draft failed: ${initialDraftResult.reason}`,
        step: "initial_draft",
      },
      { status: 500 },
    );
  }

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
            cmykConvertedToSrgb: 0,
            cmykConvertedVia: { mupdf: 0, sharp: 0 },
            cmykConversionFailed: 0,
            imagesByFormat: { jpeg: 0, jpeg2000: 0, flate: 0, ccitt: 0, other: 0 },
            errors: [String((imagesResult as any).reason)],
            imageDetails: [],
          },
        };

  // Run the drafter ↔ critic loop. The critic now sees the images and can
  // flag broken/blank/off-topic ones; the loop drops those slots and
  // re-renders before the next review.
  let loop;
  try {
    loop = await agenticDraftLoop({
      initialDraft: initialDraftResult.value,
      community,
      availableImages: imageRun.images,
      pastSends,
    });
  } catch (e: any) {
    // Log the full stack to the server console so we never have to debug
    // these from a one-line UI error again.
    console.error("[draft-from-pdf] Agent loop threw:", e);
    return NextResponse.json(
      {
        ok: false,
        error: `Agent loop failed: ${e.message ?? String(e)}`,
        step: "loop",
        stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
      },
      { status: 500 },
    );
  }

  const extracted = loop.finalDraft;
  const heroImageUrl = loop.finalImages.heroDataUri;
  const secondaryImageUrl = loop.finalImages.secondaryDataUri;
  const galleryImageUrls = loop.finalImages.galleryDataUris;

  const html = buildEblastHtml(extracted, community, {
    heroImageUrl,
    secondaryImageUrl,
    galleryImageUrls,
  });

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
    review: loop.finalReview,
    agentLoop: {
      stoppedReason: loop.stoppedReason,
      totalRounds: loop.totalRounds,
      imagesExcluded: loop.finalImages.excludedCount,
      iterations: loop.iterations.map((it) => ({
        round: it.round,
        verdict: it.review.verdict,
        summary: it.review.summary,
        findingsCount: it.review.findings.length,
        appliedSuggestions: it.appliedSuggestions ?? [],
        droppedImageSlots: it.droppedImageSlots ?? [],
      })),
    },
    // Echo back the past sends the agents saw this round so the UI can
    // render an "Intelligence applied" panel — proof of memory.
    pastSendsContext: pastSends,
    subjectSpecialist: loop.subjectSpecialist,
  });
}
