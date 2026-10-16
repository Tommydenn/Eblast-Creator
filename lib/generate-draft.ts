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
import { extractImagesFromPdf, cropDataUriToAspectRatio, downscaleForStorage } from "@/lib/pdf-images";
import { classifyImagesForSlots } from "@/lib/image-selector";
import { buildEblastHtml } from "@/lib/render-email";
import { inlineRelativeImages } from "@/lib/inline-images";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";
import { SENTINEL_HERO, SENTINEL_SECONDARY, sentinelGallery } from "@/lib/render-sentinels";
import type { Community } from "@/lib/db/queries";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import { withParagraphSpacing } from "@/lib/extracted-flyer";
import {
  SECTION_COLOR_FIELDS,
  COLORABLE_TEXT_FIELDS,
  singleTextColor,
  withTextColor,
} from "@/lib/eblast-defaults";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";

/**
 * The colours this community's last eblast was left in.
 *
 * Colour is a standing choice, not a per-send one: a community that had its
 * hero turned burgundy wants the next one burgundy too, and redoing it every
 * time is the work this saves. Scoped to the exact community — The Glenn
 * Hopkins and The Glenn West St Paul share a brand and nothing else, so one
 * never inherits from the other.
 *
 * Section and button colours carry as they are. A text colour carries only
 * where the whole field wears one: a line with a word picked out in another
 * colour has no single colour to carry, and one with any uncoloured text is
 * partly the template's own, so both start again from the default.
 *
 * Nothing here is allowed to fail a draft. A community with no previous eblast
 * — or a lookup that goes wrong — simply starts from the brand's defaults.
 *
 * Exported so scripts/check-color-inheritance.ts can run it against the drafts
 * actually on file, rather than against a mock of them.
 */
export async function colorsFromLastEblast(
  communitySlug: string,
  draft: ExtractedFlyer,
): Promise<Partial<ExtractedFlyer>> {
  try {
    // The last eblast this community actually sent, not merely the last one
    // written. A colour is carried forward because somebody chose it and kept
    // it; a draft still being worked on has not been kept yet, and a pending
    // one sitting above it would otherwise hide the real answer.
    const [previous] = await db
      .select({ data: savedDrafts.data })
      .from(savedDrafts)
      .where(
        and(
          eq(savedDrafts.communitySlug, communitySlug),
          isNull(savedDrafts.deletedAt),
          or(isNotNull(savedDrafts.pushedAt), isNotNull(savedDrafts.approvedAt)),
        ),
      )
      .orderBy(desc(savedDrafts.savedAt))
      .limit(1);
    if (!previous) return {};

    const raw = typeof previous.data === "string" ? JSON.parse(previous.data) : previous.data;
    const fields = (raw?.fields ?? {}) as Record<string, unknown>;
    const carried: Record<string, unknown> = {};

    for (const key of SECTION_COLOR_FIELDS) {
      const value = fields[key];
      if (typeof value === "string" && value.trim()) carried[key] = value;
    }

    for (const key of COLORABLE_TEXT_FIELDS) {
      const previousValue = fields[key];
      // The body is paragraphs, and carries a colour only when every one of
      // them is written in the same single colour.
      if (key === "bodyParagraphs") {
        const paragraphs = Array.isArray(previousValue) ? (previousValue as string[]) : null;
        if (!paragraphs?.length) continue;
        const written = paragraphs.filter((p) => stripHtmlText(p) !== "");
        if (!written.length) continue;
        const colors = written.map((p) => singleTextColor(p));
        if (colors.some((c) => c === null) || new Set(colors).size !== 1) continue;
        const next = draft.bodyParagraphs ?? [];
        if (!next.length) continue;
        carried[key] = next.map((p) => (stripHtmlText(p) === "" ? p : withTextColor(p, colors[0]!)));
        continue;
      }
      if (typeof previousValue !== "string") continue;
      const color = singleTextColor(previousValue);
      if (!color) continue;
      const next = (draft as unknown as Record<string, unknown>)[key];
      if (typeof next !== "string" || !stripHtmlText(next)) continue;
      carried[key] = withTextColor(next, color);
    }

    return carried as Partial<ExtractedFlyer>;
  } catch {
    return {};
  }
}

/** The readable text of a field, for telling an empty one from a written one. */
function stripHtmlText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
}

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

  const withSpacing: ExtractedFlyer = {
    ...loop.finalDraft,
    bodyParagraphs: withParagraphSpacing(loop.finalDraft.bodyParagraphs ?? []),
  };
  // Picked up last, over a draft that is otherwise finished, so a colour
  // carried forward can only ever change a colour.
  const extracted: ExtractedFlyer = {
    ...withSpacing,
    ...(await colorsFromLastEblast(community.slug, withSpacing)),
  };
  // Shrink first, then crop from the shrunk copy.
  //
  // The shrunk copy is what gets stored and what repositioning later re-crops
  // from, so cropping from the same copy keeps the first crop and every later
  // one identical in quality. Full-size flyer photos run to several megabytes
  // each, which is more than a save request can carry.
  const [rawHero, rawSecondary, ...rawGallery] = await Promise.all([
    loop.finalImages.heroDataUri
      ? downscaleForStorage(loop.finalImages.heroDataUri)
      : Promise.resolve(undefined as string | undefined),
    loop.finalImages.secondaryDataUri
      ? downscaleForStorage(loop.finalImages.secondaryDataUri)
      : Promise.resolve(undefined as string | undefined),
    ...(loop.finalImages.galleryDataUris ?? []).map((uri) => downscaleForStorage(uri)),
  ]);

  // Crop to the ratios the email's slots actually use, so the grid reads as
  // deliberate: hero and secondary 16:9, gallery tiles 4:3.
  const [heroImageUrl, secondaryImageUrl, ...galleryImageUrls] = await Promise.all([
    rawHero ? cropDataUriToAspectRatio(rawHero, 16 / 9) : Promise.resolve(undefined as string | undefined),
    rawSecondary ? cropDataUriToAspectRatio(rawSecondary, 16 / 9) : Promise.resolve(undefined as string | undefined),
    ...(rawGallery as string[]).map((uri) => cropDataUriToAspectRatio(uri, 4 / 3)),
  ]);

  // The flyer photos someone can still choose from are stored too, so they are
  // shrunk on the same terms as the ones already placed.
  const pooledImageUrls = await Promise.all(
    rankedImages
      .map((img) => img.dataUri)
      .filter((u): u is string => !!u)
      .map((u) => downscaleForStorage(u)),
  );

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
    galleryOriginalUrls: rawGallery as string[],
    allExtractedImageUrls: pooledImageUrls,
    imageCount: imageRun.images.length,
    imageDiagnostic: imageRun.diagnostic,
    pastSendsContext: pastSends,
    subjectSpecialist: loop.subjectSpecialist,
  };
}
