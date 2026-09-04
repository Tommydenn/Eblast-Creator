/**
 * Storage rules for a draft's photos (the `draft_image_bank` table).
 *
 * Every photo is held as a base64 data URI in a text column, keyed by an
 * integer index whose sign and value encode what the photo is FOR:
 *
 *   -1  hero, as shown (cropped to the slot)
 *   -2  hero, untouched original (what Reposition re-crops from)
 *   -3  secondary, as shown
 *   -4  secondary, untouched original
 *   -(10 + i*2)  gallery slot i, as shown
 *   -(11 + i*2)  gallery slot i, untouched original
 *   >= 0         the pool of photos pulled from the flyer but not placed
 *
 * Two things in here exist to keep opening a saved draft fast.
 *
 * PHASES. The photos on screen are a small fraction of what a draft stores:
 * on the largest real draft the four visible photos are 1.2 MB out of 17.4 MB,
 * the rest being full-resolution originals and the unplaced flyer pool. Those
 * are only needed once someone repositions a photo or opens the picker, so
 * they load after the visible ones rather than delaying them. See imagePhase().
 *
 * REFERENCES. The same photo is routinely stored more than once in one draft:
 * a photo placed without cropping is byte-identical in its "as shown" and
 * "original" rows, and every placed photo also has an identical copy sitting
 * in the flyer pool it was picked from. Measured across all saved drafts, 37%
 * of stored bytes were exact duplicates. Rather than store the bytes again, a
 * duplicate row holds "ref:<index>" pointing at the row that does. Nothing
 * outside this module ever sees one: resolveImageRefs() expands them on the
 * way out, and callers get plain data URIs exactly as before.
 *
 * A reference always points BACKWARD to an equal-or-earlier phase, so a phase
 * can be resolved as soon as the phases before it have arrived. Callers that
 * load phase by phase must accumulate rows and resolve against everything
 * received so far, which resolveImageRefs() does when given the running set.
 */

export type ImageRow = { idx: number; url: string };

export const IMAGE_REF_PREFIX = "ref:";

/** Which loading phase an index belongs to. Lower loads first. */
export function imagePhase(idx: number): 0 | 1 | 2 {
  if (idx >= 0) return 2; // unplaced flyer pool
  if (idx <= -10) return (Math.abs(idx) - 10) % 2 === 0 ? 0 : 1; // gallery shown / original
  return idx === -1 || idx === -3 ? 0 : 1; // hero/secondary shown / original
}

export type ImagePhaseName = "shown" | "originals" | "pool";

const PHASE_ORDER: ImagePhaseName[] = ["shown", "originals", "pool"];

export function isImagePhaseName(v: unknown): v is ImagePhaseName {
  return typeof v === "string" && (PHASE_ORDER as string[]).includes(v);
}

/**
 * Replace repeated photo data with a reference to the one row that keeps it.
 *
 * The keeper is whichever copy loads earliest (phase first, then lowest
 * index), so a reference never points at a row that arrives later. Input
 * order is preserved; only duplicate `url` values change.
 */
export function dedupeImageRows(rows: ImageRow[]): ImageRow[] {
  const keeperFor = new Map<string, number>();
  // Decide keepers in load order, independently of the order rows came in.
  for (const row of [...rows].sort(
    (a, b) => imagePhase(a.idx) - imagePhase(b.idx) || a.idx - b.idx,
  )) {
    if (!row.url || row.url.startsWith(IMAGE_REF_PREFIX)) continue;
    if (!keeperFor.has(row.url)) keeperFor.set(row.url, row.idx);
  }
  return rows.map((row) => {
    const keeper = keeperFor.get(row.url);
    return keeper === undefined || keeper === row.idx
      ? row
      : { idx: row.idx, url: `${IMAGE_REF_PREFIX}${keeper}` };
  });
}

/**
 * Expand "ref:<index>" rows back into real photo data.
 *
 * `known` lets a caller loading one phase at a time resolve against the rows
 * it already holds. A reference whose target is missing is DROPPED rather
 * than passed through: a caller receiving "ref:-1" as an image URL would put
 * it in an <img src>, turning a recoverable gap into a visibly broken photo.
 */
export function resolveImageRefs(rows: ImageRow[], known: ImageRow[] = []): ImageRow[] {
  const byIdx = new Map<number, string>();
  for (const r of [...known, ...rows]) {
    if (!r.url.startsWith(IMAGE_REF_PREFIX)) byIdx.set(r.idx, r.url);
  }
  const out: ImageRow[] = [];
  for (const row of rows) {
    if (!row.url.startsWith(IMAGE_REF_PREFIX)) {
      out.push(row);
      continue;
    }
    const target = Number(row.url.slice(IMAGE_REF_PREFIX.length));
    const url = Number.isNaN(target) ? undefined : byIdx.get(target);
    if (url) out.push({ idx: row.idx, url });
  }
  return out;
}

// ─── Slot <-> index mapping ────────────────────────────────────────────────

export type SlotImage = { url: string; originalUrl: string } | null;
export type SlotImages = { hero: SlotImage; secondary: SlotImage; gallery: Array<{ url: string; originalUrl: string }> };

/**
 * Flatten a draft's placed photos and flyer pool into storage rows.
 *
 * Shared by every save path so they cannot drift apart on which indices mean
 * what. Empty entries are skipped: a blank string would overwrite a real
 * stored photo with nothing.
 */
export function buildImageRows(images: SlotImages, bank: string[]): ImageRow[] {
  const rows: ImageRow[] = [];
  const add = (idx: number, url?: string) => { if (url) rows.push({ idx, url }); };
  add(-1, images.hero?.url);
  add(-2, images.hero?.originalUrl);
  add(-3, images.secondary?.url);
  add(-4, images.secondary?.originalUrl);
  images.gallery.forEach((g, i) => {
    add(-(10 + i * 2), g.url);
    add(-(11 + i * 2), g.originalUrl);
  });
  bank.forEach((url, i) => add(i, url));
  return rows;
}

/**
 * A neutral grey block used in the PREVIEW ONLY, standing in for a photo that
 * is still downloading so the layout doesn't jump when it lands. It must never
 * reach a real send, which is why buildHtml() only substitutes it when asked.
 */
export const IMAGE_LOADING_PLACEHOLDER =
  "data:image/svg+xml;base64," +
  btoaSafe(
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#e8e3dc"/></svg>`,
  );

function btoaSafe(s: string): string {
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
}
