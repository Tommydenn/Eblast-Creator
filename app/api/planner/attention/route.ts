/**
 * The needs-attention list, cleared by hand.
 *
 * A task that could not be drafted keeps the reason on its row, and that
 * reason is what puts it on the list. Each run clears the reason from tasks
 * that are finished or no longer assigned, which handles the common case on
 * its own. This is for the rest: a task that is going to sit there — a plan
 * that will never be a community, an eblast someone handled elsewhere — and
 * does not need to be looked at again.
 *
 * Clearing a reason is not the same as hiding the task. If a later run looks
 * at it again and still cannot draft it, it comes back, which is the right
 * answer for something genuinely unresolved.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plannerTasks } from "@/lib/db/schema";
import { and, inArray, isNotNull, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { taskIds?: string[]; all?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.taskIds) ? body.taskIds.filter((v) => typeof v === "string") : [];
  if (!body.all && ids.length === 0) {
    return NextResponse.json({ ok: false, error: "Name the tasks to clear, or pass all" }, { status: 400 });
  }

  try {
    // Only ever rows that are actually on the list: a reason, and no draft.
    // A task that has since drafted is not on it, and its reason is history.
    const onTheList = and(isNotNull(plannerTasks.skipReason), isNull(plannerTasks.savedDraftId));

    const cleared = await db
      .update(plannerTasks)
      .set({ skipReason: null })
      .where(body.all ? onTheList : and(onTheList, inArray(plannerTasks.taskId, ids)))
      .returning({ taskId: plannerTasks.taskId });

    return NextResponse.json({ ok: true, cleared: cleared.length });
  } catch (e: any) {
    console.error("[planner/attention POST]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
