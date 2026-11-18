/**
 * The event's cover photo, cut to the shape Facebook shows it in.
 *
 * Facebook crops an event cover to 1.91:1 whatever is uploaded, so it is cut
 * here instead — uploading a tall photo and letting Facebook choose means
 * finding out afterwards that it chose somebody's forehead. 1920 wide is the
 * size Meta's own guidance asks for.
 *
 * The photo is the hero the eblast uses. Until somebody opens that draft and
 * picks one there is no hero, so the first image the drafter gathered is used
 * instead — it is the same pool the hero is chosen from, and a reasonable
 * cover now beats none at all.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draftImageBank, fbEventTasks, savedDrafts } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1920;
const HEIGHT = Math.round(WIDTH / 1.91); // 1005

function bytesOf(dataUrl: string): Buffer | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl ?? "");
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const [task] = await db
    .select({ draftId: fbEventTasks.savedDraftId, name: fbEventTasks.eventName })
    .from(fbEventTasks)
    .where(eq(fbEventTasks.taskId, params.taskId))
    .limit(1);
  if (!task?.draftId) {
    return NextResponse.json({ ok: false, error: "No eblast draft for this event" }, { status: 404 });
  }

  const [draft] = await db
    .select({ data: savedDrafts.data })
    .from(savedDrafts)
    .where(eq(savedDrafts.id, task.draftId))
    .limit(1);

  const hero = (draft?.data as { images?: { hero?: { url?: string } | string | null } })?.images?.hero;
  let source =
    typeof hero === "string" ? hero : hero && typeof hero === "object" ? hero.url ?? null : null;

  if (!source) {
    const [first] = await db
      .select({ url: draftImageBank.url })
      .from(draftImageBank)
      .where(eq(draftImageBank.draftId, task.draftId))
      .orderBy(asc(draftImageBank.idx))
      .limit(1);
    source = first?.url ?? null;
  }

  const bytes = source ? bytesOf(source) : null;
  if (!bytes) {
    return NextResponse.json(
      { ok: false, error: "That eblast has no photo yet — open the draft and pick a hero image" },
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
        "Content-Disposition": `attachment; filename="${safe || "event"}-cover.jpg"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
