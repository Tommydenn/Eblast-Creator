/**
 * Write the copy for one Facebook event.
 *
 * Separate from the sync on purpose: the sync runs daily over everything and
 * must stay cheap, while this costs a model call and is only worth spending
 * on an event somebody is about to post.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fbEventTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { writeFbEventCopy } from "@/lib/fb-event-draft";
import { NoSourceError, sourceFor } from "@/lib/fb-event-source";
import { formatEventDate, formatEventTime } from "@/lib/fb-event-copy";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { taskId: string } }) {
  const [task] = await db
    .select()
    .from(fbEventTasks)
    .where(eq(fbEventTasks.taskId, params.taskId))
    .limit(1);
  if (!task) return NextResponse.json({ ok: false, error: "No such event task" }, { status: 404 });

  try {
    const source = await sourceFor(params.taskId);
    const copy = await writeFbEventCopy(source.fields, source.communityName, task.eventName);

    await db
      .update(fbEventTasks)
      .set({
        eventTitle: copy.name,
        paragraphs: copy.paragraphs,
        facebookDescription: copy.descriptions.facebook,
        furtherDescription: copy.descriptions.further,
        eventDate: source.fields.eventDate ?? null,
        eventTime: source.fields.eventTime ?? null,
        eventLocation: source.fields.eventLocation ?? null,
        generatedAt: new Date(),
        generatedFrom: source.kind,
        // Null when it came from the flyer, which is also what makes the
        // "written before the eblast changed" warning mean something.
        generatedFromDraftId: source.draftId,
        updatedAt: new Date(),
      })
      .where(eq(fbEventTasks.taskId, params.taskId));

    return NextResponse.json({
      ok: true,
      from: source.kind,
      // Formatted the way the description carries them, so the page can show
      // the same strings without asking for the row again.
      details: {
        date: source.fields.eventDate ? formatEventDate(source.fields.eventDate) : null,
        time: source.fields.eventTime ? formatEventTime(source.fields.eventTime) : null,
        location: source.fields.eventLocation ?? null,
      },
      ...copy,
    });
  } catch (e) {
    if (e instanceof NoSourceError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
