/**
 * The photos available for one Facebook event.
 *
 * Gathered rather than chosen. Picking the biggest one automatically was
 * right as a default and wrong as the only option: a flyer usually carries
 * two or three usable photos and which reads best as an event cover is a
 * judgement, not an area calculation. So everything usable is offered and
 * the largest is simply first.
 *
 * Nothing is cropped. Facebook and Further both crop on upload, and a
 * pre-crop only takes the choice away — the original is what gets handed
 * over now.
 */
import { db } from "@/lib/db";
import { draftImageBank, fbEventTasks, savedDrafts } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { extractImagesFromPdf } from "@/lib/pdf-images";
import { flyerFor } from "@/lib/fb-event-source";

export interface EventPhoto {
  bytes: Buffer;
  width: number;
  height: number;
  /** "hero" is the one the eblast chose; the rest come from the flyer. */
  source: "hero" | "bank" | "flyer";
}

/** Below this an image is a logo, an icon or a QR code, not a photo. */
const MIN_AREA = 120_000;

function bytesOf(dataUrl: string | null | undefined): Buffer | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl ?? "");
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

async function measure(bytes: Buffer, source: EventPhoto["source"]): Promise<EventPhoto | null> {
  try {
    const meta = await sharp(bytes).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width * height < MIN_AREA) return null;
    return { bytes, width, height, source };
  } catch {
    return null;
  }
}

/**
 * Every photo worth offering, the eblast's chosen hero first and then the
 * flyer's own, largest first.
 */
export async function collectPhotos(taskId: string): Promise<EventPhoto[]> {
  const [task] = await db
    .select({ draftId: fbEventTasks.savedDraftId })
    .from(fbEventTasks)
    .where(eq(fbEventTasks.taskId, taskId))
    .limit(1);

  const out: EventPhoto[] = [];
  const seen = new Set<string>();
  const add = async (bytes: Buffer | null, source: EventPhoto["source"]) => {
    if (!bytes) return;
    // Same picture from two places — the hero is also in the bank — is the
    // normal case, so they are matched on their bytes rather than listed twice.
    const fingerprint = `${bytes.length}:${bytes.subarray(0, 64).toString("base64")}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    const photo = await measure(bytes, source);
    if (photo) out.push(photo);
  };

  if (task?.draftId) {
    const [draft] = await db
      .select({ data: savedDrafts.data })
      .from(savedDrafts)
      .where(eq(savedDrafts.id, task.draftId))
      .limit(1);
    const hero = (draft?.data as { images?: { hero?: { url?: string } | string | null } })?.images?.hero;
    const heroUrl = typeof hero === "string" ? hero : hero && typeof hero === "object" ? hero.url ?? null : null;
    await add(bytesOf(heroUrl), "hero");

    const bank = await db
      .select({ url: draftImageBank.url })
      .from(draftImageBank)
      .where(eq(draftImageBank.draftId, task.draftId))
      .orderBy(asc(draftImageBank.idx));
    for (const row of bank) await add(bytesOf(row.url), "bank");
  }

  if (out.length === 0 || !task?.draftId) {
    const pdf = await flyerFor(taskId);
    if (pdf) {
      const { images } = await extractImagesFromPdf(pdf);
      for (const image of [...images].sort((a, b) => b.area - a.area)) {
        await add(bytesOf(image.dataUri), "flyer");
      }
    }
  }

  // The hero stays where it is; everything after it goes largest first.
  const [first, ...rest] = out;
  if (first?.source === "hero") {
    rest.sort((a, b) => b.width * b.height - a.width * a.height);
    return [first, ...rest];
  }
  return out.sort((a, b) => b.width * b.height - a.width * a.height);
}

/** A small version, for the strip of choices. */
export async function thumbnail(photo: EventPhoto): Promise<string> {
  const jpeg = await sharp(photo.bytes)
    .resize(360, 360, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
