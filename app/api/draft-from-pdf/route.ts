import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { buildDraft } from "@/lib/build-draft";
import { extractFlyerContent } from "@/lib/anthropic";
import { extractImagesFromPdf, cropDataUriToAspectRatio } from "@/lib/pdf-images";
import { classifyImagesForSlots } from "@/lib/image-selector";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import { SENTINEL_HERO, SENTINEL_SECONDARY, sentinelGallery } from "@/lib/render-sentinels";
import { db } from "@/lib/db";
import { pdfChunks } from "@/lib/db/schema";

export const runtime = "nodejs";
// A draft is one Claude call plus the subject specialist; 300s (Vercel Pro
// max) leaves ample headroom.
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
  const uploadId = formData.get("uploadId");
  const communitySlug = formData.get("communitySlug");
  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() : "";

  if (typeof communitySlug !== "string") {
    return NextResponse.json({ ok: false, error: "Missing communitySlug" }, { status: 400 });
  }

  const community = await getCommunity(communitySlug);
  if (!community) {
    return NextResponse.json({ ok: false, error: `Unknown community: ${communitySlug}` }, { status: 404 });
  }

  // A draft can come from a flyer PDF, from pasted event details, or both.
  // With no PDF there are no images to extract, so the loop runs text-only.
  let buffer: Buffer | null = null;

  if (typeof uploadId === "string") {
    // Large PDF was uploaded in chunks — reassemble from DB.
    const chunks = await db
      .select()
      .from(pdfChunks)
      .where(eq(pdfChunks.uploadId, uploadId))
      .orderBy(asc(pdfChunks.chunkIndex));

    if (chunks.length === 0) {
      return NextResponse.json({ ok: false, error: "Upload not found or expired — please try again." }, { status: 404 });
    }
    if (chunks.length !== chunks[0].totalChunks) {
      return NextResponse.json(
        { ok: false, error: `Incomplete upload: received ${chunks.length} of ${chunks[0].totalChunks} chunks.` },
        { status: 400 },
      );
    }
    buffer = Buffer.concat(chunks.map((c) => Buffer.from(c.data, "base64")));
    // Clean up chunks — no need to await.
    db.delete(pdfChunks).where(eq(pdfChunks.uploadId, uploadId)).catch(() => null);
  } else if (file instanceof File) {
    if (file.type !== "application/pdf") {
      return NextResponse.json({ ok: false, error: `Expected application/pdf, got ${file.type}` }, { status: 415 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (!notes) {
    return NextResponse.json(
      { ok: false, error: "Provide a flyer PDF, pasted event details, or both." },
      { status: 400 },
    );
  }

  // Recent sends for this community, threaded into the drafter as context.
  const pastSends = await getRecentSendsForCommunity({ communityId: community.id, limit: 12 });

  // Image extraction runs in parallel with the draft so both are ready before
  // slots are assigned.
  const [imagesResult, initialDraftResult] = await Promise.allSettled([
    buffer ? extractImagesFromPdf(buffer) : Promise.reject(new Error("No PDF — text-only draft")),
    extractFlyerContent({
      pdfBase64: buffer ? buffer.toString("base64") : undefined,
      notes: notes || undefined,
      community,
      pastSends,
    }),
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

  // Rank images by relevance to the event before entering the loop so the
  // most contextually appropriate photo becomes hero rather than whichever
  // happened to have the largest pixel area. Failures fall back gracefully.
  let rankedImages = imageRun.images;
  try {
    rankedImages = await classifyImagesForSlots(imageRun.images);
  } catch {
    // fall back to area-sorted order
  }

  // Single pass: the drafter's output stands as written. There is no reviewer.
  let loop;
  try {
    loop = await buildDraft({
      initialDraft: initialDraftResult.value,
      community,
      availableImages: rankedImages,
      pastSends,
    });
  } catch (e: any) {
    console.error("[draft-from-pdf] Draft assembly threw:", e);
    const isTransient = e?.status === 500 || e?.status === 503 || e?.status === 529;
    return NextResponse.json(
      {
        ok: false,
        error: isTransient
          ? "Anthropic's API returned a temporary error. Please try generating again — it usually resolves on the next attempt."
          : `Draft assembly failed: ${e.message ?? String(e)}`,
        step: "draft",
        retryable: isTransient,
        stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
      },
      { status: 500 },
    );
  }

  const extracted = loop.finalDraft;
  const rawHero = loop.finalImages.heroDataUri;
  const rawSecondary = loop.finalImages.secondaryDataUri;
  const rawGallery = loop.finalImages.galleryDataUris ?? [];

  // Crop all images to consistent aspect ratios so the email grid looks intentional.
  // Hero + secondary → 16:9 (matches the 600×338 / 528×297 HTML slots).
  // Gallery tiles → 4:3 (classic photography proportion, works at any column count).
  const [heroImageUrl, secondaryImageUrl, ...galleryImageUrls] = await Promise.all([
    rawHero ? cropDataUriToAspectRatio(rawHero, 16 / 9) : Promise.resolve(undefined as string | undefined),
    rawSecondary ? cropDataUriToAspectRatio(rawSecondary, 16 / 9) : Promise.resolve(undefined as string | undefined),
    ...rawGallery.map((uri) => cropDataUriToAspectRatio(uri, 4 / 3)),
  ]);

  // Use sentinel placeholders — images are returned as separate fields and
  // injected client-side, so they aren't duplicated inside the HTML blob.
  const galleryCount = (galleryImageUrls as (string | undefined)[]).filter(Boolean).length;
  const html = await inlineRelativeImages(buildEblastHtml(extracted, community, {
    heroImageUrl: heroImageUrl ? SENTINEL_HERO : undefined,
    secondaryImageUrl: secondaryImageUrl ? SENTINEL_SECONDARY : undefined,
    galleryImageUrls: galleryCount > 0
      ? Array.from({ length: galleryCount }, (_, i) => sentinelGallery(i))
      : undefined,
  }));

  // All original (pre-crop) ranked images — passed to the refine tool so the
  // AI can reference them for fresh crops, and shown in the image bank so the
  // user can swap images with full control over crop focus.
  const allExtractedImageUrls: string[] = rankedImages
    .map((img) => img.dataUri)
    .filter((u): u is string => !!u);

  return NextResponse.json({
    ok: true,
    community: { slug: community.slug, displayName: community.displayName },
    extracted,
    html,
    heroImageUrl,
    secondaryImageUrl,
    galleryImageUrls,
    heroOriginalUrl: rawHero,
    secondaryOriginalUrl: rawSecondary,
    galleryOriginalUrls: rawGallery,
    allExtractedImageUrls,
    imageCount: imageRun.images.length,
    imageDiagnostic: imageRun.diagnostic,
    // Echo back the past sends the drafter saw this round so the UI can
    // render an "Intelligence applied" panel — proof of memory.
    pastSendsContext: pastSends,
    subjectSpecialist: loop.subjectSpecialist,
  });
}
