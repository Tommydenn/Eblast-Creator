"use server";

import { getCommunity } from "@/data/communities";
import { agenticDraftLoop } from "@/lib/agentic-draft";
import { extractFlyerContent } from "@/lib/anthropic";
import { extractImagesFromPdf, cropDataUriToAspectRatio } from "@/lib/pdf-images";
import { rankImagesByRelevance } from "@/lib/image-selector";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import { SENTINEL_HERO, SENTINEL_SECONDARY, sentinelGallery } from "@/lib/render-sentinels";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

// Server Actions receive FormData via Next.js's built-in body handling, which
// respects the experimental.serverActions.bodySizeLimit in next.config.js
// (currently 20 MB). This bypasses Vercel's default 4.5 MB Route Handler
// limit, allowing real-world flyer PDFs to be uploaded without 413 errors.

type ActionResult =
  | {
      ok: true;
      community: { slug: string; displayName: string };
      extracted: ExtractedFlyer;
      html: string;
      heroImageUrl?: string;
      secondaryImageUrl?: string;
      galleryImageUrls: string[];
      heroOriginalUrl?: string;
      secondaryOriginalUrl?: string;
      galleryOriginalUrls: string[];
      allExtractedImageUrls: string[];
      imageCount: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      imageDiagnostic: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      review: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agentLoop: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pastSendsContext: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subjectSpecialist: any;
    }
  | {
      ok: false;
      error: string;
      step?: string;
      retryable?: boolean;
    };

export async function draftFromPdfAction(formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  const communitySlug = formData.get("communitySlug");

  if (!(file instanceof File)) {
    return { ok: false, error: "No PDF file uploaded under field 'file'" };
  }
  if (typeof communitySlug !== "string") {
    return { ok: false, error: "Missing communitySlug" };
  }

  const community = await getCommunity(communitySlug);
  if (!community) {
    return { ok: false, error: `Unknown community: ${communitySlug}` };
  }

  if (file.type !== "application/pdf") {
    return { ok: false, error: `Expected application/pdf, got ${file.type}` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const pastSends = await getRecentSendsForCommunity({ communityId: community.id, limit: 12 });

  // Image extraction and initial draft run in parallel.
  const [imagesResult, initialDraftResult] = await Promise.allSettled([
    extractImagesFromPdf(buffer),
    extractFlyerContent({ pdfBase64: buffer.toString("base64"), community, pastSends }),
  ]);

  if (initialDraftResult.status === "rejected") {
    return {
      ok: false,
      error: `Initial draft failed: ${initialDraftResult.reason}`,
      step: "initial_draft",
    };
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
            errors: [String((imagesResult as PromiseRejectedResult).reason)],
            imageDetails: [],
          },
        };

  let rankedImages = imageRun.images;
  try {
    rankedImages = await rankImagesByRelevance(imageRun.images, initialDraftResult.value);
  } catch {
    // fall back to area-sorted order
  }

  let loop;
  try {
    loop = await agenticDraftLoop({
      initialDraft: initialDraftResult.value,
      community,
      availableImages: rankedImages,
      pastSends,
    });
  } catch (e: any) {
    console.error("[draft-from-pdf action] Agent loop threw:", e);
    const isTransient = e?.status === 500 || e?.status === 503 || e?.status === 529;
    return {
      ok: false,
      error: isTransient
        ? "Anthropic's API returned a temporary error. Please try generating again — it usually resolves on the next attempt."
        : `Agent loop failed: ${e.message ?? String(e)}`,
      step: "loop",
      retryable: isTransient,
    };
  }

  const extracted = loop.finalDraft;
  const rawHero = loop.finalImages.heroDataUri;
  const rawSecondary = loop.finalImages.secondaryDataUri;
  const rawGallery = loop.finalImages.galleryDataUris ?? [];

  const [heroImageUrl, secondaryImageUrl, ...galleryRaw] = await Promise.all([
    rawHero ? cropDataUriToAspectRatio(rawHero, 16 / 9) : Promise.resolve(undefined as string | undefined),
    rawSecondary ? cropDataUriToAspectRatio(rawSecondary, 16 / 9) : Promise.resolve(undefined as string | undefined),
    ...rawGallery.map((uri) => cropDataUriToAspectRatio(uri, 4 / 3)),
  ]);
  const galleryImageUrls = galleryRaw.filter((u): u is string => !!u);

  // Use sentinel placeholders in the HTML. The client injects the actual image
  // data URIs (returned as separate fields) after receiving the response, so
  // they aren't duplicated in the response body.
  const galleryCount = galleryImageUrls.length;
  const html = await inlineRelativeImages(
    buildEblastHtml(extracted, community, {
      heroImageUrl: heroImageUrl ? SENTINEL_HERO : undefined,
      secondaryImageUrl: secondaryImageUrl ? SENTINEL_SECONDARY : undefined,
      galleryImageUrls:
        galleryCount > 0
          ? Array.from({ length: galleryCount }, (_, i) => sentinelGallery(i))
          : undefined,
    }),
  );

  const allExtractedImageUrls: string[] = rankedImages
    .map((img) => img.dataUri)
    .filter((u): u is string => !!u);

  const finalReview = community.trackingPhone
    ? loop.finalReview
    : {
        ...loop.finalReview,
        findings: [
          ...loop.finalReview.findings,
          {
            severity: "important" as const,
            category: "cta" as const,
            issue: "No CallRail tracking number set — CTA links to the flyer's phone instead of a tracked line.",
            rationale: "Add a trackingPhone to this community's record to enable call attribution.",
          },
        ],
      };

  return {
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
    review: finalReview,
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
    pastSendsContext: pastSends,
    subjectSpecialist: loop.subjectSpecialist,
  };
}
