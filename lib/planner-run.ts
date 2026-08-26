/**
 * Runs of the Planner pass: locking, recovery, and handing off.
 *
 * A run stops STARTING new eblasts three minutes in, but never interrupts one
 * already generating — that draft finishes even if it runs past the mark. If
 * Vercel kills the function first, the claim left in the database is what makes
 * that recoverable: the next run permanently deletes the half-made draft, puts
 * the task back to Not started in Planner, and lets it be tried again.
 *
 * Three failed attempts and a task stops being retried. It stays unchecked so
 * the marketing team can see it still needs doing.
 */
import { db } from "@/lib/db";
import { plannerRuns, plannerTasks, savedDrafts } from "@/lib/db/schema";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

/** Stop starting new eblasts here. One already running is left alone. */
export const STOP_STARTING_MS = 180_000;

/** A run quiet for this long was killed; its claims are safe to clean up. */
export const RUN_STALE_MS = 360_000;

/** Attempts before a task is left for a person. */
export const MAX_ATTEMPTS = 3;

/** Safety stop so a bug can't chain runs forever. */
export const MAX_CHAIN = 25;

export type RunTrigger = "cron" | "manual" | "chain";

/**
 * Start a run, unless one is already going.
 *
 * The insert is conditional on no live run existing, so the morning cron and
 * the Run now button can't both get one — whichever loses simply gets null.
 */
export async function claimRun(trigger: RunTrigger, chainIndex = 0): Promise<string | null> {
  const live = await currentRun();
  if (live) return null;

  const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(plannerRuns).values({ id, trigger, chainIndex });
  return id;
}

/** The run in progress, if there is one whose heartbeat is still recent. */
export async function currentRun() {
  const [row] = await db
    .select()
    .from(plannerRuns)
    .where(eq(plannerRuns.status, "running"))
    .orderBy(desc(plannerRuns.startedAt))
    .limit(1);
  if (!row) return null;
  const quietFor = Date.now() - new Date(row.heartbeatAt).getTime();
  if (quietFor > RUN_STALE_MS) {
    // Killed mid-flight. Close it out so it can't block the next one forever.
    await db
      .update(plannerRuns)
      .set({ status: "failed", finishedAt: new Date(), error: "Run stopped without finishing" })
      .where(eq(plannerRuns.id, row.id));
    return null;
  }
  return row;
}

export async function heartbeat(runId: string, patch: Partial<{
  drafted: number;
  skipped: number;
  failed: number;
  remaining: number;
  currentTask: string | null;
}> = {}): Promise<void> {
  await db
    .update(plannerRuns)
    .set({ heartbeatAt: new Date(), ...patch })
    .where(eq(plannerRuns.id, runId));
}

export async function finishRun(
  runId: string,
  status: "done" | "failed",
  patch: Partial<{ drafted: number; skipped: number; failed: number; remaining: number; error: string }> = {},
): Promise<void> {
  await db
    .update(plannerRuns)
    .set({ status, finishedAt: new Date(), heartbeatAt: new Date(), currentTask: null, ...patch })
    .where(eq(plannerRuns.id, runId));
}

/**
 * Clean up after runs that were killed mid-draft.
 *
 * A claim older than a live run's lifetime means generation never finished.
 * Whatever it managed to write is deleted outright — hard, not into the trash,
 * leaving no row behind — because a half-made eblast is worse than none, and
 * the task will simply be drafted again.
 *
 * Returns the tasks that need un-checking in Planner; doing that is the
 * caller's job since it needs a Graph token.
 */
export async function recoverInterruptedTasks(): Promise<
  Array<{ taskId: string; attempts: number; exhausted: boolean }>
> {
  const cutoff = new Date(Date.now() - RUN_STALE_MS);
  const stuck = await db
    .select({
      taskId: plannerTasks.taskId,
      attempts: plannerTasks.attempts,
      pendingDraftId: plannerTasks.pendingDraftId,
    })
    .from(plannerTasks)
    .where(and(isNull(plannerTasks.savedDraftId), lt(plannerTasks.claimedAt, cutoff)));

  const recovered: Array<{ taskId: string; attempts: number; exhausted: boolean }> = [];

  for (const t of stuck) {
    // Hard delete — no soft-delete, no Deleted Drafts entry. Images go with it
    // through the foreign key's cascade.
    if (t.pendingDraftId) {
      await db.delete(savedDrafts).where(eq(savedDrafts.id, t.pendingDraftId));
    }
    const exhausted = t.attempts >= MAX_ATTEMPTS;
    await db
      .update(plannerTasks)
      .set({
        claimedAt: null,
        claimedBy: null,
        pendingDraftId: null,
        abandoned: exhausted,
        lastError: exhausted
          ? `Stopped before finishing ${t.attempts} times — needs the marketing team`
          : "Stopped before finishing; will try again",
        skipReason: exhausted
          ? `Couldn't be drafted after ${t.attempts} attempts — needs the marketing team`
          : null,
      })
      .where(eq(plannerTasks.taskId, t.taskId));
    recovered.push({ taskId: t.taskId, attempts: t.attempts, exhausted });
  }

  return recovered;
}

/**
 * Take a task for this run, so an interrupted attempt can be found later.
 *
 * The draft id is decided here rather than after generation, so cleanup can
 * delete exactly what this attempt created instead of guessing.
 */
export async function claimTask(
  runId: string,
  task: { id: string; planId: string; title: string; dueDateTime: string | null },
  communitySlug: string,
  draftId: string,
): Promise<void> {
  await db
    .insert(plannerTasks)
    .values({
      taskId: task.id,
      planId: task.planId,
      communitySlug,
      title: task.title,
      dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
      claimedAt: new Date(),
      claimedBy: runId,
      pendingDraftId: draftId,
      attempts: 1,
    })
    .onConflictDoUpdate({
      target: plannerTasks.taskId,
      set: {
        communitySlug,
        title: task.title,
        dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
        claimedAt: new Date(),
        claimedBy: runId,
        pendingDraftId: draftId,
        attempts: sql`${plannerTasks.attempts} + 1`,
      },
    });
}

/** Release a claim after a failure this run caught itself. */
export async function releaseTask(taskId: string, error: string): Promise<void> {
  const [row] = await db
    .select({ attempts: plannerTasks.attempts, pendingDraftId: plannerTasks.pendingDraftId })
    .from(plannerTasks)
    .where(eq(plannerTasks.taskId, taskId))
    .limit(1);

  if (row?.pendingDraftId) {
    await db.delete(savedDrafts).where(eq(savedDrafts.id, row.pendingDraftId));
  }
  const exhausted = (row?.attempts ?? 0) >= MAX_ATTEMPTS;
  await db
    .update(plannerTasks)
    .set({
      claimedAt: null,
      claimedBy: null,
      pendingDraftId: null,
      abandoned: exhausted,
      lastError: error.slice(0, 500),
      skipReason: exhausted
        ? `Couldn't be drafted after ${row?.attempts ?? MAX_ATTEMPTS} attempts — needs the marketing team`
        : null,
    })
    .where(eq(plannerTasks.taskId, taskId));
}
