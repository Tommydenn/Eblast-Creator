/**
 * The pass: Planner tasks in, eblast drafts out.
 *
 * What it will act on, and nothing else:
 *   - assigned to the configured person (their "My Tasks")
 *   - status Not started — In progress and Complete are never touched
 *   - title's first word is "Eblast" — "FB Event" and everything else ignored
 *   - due on or before the last day in the lookahead window
 *   - has a flyer attached, and the plan's title matches a known community
 *   - hasn't already failed three times
 *
 * A task missing a flyer, or in an unrecognised plan, is recorded with a
 * reason and left Not started, so it is reconsidered next time. That is how a
 * flyer attached late still gets drafted, and how nothing is ever guessed.
 *
 * Timing: a run stops STARTING new eblasts three minutes in, but never
 * interrupts one already generating — that draft finishes even if it runs past
 * the mark. When there is still work left, the run hands off to a fresh one, so
 * a backlog clears in one sitting without any single run being cut off.
 *
 * Nothing here sends anything. A drafted task is marked In progress — never
 * Complete — because a draft is waiting for a person, not finished.
 */
import { db } from "@/lib/db";
import { savedDrafts, plannerTasks, plannerTaskFlyers, draftImageBank } from "@/lib/db/schema";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { listCommunities, getCommunity } from "@/data/communities";
import {
  isTaskInProgress,
  listAssignedTasks,
  getPlanTitle,
  isEblastTask,
  downloadTaskFlyer,
  markTaskInProgress,
  markTaskNotStarted,
  matchCommunity,
  NOT_STARTED,
  type PlannerTask,
} from "@/lib/planner";
import { getGraphToken } from "@/lib/graph";
import { generateDraft } from "@/lib/generate-draft";
import { buildImageRows, dedupeImageRows } from "@/lib/image-bank";
import { getLookaheadDays, isDueWithinWindow } from "@/lib/planner-settings";
import {
  MAX_ATTEMPTS,
  STOP_STARTING_MS,
  claimTask,
  finishRun,
  heartbeat,
  recoverInterruptedTasks,
  releaseTask,
} from "@/lib/planner-run";

export interface PlannerRunSummary {
  scanned: number;
  candidates: number;
  drafted: Array<{ task: string; community: string; draftId: string; markedInProgress: boolean }>;
  notMarked: Array<{ task: string; draftId: string; error: string }>;
  skipped: Array<{ task: string; reason: string }>;
  failed: Array<{ task: string; error: string }>;
  recovered: number;
  /** Candidates still waiting when this run stopped. Non-zero means hand off. */
  remaining: number;
}

export async function runPlannerDraftPass(opts?: {
  userEmail?: string;
  dryRun?: boolean;
  limit?: number;
  startedAt?: number;
  /** Written to as work completes, so the UI can follow along. */
  runId?: string;
}): Promise<PlannerRunSummary> {
  const userEmail = opts?.userEmail ?? process.env.PLANNER_USER_EMAIL;
  if (!userEmail) throw new Error("PLANNER_USER_EMAIL is not set");

  const startedAt = opts?.startedAt ?? Date.now();
  const runId = opts?.runId;
  const summary: PlannerRunSummary = {
    scanned: 0,
    candidates: 0,
    drafted: [],
    notMarked: [],
    skipped: [],
    failed: [],
    recovered: 0,
    remaining: 0,
  };

  const token = await getGraphToken();

  // Anything a killed run left behind, before deciding what to do this time.
  // The half-made drafts are already gone; these tasks need putting back to
  // Not started so Planner agrees with the database.
  if (!opts?.dryRun) {
    const recovered = await recoverInterruptedTasks();
    summary.recovered = recovered.length;
    for (const r of recovered) {
      try {
        await markTaskNotStarted(r.taskId, token);
      } catch (e) {
        console.error(`[planner] could not un-check interrupted task ${r.taskId}:`, e);
      }
    }
  }

  const lookaheadDays = await getLookaheadDays();
  const all = await listAssignedTasks(userEmail, token);

  // Drafts made before the flyer was kept, or before the Planner ordering was
  // recorded, have neither. Filling those in here means they heal themselves
  // over a run or two instead of needing a one-off script. Capped so this
  // never eats the time meant for drafting.
  if (!opts?.dryRun) {
    await backfillFlyersAndOrder(all, token);
  }
  summary.scanned = all.length;

  const candidates = all.filter(
    (t) =>
      t.percentComplete === NOT_STARTED &&
      isEblastTask(t.title) &&
      isDueWithinWindow(t.dueDateTime, lookaheadDays),
  );
  summary.candidates = candidates.length;

  // Tasks already drafted, and tasks that have run out of attempts. Planner
  // status normally keeps drafted ones out of the list anyway; this catches the
  // case where the draft was made but Planner wasn't updated.
  const known = await db
    .select({
      taskId: plannerTasks.taskId,
      savedDraftId: plannerTasks.savedDraftId,
      attempts: plannerTasks.attempts,
      abandoned: plannerTasks.abandoned,
    })
    .from(plannerTasks);
  const done = new Set(known.filter((k) => k.savedDraftId).map((k) => k.taskId));
  const givenUp = new Set(
    known.filter((k) => k.abandoned || k.attempts >= MAX_ATTEMPTS).map((k) => k.taskId),
  );

  const workable = candidates.filter((t) => !done.has(t.id) && !givenUp.has(t.id));
  summary.remaining = workable.length;

  const communities = await listCommunities();
  const planTitleCache = new Map<string, string | null>();

  for (const task of workable) {
    if (opts?.limit && summary.drafted.length >= opts.limit) break;
    // Only the DECISION to begin is time-boxed. A draft already under way runs
    // to completion; if Vercel kills it first, the claim makes it recoverable.
    if (Date.now() - startedAt > STOP_STARTING_MS) break;

    let claimed = false;
    try {
      if (!planTitleCache.has(task.planId)) {
        planTitleCache.set(task.planId, await getPlanTitle(task.planId, token));
      }
      const planTitle = planTitleCache.get(task.planId) ?? null;
      const community = planTitle ? matchCommunity(planTitle, communities) : null;

      if (!community) {
        await recordSkip(task, null, `Plan "${planTitle ?? task.planId}" doesn't match a known community`);
        summary.skipped.push({ task: task.title, reason: `unknown community (plan: ${planTitle ?? "?"})` });
        summary.remaining--;
        continue;
      }

      if (task.attachmentCount === 0) {
        await recordSkip(task, community.slug, "No flyer attached yet");
        summary.skipped.push({ task: task.title, reason: "no flyer attached" });
        summary.remaining--;
        continue;
      }

      const flyer = await downloadTaskFlyer(task.id, token);
      if (!flyer) {
        await recordSkip(task, community.slug, "Attachment isn't a readable PDF");
        summary.skipped.push({ task: task.title, reason: "attachment isn't a readable PDF" });
        summary.remaining--;
        continue;
      }

      if (opts?.dryRun) {
        summary.drafted.push({
          task: task.title,
          community: community.displayName,
          draftId: "(dry run)",
          markedInProgress: false,
        });
        summary.remaining--;
        continue;
      }

      const draftId = `planner-${task.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24)}-${Date.now().toString(36)}`;
      await claimTask(runId ?? "adhoc", task, community.slug, draftId);
      claimed = true;
      if (runId) await heartbeat(runId, { currentTask: `${community.displayName} — ${task.title}` });

      await draftFromTask(task, community.slug, flyer.bytes, draftId);

      // Hold on to the flyer so it can be opened next to the draft. It was
      // already downloaded to generate from; throwing it away is what made
      // checking the eblast against its source impossible.
      await db
        .insert(plannerTaskFlyers)
        .values({
          taskId: task.id,
          fileName: flyer.fileName,
          pdfBase64: flyer.bytes.toString("base64"),
          bytes: flyer.bytes.length,
        })
        .onConflictDoUpdate({
          target: plannerTaskFlyers.taskId,
          set: {
            fileName: flyer.fileName,
            pdfBase64: flyer.bytes.toString("base64"),
            bytes: flyer.bytes.length,
            storedAt: new Date(),
          },
        });

      let marked = false;
      let markError = "";
      try {
        await markTaskInProgress(task.id, token);
        // Read it back: a 2xx that doesn't stick would leave the task Not
        // started and it would be drafted a second time.
        marked = await isTaskInProgress(task.id, token);
        if (!marked) markError = "Planner accepted the update but the task is still Not started";
      } catch (e: any) {
        markError = e?.message ?? String(e);
      }
      if (!marked) {
        console.error(`[planner] draft ${draftId} made but task ${task.id} not marked: ${markError}`);
        summary.notMarked.push({ task: task.title, draftId, error: markError.slice(0, 200) });
      }

      // Releases the claim: the draft exists, so this attempt is finished.
      await db
        .update(plannerTasks)
        .set({
          savedDraftId: draftId,
          assigneePriority: task.assigneePriority,
          markedInProgress: marked,
          skipReason: null,
          lastError: null,
          claimedAt: null,
          claimedBy: null,
          pendingDraftId: null,
          draftedAt: new Date(),
        })
        .where(eq(plannerTasks.taskId, task.id));

      summary.drafted.push({
        task: task.title,
        community: community.displayName,
        draftId,
        markedInProgress: marked,
      });
      summary.remaining--;
      if (runId) {
        await heartbeat(runId, {
          drafted: summary.drafted.length,
          skipped: summary.skipped.length,
          failed: summary.failed.length,
          remaining: summary.remaining,
          currentTask: null,
        });
      }
    } catch (e: any) {
      const message = e?.message ?? String(e);
      console.error(`[planner] task ${task.id} failed:`, e);
      if (claimed) await releaseTask(task.id, message);
      else await recordSkip(task, null, `Generation failed: ${message}`.slice(0, 500));
      summary.failed.push({ task: task.title, error: message.slice(0, 200) });
      summary.remaining--;
    }
  }

  if (runId) {
    await finishRun(runId, "done", {
      drafted: summary.drafted.length,
      skipped: summary.skipped.length,
      failed: summary.failed.length,
      remaining: Math.max(0, summary.remaining),
    });
  }

  summary.remaining = Math.max(0, summary.remaining);
  return summary;
}

/**
 * Give existing drafts the two things added after they were made: the flyer
 * they came from, and their place in the Planner list.
 *
 * A missing flyer costs a download, so only a few are done per run. A missing
 * order is free, since the task list is already in hand.
 */
const BACKFILL_FLYERS_PER_RUN = 8;

async function backfillFlyersAndOrder(tasks: PlannerTask[], token: string): Promise<void> {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Ordering first: no extra calls, so every stale row can be fixed at once.
  const missingOrder = await db
    .select({ taskId: plannerTasks.taskId })
    .from(plannerTasks)
    .where(and(isNotNull(plannerTasks.savedDraftId), isNull(plannerTasks.assigneePriority)));
  for (const row of missingOrder) {
    const priority = byId.get(row.taskId)?.assigneePriority;
    if (!priority) continue;
    await db
      .update(plannerTasks)
      .set({ assigneePriority: priority })
      .where(eq(plannerTasks.taskId, row.taskId));
  }

  const missingFlyer = await db
    .select({ taskId: plannerTasks.taskId })
    .from(plannerTasks)
    .leftJoin(plannerTaskFlyers, eq(plannerTaskFlyers.taskId, plannerTasks.taskId))
    .where(and(isNotNull(plannerTasks.savedDraftId), isNull(plannerTaskFlyers.taskId)))
    .limit(BACKFILL_FLYERS_PER_RUN);

  for (const row of missingFlyer) {
    try {
      const flyer = await downloadTaskFlyer(row.taskId, token);
      if (!flyer) continue;
      await db.insert(plannerTaskFlyers).values({
        taskId: row.taskId,
        fileName: flyer.fileName,
        pdfBase64: flyer.bytes.toString("base64"),
        bytes: flyer.bytes.length,
      }).onConflictDoNothing();
    } catch (e) {
      console.error(`[planner] could not fetch the flyer for ${row.taskId}:`, e);
    }
  }
}

/** Note that a task was seen and passed over, without claiming it. */
async function recordSkip(task: PlannerTask, communitySlug: string | null, reason: string): Promise<void> {
  await db
    .insert(plannerTasks)
    .values({
      taskId: task.id,
      planId: task.planId,
      communitySlug: communitySlug ?? undefined,
      title: task.title,
      dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
      skipReason: reason,
      attempts: 0,
    })
    .onConflictDoUpdate({
      target: plannerTasks.taskId,
      set: {
        title: task.title,
        dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
        communitySlug: communitySlug ?? undefined,
        skipReason: reason,
      },
    });
}

/**
 * Generate a draft from the task's flyer and store it exactly the way the
 * drafter does, so it opens, edits, approves and pushes like any other.
 */
async function draftFromTask(
  task: PlannerTask,
  communitySlug: string,
  pdf: Buffer,
  draftId: string,
): Promise<void> {
  const community = await getCommunity(communitySlug);
  if (!community) throw new Error(`Unknown community ${communitySlug}`);

  const generated = await generateDraft({ community, pdf });

  const gallery = (generated.galleryImageUrls ?? []).filter((u): u is string => !!u);
  const galleryOriginals = generated.galleryOriginalUrls ?? [];

  // The stored shape mirrors what the editor saves: image URLs are stripped
  // out of the main blob and live in draft_image_bank instead.
  const images = {
    hero: generated.heroImageUrl ? { url: "", originalUrl: "" } : null,
    secondary: generated.secondaryImageUrl ? { url: "", originalUrl: "" } : null,
    gallery: gallery.map(() => ({ url: "", originalUrl: "" })),
  };

  const data = {
    id: draftId,
    communitySlug: community.slug,
    communityName: community.displayName,
    savedAt: new Date().toISOString(),
    subject: generated.extracted.subject ?? task.title,
    fields: generated.extracted,
    images,
    imageBank: [],
    imageCount: (generated.heroImageUrl ? 1 : 0) + (generated.secondaryImageUrl ? 1 : 0) + gallery.length,
    pastSendsContext: generated.pastSendsContext ?? [],
    subjectSpecialist: generated.subjectSpecialist ?? null,
  };

  await db.insert(savedDrafts).values({
    id: draftId,
    communitySlug: community.slug,
    communityName: community.displayName,
    savedAt: new Date(),
    subject: data.subject,
    imageCount: data.imageCount,
    data,
  });

  const rows = buildImageRows(
    {
      hero: generated.heroImageUrl
        ? { url: generated.heroImageUrl, originalUrl: generated.heroOriginalUrl ?? generated.heroImageUrl }
        : null,
      secondary: generated.secondaryImageUrl
        ? {
            url: generated.secondaryImageUrl,
            originalUrl: generated.secondaryOriginalUrl ?? generated.secondaryImageUrl,
          }
        : null,
      gallery: gallery.map((url, i) => ({ url, originalUrl: galleryOriginals[i] ?? url })),
    },
    generated.allExtractedImageUrls ?? [],
  );

  const deduped = dedupeImageRows(rows);
  if (deduped.length) {
    await db
      .insert(draftImageBank)
      .values(deduped.map(({ idx, url }) => ({ draftId, idx, url })))
      .onConflictDoUpdate({
        target: [draftImageBank.draftId, draftImageBank.idx],
        set: { url: sql`excluded.url` },
      });
  }
}
