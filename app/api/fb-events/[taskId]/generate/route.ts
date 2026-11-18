/**
 * Write the copy for one Facebook event.
 *
 * Separate from the sync on purpose: the sync runs daily over everything and
 * must stay cheap, while this costs a model call and is only worth spending
 * on an event somebody is about to post.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fbEventTasks, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { writeFbEventCopy, type DraftFields } from "@/lib/fb-event-draft";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { taskId: string } }) {
  const [task] = await db
    .select()
    .from(fbEventTasks)
    .where(eq(fbEventTasks.taskId, params.taskId))
    .limit(1);
  if (!task) return NextResponse.json({ ok: false, error: "No such event task" }, { status: 404 });
  if (!task.savedDraftId) {
    return NextResponse.json(
      { ok: false, error: task.matchNote ?? "This event has no eblast draft to work from yet" },
      { status: 400 },
    );
  }

  const [draft] = await db
    .select({ data: savedDrafts.data, communityName: savedDrafts.communityName })
    .from(savedDrafts)
    .where(eq(savedDrafts.id, task.savedDraftId))
    .limit(1);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "The eblast draft has been deleted" }, { status: 400 });
  }

  const fields = ((draft.data as { fields?: DraftFields })?.fields ?? {}) as DraftFields;

  try {
    const copy = await writeFbEventCopy(fields, draft.communityName, task.eventName);
    await db
      .update(fbEventTasks)
      .set({
        eventTitle: copy.name,
        paragraphs: copy.paragraphs,
        facebookDescription: copy.descriptions.facebook,
        furtherDescription: copy.descriptions.further,
        generatedAt: new Date(),
        generatedFromDraftId: task.savedDraftId,
        updatedAt: new Date(),
      })
      .where(eq(fbEventTasks.taskId, params.taskId));

    return NextResponse.json({ ok: true, ...copy });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
