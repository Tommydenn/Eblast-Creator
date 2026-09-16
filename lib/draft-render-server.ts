import { db } from "@/lib/db";
import { draftImageBank } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildEblastHtml } from "@/lib/render-email";
import { resolveImageRefs } from "@/lib/image-bank";
import type { Community } from "@/lib/db/queries";

/**
 * Reload a saved draft's image URLs from draft_image_bank.
 *
 * A saved draft's `data.images` is NOT a usable source: buildDraftPayload()
 * in DraftContext deliberately strips every URL to "" before POSTing (the
 * data URIs are multi-MB and would blow Vercel's 4.5 MB body limit), and the
 * real image data goes to /api/saved-drafts/[id]/images instead. Anything
 * server-side that re-renders a draft has to read it back from here, or it
 * renders an eblast with no photos at all.
 *
 * Negative-index convention, mirroring saveImagesForDraft():
 *   hero.url -1, hero.originalUrl -2, secondary.url -3, secondary.originalUrl -4,
 *   gallery[i].url -(10+i*2), gallery[i].originalUrl -(11+i*2).
 * Non-negative indices are imageBank entries and are not part of the render.
 */
export interface RecordedSlots {
  hero?: unknown;
  secondary?: unknown;
  gallery?: unknown[];
}

export async function loadDraftImageUrls(
  draftId: string,
  recorded?: RecordedSlots | null,
): Promise<{
  heroImageUrl?: string;
  secondaryImageUrl?: string;
  galleryImageUrls: string[];
}> {
  const rows = await db
    .select({ idx: draftImageBank.idx, url: draftImageBank.url })
    .from(draftImageBank)
    .where(eq(draftImageBank.draftId, draftId));

  // A photo stored once and pointed at from its other rows arrives here as a
  // "ref:<idx>" pointer — expand those before any URL is read out.
  const byIdx = new Map(resolveImageRefs(rows).map((r) => [r.idx, r.url]));

  // WHICH photos the eblast has is decided by the draft, not by whatever is
  // left lying in the bank.
  //
  // Bank rows are only ever added or overwritten, never removed, so a photo
  // taken out of an eblast keeps its row. Reading the gallery by walking the
  // bank until a gap therefore brought every removed photo back — and only
  // in the pushed email, because the approval email is rendered from what is
  // actually on screen. Someone would approve an eblast with two photos and
  // HubSpot would receive four.
  //
  // The draft's own images record is the authority: buildDraftPayload writes
  // it from the live slots (null for an empty one, one entry per gallery
  // photo) and only after the photos have finished loading, so it says what
  // the eblast holds even though the URLs in it are blanked. A draft too old
  // to have that record keeps the previous behaviour.
  const hasRecord = !!recorded && Array.isArray(recorded.gallery);
  const keepHero = !hasRecord || recorded!.hero != null;
  const keepSecondary = !hasRecord || recorded!.secondary != null;
  const galleryLimit = hasRecord ? recorded!.gallery!.length : Number.POSITIVE_INFINITY;

  const gallery: string[] = [];
  for (let i = 0; i < galleryLimit; i++) {
    const url = byIdx.get(-(10 + i * 2));
    if (!url) break;
    gallery.push(url);
  }

  return {
    heroImageUrl: (keepHero ? byIdx.get(-1) : undefined) || undefined,
    secondaryImageUrl: (keepSecondary ? byIdx.get(-3) : undefined) || undefined,
    galleryImageUrls: gallery,
  };
}

/**
 * Re-render a saved draft's eblast HTML server-side, against the community's
 * CURRENT brand/senders (so Community-page edits made after an approval email
 * went out still land in what gets pushed) and with its images restored from
 * draft_image_bank.
 *
 * Returns "" for legacy drafts that have no `.fields` — callers fall back to
 * whatever raw HTML snapshot they hold.
 */
export async function renderSavedDraftHtml(
  draftId: string,
  draftData: Record<string, any> | undefined,
  community: Community,
): Promise<string> {
  if (!draftData?.fields) return "";
  const images = await loadDraftImageUrls(draftId, draftData.images as RecordedSlots | undefined);
  return buildEblastHtml(draftData.fields, community, images);
}

/**
 * The 1–3 word event category ("Open House", "Information Session") that
 * generateHubspotEmailName() uses to name the email in HubSpot. It lives on
 * ExtractedFlyer, i.e. `data.fields` — `data.extracted` is the legacy location.
 */
export function draftEventCategory(draftData: Record<string, any> | undefined): string | undefined {
  return (draftData?.fields ?? draftData?.extracted)?.eventCategory;
}
