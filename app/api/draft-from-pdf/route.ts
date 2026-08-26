import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { generateDraft, TransientDraftError } from "@/lib/generate-draft";
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

  // The pipeline itself lives in lib/generate-draft so the scheduled Planner
  // job runs the identical path rather than a second copy that would drift.
  let generated;
  try {
    generated = await generateDraft({ community, pdf: buffer, notes: notes || undefined });
  } catch (e: any) {
    const transient = e instanceof TransientDraftError;
    if (!transient) console.error("[draft-from-pdf] generation failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error: transient
          ? "Anthropic's API returned a temporary error. Please try generating again — it usually resolves on the next attempt."
          : e?.message ?? String(e),
        step: "draft",
        retryable: transient,
        stack: process.env.NODE_ENV === "development" ? e?.stack : undefined,
      },
      { status: 500 },
    );
  }

  const {
    extracted,
    html,
    heroImageUrl,
    secondaryImageUrl,
    galleryImageUrls,
    heroOriginalUrl,
    secondaryOriginalUrl,
    galleryOriginalUrls,
    allExtractedImageUrls,
    imageCount,
    imageDiagnostic,
    pastSendsContext,
    subjectSpecialist,
  } = generated;

  return NextResponse.json({
    ok: true,
    community: { slug: community.slug, displayName: community.displayName },
    extracted,
    html,
    heroImageUrl,
    secondaryImageUrl,
    galleryImageUrls,
    heroOriginalUrl,
    secondaryOriginalUrl,
    galleryOriginalUrls,
    allExtractedImageUrls,
    imageCount,
    imageDiagnostic,
    // Echo back the past sends the drafter saw this round so the UI can
    // render an "Intelligence applied" panel — proof of memory.
    pastSendsContext,
    subjectSpecialist,
  });
}
