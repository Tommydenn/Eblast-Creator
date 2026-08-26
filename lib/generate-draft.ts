/**
 * Turning a flyer (and/or pasted details) into a finished eblast draft.
 *
 * This is the whole generation pipeline, lifted out of the upload route so the
 * scheduled Planner job runs the identical path. Two copies would drift, and a
 * draft the schedule produced would slowly stop matching one you made by hand.
 *
 * Pipeline:
 *   1. Pull the images out of the PDF, ranked for which slot suits them.
 *   2. Send the PDF (and any notes) to Claude for the structured content.
 *   3. Assemble the draft, crop the chosen photos to their slots, render HTML.
 *
 * Images come back as base64 data URIs, and the HTML carries sentinels in
 * their place rather than the bytes, so the payload stays small enough for the
 * callers that push it over HTTP.
 */
import { buildDraft } from "@/lib/build-draft";
import { extractFlyerContent } from "@/lib/anthropic";
import { extractImagesFromPdf, cropDataUriToAspectRatio } from "@/lib/pdf-images";
import { classifyImagesForSlots } from "@/lib/image-selector";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import { SENTINEL_HERO, SENTINEL_SECONDARY, sentinelGallery } from "@/lib/render-sentinels";
import type { Community } from "@/lib/db/queries";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

export interface GeneratedDraft {
  extracted: ExtractedFlyer;
  html: string;
  heroImageUrl?: string;
  secondaryImageUrl?: string;
  galleryImageUrls: Array<string | undefined>;
  heroOriginalUrl?: string;
  secondaryOriginalUrl?: string;
  galleryOriginalUrls: string[];
  allExtractedImageUrls: string[];
  imageCount: number;
  imageDiagnostic: any;
  pastSendsContext: any[];
  subjectSpecialist: any;
}

/** Thrown when Claude fails in a way that's worth retrying later. */
export class TransientDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientDraftError";
  }
}

const EMPTY_DIAGNOSTIC = {
  method: "none" as const,
  totalStreams: 0,
  imageStreams: 0,
  imagesExtracted: 0,
  imagesSkipped: 0,
  cmykConvertedToSrgb: 0,
  cmykConvertedVia: { mupdf: 0, sharp: 0 },
  cmykConversionFailed: 0,
  imagesByFormat: { jpeg: 0, jpeg2000: 0, flate: 0, ccitt: 0, other: 0 },
  errors: [] as string[],
  imageDetails: [] as any[],
};

export async function generateDraft(opts: {
  community: Community;
  /** The flyer. Omitted for a text-only draft. */
  pdf?: Buffer | null;
  /** Free-text event details. */
  notes?: string;
}): Promise<GeneratedDraft> {
  const { community, pdf, notes } = opts;
  if (!pdf && !notes?.trim()) {
    throw new Error("Provide a flyer PDF, pasted event details, or both.");
  }

  // Recent sends for this community, threaded into the drafter as context.
  const pastSends = await getRecentSendsForCommunity({ communityId: community.id, limit: 12 });

  // Image extraction runs alongside the draft so both are ready before slots
  // are assigned. A PDF with no usable images still produces a draft.
  const [imagesResult, initialDraftResult] = await Promise.allSettled([
    pdf ? extractImagesFromPdf(pdf) : Promise.reject(new Error("No PDF — text-only draft")),
    extractFlyerContent({
      pdfBase64: pdf ? pdf.toString("base64") : undefined,
      notes: notes || undefined,
      community,
      pastSends,
    }),
  ]);

  if (initialDraftResult.status === "rejected") {
    const reason = initialDraftResult.reason;
    const status = reason?.status;
    const message = `Initial draft failed: ${reason?.message ?? String(reason)}`;
    if (status === 500 || status === 503 || status === 529) throw new TransientDraftError(message);
    throw new Error(message);
  }

  const imageRun =
    imagesResult.status === "fulfilled"
      ? imagesResult.value
      : { images: [], diagnostic: { ...EMPTY_DIAGNOSTIC, errors: [String((imagesResult as any).reason)] } };

  // Rank images by relevance to the event so the most fitting photo becomes
  // the hero, rather than whichever happened to be largest.
  let rankedImages = imageRun.images;
  try {
    rankedImages = await classifyImagesForSlots(imageRun.images);
  } catch {
    // fall back to area-sorted order
  }

  let loop;
  try {
    loop = await buildDraft({
      initialDraft: initialDraftResult.value,
      community,
      availableImages: rankedImages,
      pastSends,
    });
  } catch (e: any) {
    const isTransient = e?.status === 500 || e?.status === 503 || e?.status === 529;
    const message = `Draft assembly failed: ${e?.message ?? String(e)}`;
    if (isTransient) throw new TransientDraftError(message);
    throw new Error(message);
  }

  const extracted = loop.finalDraft;
  const rawHero = loop.finalImages.heroDataUri;
  const rawSecondary = loop.finalImages.secondaryDataUri;
  const rawGallery = loop.finalImages.galleryDataUris ?? [];

  // Crop to the ratios the email's slots actually use, so the grid reads as
  // deliberate: hero and secondary 16:9, gallery tiles 4:3.
  const [heroImageUrl, secondaryImageUrl, ...galleryImageUrls] = await Promise.all([
    rawHero ? cropDataUriToAspectRatio(rawHero, 16 / 9) : Promise.resolve(undefined as string | undefined),
    rawSecondary ? cropDataUriToAspectRatio(rawSecondary, 16 / 9) : Promise.resolve(undefined as string | undefined),
    ...rawGallery.map((uri) => cropDataUriToAspectRatio(uri, 4 / 3)),
  ]);

  const galleryCount = (galleryImageUrls as Array<string | undefined>).filter(Boolean).length;
  const html = await inlineRelativeImages(
    buildEblastHtml(extracted, community, {
      heroImageUrl: heroImageUrl ? SENTINEL_HERO : undefined,
      secondaryImageUrl: secondaryImageUrl ? SENTINEL_SECONDARY : undefined,
      galleryImageUrls:
        galleryCount > 0 ? Array.from({ length: galleryCount }, (_, i) => sentinelGallery(i)) : undefined,
    }),
  );

  return {
    extracted,
    html,
    heroImageUrl,
    secondaryImageUrl,
    galleryImageUrls: galleryImageUrls as Array<string | undefined>,
    heroOriginalUrl: rawHero,
    secondaryOriginalUrl: rawSecondary,
    galleryOriginalUrls: rawGallery,
    allExtractedImageUrls: rankedImages.map((img) => img.dataUri).filter((u): u is string => !!u),
    imageCount: imageRun.images.length,
    imageDiagnostic: imageRun.diagnostic,
    pastSendsContext: pastSends,
    subjectSpecialist: loop.subjectSpecialist,
  };
}
