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
import { fbEventTasks, pendingFlyers, plannerTasks } from "@/lib/db/schema";
import { and, eq, inArray, isNull, like, lt, notInArray } from "drizzle-orm";
import { getLookaheadDays, isDueWithinWindow } from "@/lib/planner-settings";
import { writeFbEventCopy } from "@/lib/fb-event-draft";
import { NoSourceError, sourceFor } from "@/lib/fb-event-source";

/**
 * How long a Facebook event stays on file after its deadline.
 *
 * Long enough that an event posted late, or one somebody is still checking,
 * is still here — and not a day longer. These rows hold a copy of the event's
 * words and a note of when it was posted, and neither is worth keeping about
 * a day that has already happened.
 */
export const RETAIN_DAYS = 45;
import {
  NOT_STARTED,
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
  // Status is what retires one of these, exactly as it retires an eblast
  // task: posting the event means ticking it off in Planner, and a task
  // somebody has picked up themselves is theirs. Either way it leaves this
  // list, and the row below is deleted with it.
  const fbTasks = all.filter((t) => isFbEventTask(t.title) && t.percentComplete === NOT_STARTED);
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

    // And an age limit on top of that, for a task nobody ever ticks off in
    // Planner. Nothing here is worth keeping once the day has been and gone:
    // the words describe a date in the past and the record of having posted
    // it is on Facebook, which is the thing that actually holds it.
    const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000);
    const aged = await db
      .delete(fbEventTasks)
      .where(lt(fbEventTasks.dueAt, cutoff))
      .returning({ id: fbEventTasks.taskId });
    summary.removed += aged.length;

    // The flyers cached for them go too, or the cache grows for ever.
    await db.delete(pendingFlyers).where(
      and(like(pendingFlyers.key, "fb:%"), lt(pendingFlyers.createdAt, cutoff)),
    );
  }

  return summary;
}

/**
 * Write the copy for every event whose deadline is close enough.
 *
 * The same window the eblasts are drafted on, from the same setting, so one
 * number governs how far ahead the app works. An event with copy already
 * written is left alone; an event with nothing to build from is skipped
 * quietly and tried again tomorrow, because "no flyer yet" is a thing that
 * stops being true on its own.
 *
 * Capped and timed, because each one costs a model call. Whatever is missed
 * is picked up by the next run, and a deadline a month out has thirty
 * chances.
 */
export async function writePendingFbEvents(opts?: {
  limit?: number;
  budgetMs?: number;
}): Promise<{ considered: number; written: number; skipped: number; failed: number }> {
  const limit = opts?.limit ?? 12;
  const budgetMs = opts?.budgetMs ?? 240_000;
  const startedAt = Date.now();
  const out = { considered: 0, written: 0, skipped: 0, failed: 0 };

  const lookaheadDays = await getLookaheadDays();
  const waiting = await db
    .select()
    .from(fbEventTasks)
    .where(isNull(fbEventTasks.facebookDescription))
    .orderBy(fbEventTasks.dueAt);

  const due = waiting.filter((e) =>
    isDueWithinWindow(e.dueAt ? e.dueAt.toISOString() : null, lookaheadDays),
  );
  out.considered = due.length;

  for (const event of due) {
    if (out.written >= limit) break;
    if (Date.now() - startedAt > budgetMs) break;
    try {
      const source = await sourceFor(event.taskId);
      const copy = await writeFbEventCopy(source.fields, source.communityName, event.eventName);
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
          generatedFromDraftId: source.draftId,
          updatedAt: new Date(),
        })
        .where(eq(fbEventTasks.taskId, event.taskId));
      out.written++;
    } catch (e) {
      // Nothing to build from yet is the ordinary case, not a failure.
      if (e instanceof NoSourceError) out.skipped++;
      else {
        out.failed++;
        console.error(`[fb-events] could not write ${event.eventName}:`, e);
      }
    }
  }

  return out;
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
