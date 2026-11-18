/**
 * The event's cover photo, cut to the shape Facebook shows it in.
 *
 * Facebook crops an event cover to 1.91:1 whatever is uploaded, so it is cut
 * here instead — uploading a tall photo and letting Facebook choose means
 * finding out afterwards that it chose somebody's forehead. 1920 wide is the
 * size Meta's own guidance asks for.
 *
 * The photo comes from the same two places the words do: the eblast's chosen
 * hero if there is one, and otherwise the largest photo inside the flyer,
 * because the event is usually due before the eblast is drafted and a cover
 * that waits for the draft is a cover that arrives late.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draftImageBank, fbEventTasks, savedDrafts } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { extractImagesFromPdf } from "@/lib/pdf-images";
import { flyerFor } from "@/lib/fb-event-source";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const WIDTH = 1920;
const HEIGHT = Math.round(WIDTH / 1.91); // 1005

function bytesOf(dataUrl: string | null | undefined): Buffer | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl ?? "");
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

/** The eblast's hero, then anything the drafter gathered for it. */
async function fromDraft(draftId: string): Promise<Buffer | null> {
  const [draft] = await db
    .select({ data: savedDrafts.data })
    .from(savedDrafts)
    .where(eq(savedDrafts.id, draftId))
    .limit(1);

  const hero = (draft?.data as { images?: { hero?: { url?: string } | string | null } })?.images?.hero;
  const heroUrl = typeof hero === "string" ? hero : hero && typeof hero === "object" ? hero.url ?? null : null;
  const picked = bytesOf(heroUrl);
  if (picked) return picked;

  const [first] = await db
    .select({ url: draftImageBank.url })
    .from(draftImageBank)
    .where(eq(draftImageBank.draftId, draftId))
    .orderBy(asc(draftImageBank.idx))
    .limit(1);
  return bytesOf(first?.url);
}

/**
 * The biggest photo in the flyer.
 *
 * Biggest by area rather than first, because the first image on a flyer is
 * usually the community's logo and a logo stretched to 1920 wide is not a
 * cover photo.
 */
async function fromFlyer(taskId: string): Promise<Buffer | null> {
  const pdf = await flyerFor(taskId);
  if (!pdf) return null;
  const { images } = await extractImagesFromPdf(pdf);
  // Anything below this is a logo, an icon or a QR code rather than a photo.
  const photos = images.filter((i) => i.area >= 120_000).sort((a, b) => b.area - a.area);
  for (const photo of photos) {
    const bytes = bytesOf(photo.dataUri);
    if (bytes) return bytes;
  }
  return null;
}

export async function GET(req: Request, { params }: { params: { taskId: string } }) {
  // ?inline=1 is the same image shown on the page rather than saved, so you
  // can see the crop before you upload it.
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const [task] = await db
    .select({ draftId: fbEventTasks.savedDraftId, name: fbEventTasks.eventName })
    .from(fbEventTasks)
    .where(eq(fbEventTasks.taskId, params.taskId))
    .limit(1);
  if (!task) return NextResponse.json({ ok: false, error: "No such event task" }, { status: 404 });

  let bytes: Buffer | null = null;
  try {
    if (task.draftId) bytes = await fromDraft(task.draftId);
    if (!bytes) bytes = await fromFlyer(params.taskId);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  if (!bytes) {
    return NextResponse.json(
      { ok: false, error: "No photo yet — the flyer has none big enough and the eblast has no hero" },
      { status: 404 },
    );
  }

  try {
    const jpeg = await sharp(bytes)
      .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
      .jpeg({ quality: 88 })
      .toBuffer();
    const safe = (task.name || "event").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": inline
          ? "inline"
          : `attachment; filename="${safe || "event"}-cover.jpg"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
