import { db } from "@/lib/db";
import { draftImageBank } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildEblastHtml } from "@/lib/render-email";
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
export async function loadDraftImageUrls(draftId: string): Promise<{
  heroImageUrl?: string;
  secondaryImageUrl?: string;
  galleryImageUrls: string[];
}> {
  const rows = await db
    .select({ idx: draftImageBank.idx, url: draftImageBank.url })
    .from(draftImageBank)
    .where(eq(draftImageBank.draftId, draftId));

  const byIdx = new Map(rows.map((r) => [r.idx, r.url]));
  const gallery: string[] = [];
  for (let i = 0; ; i++) {
    const url = byIdx.get(-(10 + i * 2));
    if (!url) break;
    gallery.push(url);
  }

  return {
    heroImageUrl: byIdx.get(-1) || undefined,
    secondaryImageUrl: byIdx.get(-3) || undefined,
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
  const images = await loadDraftImageUrls(draftId);
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
