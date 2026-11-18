/**
 * Keeping the Facebook event tasks in step with Planner.
 *
 * The Planner pass already reads one person's whole task list to find the
 * eblasts. The Facebook event tasks are in that same list, so this runs off
 * the list that has already been fetched rather than asking Graph again.
 *
 * Nothing here writes to Planner and nothing here generates anything. It
 * records which Facebook events exist, which community each belongs to, and
 * which eblast task is its twin — because that twin's draft is where the
 * flyer, the date, the time and the address come from. An event whose twin
 * cannot be found is kept with a note saying so, since a Facebook event with
 * nothing behind it still needs doing by hand.
 */
import { db } from "@/lib/db";
import { fbEventTasks, plannerTasks } from "@/lib/db/schema";
import { eq, inArray, notInArray } from "drizzle-orm";
import {
  eventNameOf,
  getPlanTitle,
  isFbEventTask,
  matchCommunity,
  matchEblastTask,
  type PlannerTask,
} from "@/lib/planner";
import { listCommunities } from "@/data/communities";

export interface FbEventSyncSummary {
  seen: number;
  paired: number;
  unpaired: number;
  removed: number;
}

/**
 * @param all   every task assigned to the Planner user, eblasts included —
 *              the eblast ones are what the Facebook ones are matched against
 * @param token a Graph token already in hand, to resolve plan titles
 */
export async function syncFbEventTasks(
  all: readonly PlannerTask[],
  token?: string,
  planTitleCache?: Map<string, string | null>,
): Promise<FbEventSyncSummary> {
  const summary: FbEventSyncSummary = { seen: 0, paired: 0, unpaired: 0, removed: 0 };
  const fbTasks = all.filter((t) => isFbEventTask(t.title));
  summary.seen = fbTasks.length;

  const communities = await listCommunities();
  const titles = planTitleCache ?? new Map<string, string | null>();

  // The eblast task ids we pair to, looked up once: a pair is only useful when
  // that task has produced a draft, which is what holds the flyer.
  const draftByTask = new Map(
    (await db
      .select({ taskId: plannerTasks.taskId, savedDraftId: plannerTasks.savedDraftId })
      .from(plannerTasks))
      .map((r) => [r.taskId, r.savedDraftId] as const),
  );

  for (const task of fbTasks) {
    if (!titles.has(task.planId)) {
      titles.set(task.planId, await getPlanTitle(task.planId, token));
    }
    const planTitle = titles.get(task.planId) ?? null;
    const community = planTitle ? matchCommunity(planTitle, communities) : null;

    const twin = matchEblastTask(task, all);
    const draftId = twin ? draftByTask.get(twin.id) ?? null : null;

    let note: string | null = null;
    if (!twin) {
      note = "No eblast task of this name";
    } else if (!draftId) {
      note = "The eblast task has not been drafted yet";
    }
    if (!community) {
      const missing = planTitle ? `Plan "${planTitle}" matches no community` : "Plan name unknown";
      note = note ? `${missing}. ${note}` : missing;
    }
    if (twin && draftId && community) summary.paired++;
    else summary.unpaired++;

    await db
      .insert(fbEventTasks)
      .values({
        taskId: task.id,
        planId: task.planId,
        communitySlug: community?.slug,
        title: task.title,
        eventName: eventNameOf(task.title),
        dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
        assigneePriority: task.assigneePriority,
        eblastTaskId: twin?.id ?? null,
        savedDraftId: draftId,
        matchNote: note,
      })
      .onConflictDoUpdate({
        target: fbEventTasks.taskId,
        set: {
          planId: task.planId,
          communitySlug: community?.slug,
          title: task.title,
          eventName: eventNameOf(task.title),
          dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
          assigneePriority: task.assigneePriority,
          eblastTaskId: twin?.id ?? null,
          savedDraftId: draftId,
          matchNote: note,
          updatedAt: new Date(),
        },
      });
  }

  // A task that has left Planner — completed, reassigned or deleted — should
  // leave here too, or the list would grow for ever and show work nobody is
  // being asked to do. Only ever run against a list that was actually
  // fetched: an empty one means the fetch failed, not that the work is gone.
  if (all.length > 0) {
    const keep = fbTasks.map((t) => t.id);
    const removed = keep.length
      ? await db.delete(fbEventTasks).where(notInArray(fbEventTasks.taskId, keep)).returning({ id: fbEventTasks.taskId })
      : await db.delete(fbEventTasks).returning({ id: fbEventTasks.taskId });
    summary.removed = removed.length;
  }

  return summary;
}

/** Every Facebook event on file, newest deadline first, with its pairing. */
export async function listFbEventTasks() {
  return db.select().from(fbEventTasks).orderBy(fbEventTasks.dueAt);
}

/** One, by the task it came from. */
export async function getFbEventTask(taskId: string) {
  const [row] = await db.select().from(fbEventTasks).where(eq(fbEventTasks.taskId, taskId)).limit(1);
  return row ?? null;
}

/** Used by the guard to prove the pairing is read back the way it was stored. */
export async function fbEventTasksByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(fbEventTasks).where(inArray(fbEventTasks.taskId, ids));
}
