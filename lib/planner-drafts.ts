/**
 * The daily pass: Planner tasks in, eblast drafts out.
 *
 * What it will act on, and nothing else:
 *   - assigned to the configured person (their "My Tasks")
 *   - status Not started — In progress and Complete are never touched
 *   - title's first word is "Eblast" — "FB Event" and everything else ignored
 *   - due within the look-ahead window
 *   - has a flyer attached, and the plan's title matches a known community
 *
 * A task missing a flyer, or sitting in an unrecognised plan, is recorded with
 * a reason and left Not started, so it is reconsidered tomorrow. That is how a
 * flyer attached late still gets drafted, and how nothing is ever guessed.
 *
 * Nothing here sends anything. A drafted task is marked In progress — never
 * Complete — because a draft is waiting for a person, not finished.
 */
import { db } from "@/lib/db";
import { savedDrafts, plannerTasks, draftImageBank } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { listCommunities, getCommunity } from "@/data/communities";
import {
  isTaskInProgress,
  listAssignedTasks,
  getPlanTitle,
  isEblastTask,
  downloadTaskFlyer,
  markTaskInProgress,
  matchCommunity,
  NOT_STARTED,
  type PlannerTask,
} from "@/lib/planner";
import { getGraphToken } from "@/lib/graph";
import { generateDraft } from "@/lib/generate-draft";
import { buildImageRows, dedupeImageRows } from "@/lib/image-bank";

export interface PlannerRunSummary {
  scanned: number;
  candidates: number;
  drafted: Array<{ task: string; community: string; draftId: string; markedInProgress: boolean }>;
  /** Drafted, but Planner still says Not started. Needs a human to look. */
  notMarked: Array<{ task: string; draftId: string; error: string }>;
  skipped: Array<{ task: string; reason: string }>;
  failed: Array<{ task: string; error: string }>;
  ranOutOfTime: boolean;
}

/** How far ahead to look. Tasks due beyond this are left for a later run. */
const DEFAULT_LOOKAHEAD_DAYS = 30;

/**
 * Stop starting new drafts once this much of the run's budget is gone.
 * Generation is two Claude calls and can take the better part of a minute, so
 * a run does as many as fit and the rest are picked up tomorrow rather than
 * being cut off half-finished.
 */
const TIME_BUDGET_MS = 220_000;

function lookaheadDays(): number {
  const raw = Number(process.env.PLANNER_LOOKAHEAD_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LOOKAHEAD_DAYS;
}

export async function runPlannerDraftPass(opts?: {
  /** Whose tasks to read. Defaults to PLANNER_USER_EMAIL. */
  userEmail?: string;
  /** Report what would happen without generating or writing anything. */
  dryRun?: boolean;
  /** Cap on drafts this run, on top of the time budget. */
  limit?: number;
  startedAt?: number;
}): Promise<PlannerRunSummary> {
  const userEmail = opts?.userEmail ?? process.env.PLANNER_USER_EMAIL;
  if (!userEmail) throw new Error("PLANNER_USER_EMAIL is not set");

  const startedAt = opts?.startedAt ?? Date.now();
  const summary: PlannerRunSummary = {
    scanned: 0,
    candidates: 0,
    drafted: [],
    notMarked: [],
    skipped: [],
    failed: [],
    ranOutOfTime: false,
  };

  const token = await getGraphToken();
  const all = await listAssignedTasks(userEmail, token);
  summary.scanned = all.length;

  const horizon = Date.now() + lookaheadDays() * 24 * 60 * 60 * 1000;
  const candidates = all.filter((t) => {
    if (t.percentComplete !== NOT_STARTED) return false;
    if (!isEblastTask(t.title)) return false;
    if (!t.dueDateTime) return false;
    const due = new Date(t.dueDateTime).getTime();
    return Number.isFinite(due) && due <= horizon;
  });
  summary.candidates = candidates.length;

  // Which tasks already produced a draft. Planner status normally keeps these
  // out of the candidate list anyway; this catches the case where a draft was
  // made but marking the task In progress failed.
  const known = await db
    .select({ taskId: plannerTasks.taskId, savedDraftId: plannerTasks.savedDraftId })
    .from(plannerTasks);
  const alreadyDrafted = new Set(known.filter((k) => k.savedDraftId).map((k) => k.taskId));

  const communities = await listCommunities();
  const planTitleCache = new Map<string, string | null>();

  for (const task of candidates) {
    if (opts?.limit && summary.drafted.length >= opts.limit) break;
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      summary.ranOutOfTime = true;
      break;
    }
    if (alreadyDrafted.has(task.id)) continue;

    try {
      // The community lives in the plan's title, not the task's.
      if (!planTitleCache.has(task.planId)) {
        planTitleCache.set(task.planId, await getPlanTitle(task.planId, token));
      }
      const planTitle = planTitleCache.get(task.planId) ?? null;
      const community = planTitle ? matchCommunity(planTitle, communities) : null;

      if (!community) {
        await recordSkip(task, null, `Plan "${planTitle ?? task.planId}" doesn't match a known community`);
        summary.skipped.push({ task: task.title, reason: `unknown community (plan: ${planTitle ?? "?"})` });
        continue;
      }

      if (task.attachmentCount === 0) {
        await recordSkip(task, community.slug, "No flyer attached yet");
        summary.skipped.push({ task: task.title, reason: "no flyer attached" });
        continue;
      }

      const flyer = await downloadTaskFlyer(task.id, token);
      if (!flyer) {
        await recordSkip(task, community.slug, "Attachment isn't a readable PDF");
        summary.skipped.push({ task: task.title, reason: "attachment isn't a readable PDF" });
        continue;
      }

      if (opts?.dryRun) {
        summary.drafted.push({
          task: task.title,
          community: community.displayName,
          draftId: "(dry run)",
          markedInProgress: false,
        });
        continue;
      }

      const draftId = await draftFromTask(task, community.slug, flyer.bytes);

      // Marking In progress is what removes the task from tomorrow's run. If
      // this fails the draft still exists, and the planner_tasks row above is
      // what stops it being drafted twice.
      let marked = false;
      let markError = "";
      try {
        await markTaskInProgress(task.id, token);
        // Read it back rather than trusting the write: a 2xx that doesn't
        // stick leaves the task Not started, and tomorrow's run would draft
        // the same eblast a second time.
        marked = await isTaskInProgress(task.id, token);
        if (!marked) markError = "Planner accepted the update but the task is still Not started";
      } catch (e: any) {
        markError = e?.message ?? String(e);
      }
      if (!marked) {
        console.error(`[planner] draft ${draftId} made but task ${task.id} not marked in progress: ${markError}`);
        summary.notMarked.push({ task: task.title, draftId, error: markError.slice(0, 200) });
      }

      // Must be an upsert, not an update: a task drafted on the first attempt
      // has no row yet, and an UPDATE would match nothing — leaving the draft
      // with no record of the task it came from, so it would never appear in
      // Pending Drafts and would have no backstop against being drafted again.
      await db
        .insert(plannerTasks)
        .values({
          taskId: task.id,
          planId: task.planId,
          communitySlug: community.slug,
          title: task.title,
          dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
          savedDraftId: draftId,
          markedInProgress: marked,
          draftedAt: new Date(),
          attempts: 1,
        })
        .onConflictDoUpdate({
          target: plannerTasks.taskId,
          set: {
            communitySlug: community.slug,
            title: task.title,
            dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
            savedDraftId: draftId,
            markedInProgress: marked,
            skipReason: null,
            draftedAt: new Date(),
          },
        });

      summary.drafted.push({
        task: task.title,
        community: community.displayName,
        draftId,
        markedInProgress: marked,
      });
    } catch (e: any) {
      const message = e?.message ?? String(e);
      console.error(`[planner] task ${task.id} failed:`, e);
      await recordSkip(task, null, `Generation failed: ${message}`.slice(0, 500));
      summary.failed.push({ task: task.title, error: message.slice(0, 200) });
    }
  }

  return summary;
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
      attempts: 1,
    })
    .onConflictDoUpdate({
      target: plannerTasks.taskId,
      set: {
        title: task.title,
        dueAt: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
        communitySlug: communitySlug ?? undefined,
        skipReason: reason,
        attempts: sql`${plannerTasks.attempts} + 1`,
      },
    });
}

/**
 * Generate a draft from the task's flyer and store it exactly the way the
 * drafter does, so it opens, edits, approves and pushes like any other.
 */
async function draftFromTask(task: PlannerTask, communitySlug: string, pdf: Buffer): Promise<string> {
  const community = await getCommunity(communitySlug);
  if (!community) throw new Error(`Unknown community ${communitySlug}`);

  const generated = await generateDraft({ community, pdf });

  const draftId = `planner-${task.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24)}-${Date.now().toString(36)}`;
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
    imageCount:
      (generated.heroImageUrl ? 1 : 0) + (generated.secondaryImageUrl ? 1 : 0) + gallery.length,
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

  // Photos go to the image bank under the same index convention the editor
  // uses, deduplicated the same way, so the draft loads identically.
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

  return draftId;
}
