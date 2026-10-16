/**
 * Throw away the pending drafts and let the automation make them again.
 *
 * The drafter improves, and the drafts already waiting were made by the old
 * one. Deleting them is not enough on its own: the Planner task still points
 * at the draft, so the next run counts it as done, and the task is still
 * marked In progress, so it is not a candidate either. Three things have to
 * happen together or nothing is redrafted.
 *
 * Only ever touches drafts nobody has acted on — never one that was approved
 * or pushed, never one made by hand. The drafts go to Deleted rather than
 * being destroyed, so a redraft that turns out worse is recoverable.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts, plannerTasks } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getGraphToken } from "@/lib/graph";
import { markTaskNotStarted } from "@/lib/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    // Exactly what the Pending view shows: made from a Planner task, still
    // sitting there, nobody has approved or pushed it.
    const pending = await db
      .select({
        draftId: savedDrafts.id,
        taskId: plannerTasks.taskId,
        communitySlug: savedDrafts.communitySlug,
        title: plannerTasks.title,
      })
      .from(savedDrafts)
      .innerJoin(plannerTasks, eq(plannerTasks.savedDraftId, savedDrafts.id))
      .where(
        and(
          isNull(savedDrafts.deletedAt),
          isNull(savedDrafts.approvedAt),
          isNull(savedDrafts.pushedAt),
        ),
      );

    if (body.dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, count: pending.length, drafts: pending });
    }
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0, released: 0, unmarked: 0, failedToUnmark: [] });
    }

    const draftIds = pending.map((p) => p.draftId);
    const taskIds = pending.map((p) => p.taskId);

    // To Deleted, not destroyed.
    await db
      .update(savedDrafts)
      .set({ deletedAt: new Date() })
      .where(inArray(savedDrafts.id, draftIds));

    // Let go of the draft, and of everything the last attempt recorded, so the
    // task is judged on its own merits next time rather than on a history that
    // belongs to a draft that no longer exists.
    await db
      .update(plannerTasks)
      .set({
        savedDraftId: null,
        draftedAt: null,
        markedInProgress: false,
        pendingDraftId: null,
        skipReason: null,
        lastError: null,
        attempts: 0,
        abandoned: false,
      })
      .where(inArray(plannerTasks.taskId, taskIds));

    // And put Planner back to Not started, or the task is not a candidate.
    // A failure here leaves that one task out of the next run rather than
    // stopping the rest; it is reported so it can be flipped by hand.
    const token = await getGraphToken();
    const failedToUnmark: Array<{ taskId: string; title: string; error: string }> = [];
    let unmarked = 0;
    for (const p of pending) {
      try {
        await markTaskNotStarted(p.taskId, token);
        unmarked++;
      } catch (e: any) {
        failedToUnmark.push({ taskId: p.taskId, title: p.title, error: e?.message ?? String(e) });
      }
    }

    return NextResponse.json({
      ok: true,
      deleted: draftIds.length,
      released: taskIds.length,
      unmarked,
      failedToUnmark,
    });
  } catch (e: any) {
    console.error("[planner/redraft POST]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
