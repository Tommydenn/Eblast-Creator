/**
 * The photos available for one Facebook event.
 *
 * They come out of the flyer, which is where the originals are. The eblast's
 * image bank was the first source and it was the wrong one: the bank holds
 * the crops the editor made from those originals, so one photograph arrived
 * as five slightly different pictures. The flyer's own embedded images are
 * each in there once.
 *
 * Nothing is cropped on the way out. Facebook and Further both crop on
 * upload and show you what they are doing while you do it, so cutting one
 * first only takes the choice away.
 *
 * Gathering means reading a PDF, which is slow enough to notice, so the
 * previews are kept in fb_event_photos and the reading happens once.
 */
import { db } from "@/lib/db";
import { draftImageBank, fbEventPhotos, fbEventTasks, savedDrafts } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { extractImagesFromPdf } from "@/lib/pdf-images";
import { flyerFor } from "@/lib/fb-event-source";

export interface EventPhoto {
  bytes: Buffer;
  width: number;
  height: number;
  source: "flyer" | "hero" | "bank";
}

/** Below this an image is a logo, an icon or a QR code, not a photo. */
const MIN_AREA = 120_000;
/** No flyer has more than a handful worth offering, and the strip has to fit. */
const MAX_PHOTOS = 10;
/** Wide enough to look at, small enough to keep a few hundred of. */
const PREVIEW_WIDTH = 900;

function bytesOf(dataUrl: string | null | undefined): Buffer | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl ?? "");
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

/**
 * A fingerprint that survives re-encoding but not a different picture.
 *
 * The classic average hash: shrink to 8×8 grey, then one bit per pixel for
 * whether it is above the mean. Two files that are the same photograph saved
 * twice come out identical; two different photographs do not.
 */
async function fingerprint(bytes: Buffer): Promise<string> {
  const raw = await sharp(bytes).greyscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  let bits = "";
  for (const v of raw) bits += v > mean ? "1" : "0";
  return bits;
}

function differentEnough(a: string, b: string): boolean {
  let apart = 0;
  for (let i = 0; i < a.length && apart <= 6; i++) if (a[i] !== b[i]) apart++;
  return apart > 6;
}

/** Every photo worth offering, largest first. */
export async function collectPhotos(taskId: string): Promise<EventPhoto[]> {
  const found: EventPhoto[] = [];

  const pdf = await flyerFor(taskId);
  if (pdf) {
    const { images } = await extractImagesFromPdf(pdf);
    for (const image of images) {
      if (image.area < MIN_AREA) continue;
      const bytes = bytesOf(image.dataUri);
      if (bytes) found.push({ bytes, width: image.width, height: image.height, source: "flyer" });
    }
  }

  // Only when there is no flyer at all. These are the editor's crops, so
  // they repeat each other — better than nothing, worse than the originals.
  if (found.length === 0) {
    const [task] = await db
      .select({ draftId: fbEventTasks.savedDraftId })
      .from(fbEventTasks)
      .where(eq(fbEventTasks.taskId, taskId))
      .limit(1);
    if (task?.draftId) {
      const [draft] = await db
        .select({ data: savedDrafts.data })
        .from(savedDrafts)
        .where(eq(savedDrafts.id, task.draftId))
        .limit(1);
      const hero = (draft?.data as { images?: { hero?: { url?: string } | string | null } })?.images?.hero;
      const heroUrl =
        typeof hero === "string" ? hero : hero && typeof hero === "object" ? hero.url ?? null : null;
      const heroBytes = bytesOf(heroUrl);
      if (heroBytes) {
        const meta = await sharp(heroBytes).metadata();
        found.push({ bytes: heroBytes, width: meta.width ?? 0, height: meta.height ?? 0, source: "hero" });
      }
      const bank = await db
        .select({ url: draftImageBank.url })
        .from(draftImageBank)
        .where(eq(draftImageBank.draftId, task.draftId))
        .orderBy(asc(draftImageBank.idx));
      for (const row of bank) {
        const bytes = bytesOf(row.url);
        if (!bytes) continue;
        try {
          const meta = await sharp(bytes).metadata();
          const width = meta.width ?? 0;
          const height = meta.height ?? 0;
          if (width * height >= MIN_AREA) found.push({ bytes, width, height, source: "bank" });
        } catch {
          // Not readable as an image; skip it.
        }
      }
    }
  }

  found.sort((a, b) => b.width * b.height - a.width * a.height);

  const kept: EventPhoto[] = [];
  const hashes: string[] = [];
  for (const photo of found) {
    if (kept.length >= MAX_PHOTOS) break;
    let hash: string;
    try {
      hash = await fingerprint(photo.bytes);
    } catch {
      continue;
    }
    if (hashes.every((h) => differentEnough(h, hash))) {
      hashes.push(hash);
      kept.push(photo);
    }
  }
  return kept;
}

export interface StoredPhoto {
  index: number;
  width: number;
  height: number;
  source: string;
  /** A data URI about 900px wide: what the page shows and picks from. */
  preview: string;
}

/** What is already on file for this event, in order. */
export async function storedPhotos(taskId: string): Promise<StoredPhoto[]> {
  const rows = await db
    .select()
    .from(fbEventPhotos)
    .where(eq(fbEventPhotos.taskId, taskId))
    .orderBy(asc(fbEventPhotos.idx));
  return rows.map((r) => ({
    index: r.idx,
    width: r.width,
    height: r.height,
    source: r.source,
    preview: r.preview,
  }));
}

/**
 * Read the flyer and keep what it finds.
 *
 * Done once, when the event's copy is written, so that by the time anybody
 * opens the page the photos are a database read rather than a PDF parse.
 */
export async function cachePhotos(taskId: string): Promise<StoredPhoto[]> {
  const photos = await collectPhotos(taskId);
  await db.delete(fbEventPhotos).where(eq(fbEventPhotos.taskId, taskId));
  if (photos.length === 0) return [];

  const rows = await Promise.all(
    photos.map(async (p, idx) => {
      const jpeg = await sharp(p.bytes)
        .resize(PREVIEW_WIDTH, PREVIEW_WIDTH, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toBuffer();
      return {
        taskId,
        idx,
        width: p.width,
        height: p.height,
        source: p.source,
        preview: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      };
    }),
  );
  await db.insert(fbEventPhotos).values(rows);
  return rows.map((r) => ({
    index: r.idx,
    width: r.width,
    height: r.height,
    source: r.source,
    preview: r.preview,
  }));
}

/** From the cache, reading the flyer only if nothing is on file yet. */
export async function photosFor(taskId: string): Promise<StoredPhoto[]> {
  const stored = await storedPhotos(taskId);
  return stored.length > 0 ? stored : cachePhotos(taskId);
}
