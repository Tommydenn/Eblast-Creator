import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts, savedDraftApprovals, plannerTasks, draftFlyers } from "@/lib/db/schema";
import { eq, desc, inArray, isNull, isNotNull, and } from "drizzle-orm";
import { isApprovalActionable, newestApprovalTokenByDraft } from "@/lib/approval-status";

// GET /api/saved-drafts?communitySlug=X  — filter by community (omit for all)
// Only returns non-deleted drafts — see /api/saved-drafts/deleted for the trash view.
/**
 * ?view=pending  — drafts the schedule made from a Planner task that nobody
 *                  has acted on yet. This is the "Pending Drafts" tab.
 * ?view=saved    — everything else: drafts made by hand, plus scheduled ones
 *                  that have since been pushed or approved, which are then a
 *                  record rather than something waiting for you.
 * omitted        — everything, unchanged, for any other caller.
 *
 * A draft never appears under both, and a scheduled draft moves from one to
 * the other by being acted on rather than by anything changing about it.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("communitySlug");
  const view = req.nextUrl.searchParams.get("view");
  try {
    const query = db
      .select({
        id: savedDrafts.id,
        communitySlug: savedDrafts.communitySlug,
        communityName: savedDrafts.communityName,
        savedAt: savedDrafts.savedAt,
        subject: savedDrafts.subject,
        imageCount: savedDrafts.imageCount,
        approvedAt: savedDrafts.approvedAt,
        pushedAt: savedDrafts.pushedAt,
        data: savedDrafts.data,
      })
      .from(savedDrafts)
      .orderBy(desc(savedDrafts.savedAt));
    const rawRows = slug
      ? await query.where(and(eq(savedDrafts.communitySlug, slug), isNull(savedDrafts.deletedAt)))
      : await query.where(isNull(savedDrafts.deletedAt));

    // Which drafts are genuinely still waiting on a reviewer. All approval
    // rows for these drafts are fetched (not just the pending ones) because
    // "is this the newest request for the draft" is part of the test — an old
    // pending row superseded by a re-send isn't outstanding. See
    // approvalBlockedReason for the rest: approved, pushed, deleted, expired.
    const allApprovals = rawRows.length
      ? await db
          .select({
            token: savedDraftApprovals.token,
            savedDraftId: savedDraftApprovals.savedDraftId,
            decision: savedDraftApprovals.decision,
            sentAt: savedDraftApprovals.sentAt,
            isTest: savedDraftApprovals.isTest,
          })
          .from(savedDraftApprovals)
          .where(inArray(savedDraftApprovals.savedDraftId, rawRows.map((r) => r.id)))
      : [];
    const newestByDraft = newestApprovalTokenByDraft(allApprovals);
    const draftById = new Map(rawRows.map((r) => [r.id, r]));
    const pendingIds = new Set(
      allApprovals
        .filter((a) =>
          isApprovalActionable({
            decision: a.decision,
            sentAt: a.sentAt,
            // rawRows already excludes deleted drafts, so a miss here means
            // deleted — represent that rather than treating it as unknown.
            draft: draftById.get(a.savedDraftId) ?? null,
            isNewestForDraft: newestByDraft.get(a.savedDraftId) === a.token,
            isTest: a.isTest,
          }),
        )
        .map((a) => a.savedDraftId),
    );

    // Where each draft came from. A row here means a Planner task produced it;
    // the task's title and due date ride along, since the due date is the day
    // the eblast actually has to go out.
    const taskRows = rawRows.length
      ? await db
          .select({
            savedDraftId: plannerTasks.savedDraftId,
            taskTitle: plannerTasks.title,
            dueAt: plannerTasks.dueAt,
            assigneePriority: plannerTasks.assigneePriority,
          })
          .from(plannerTasks)
          .where(inArray(plannerTasks.savedDraftId, rawRows.map((r) => r.id)))
      : [];
    const taskByDraft = new Map(taskRows.filter((t) => t.savedDraftId).map((t) => [t.savedDraftId!, t]));

    // Flyers are looked up per draft rather than through the Planner task.
    // A draft written by hand from a flyer keeps that flyer too, but has no
    // task, so reaching the flyer through plannerTasks meant only scheduled
    // drafts ever reported one — the link never appeared in Saved Drafts even
    // when the PDF was sitting in the database.
    const flyerRows = rawRows.length
      ? await db
          .select({ draftId: draftFlyers.draftId, fileName: draftFlyers.fileName })
          .from(draftFlyers)
          .where(inArray(draftFlyers.draftId, rawRows.map((r) => r.id)))
      : [];
    const flyerByDraft = new Map(flyerRows.map((f) => [f.draftId, f.fileName]));

    let rows = rawRows.map(({ data, ...meta }) => {
      const task = taskByDraft.get(meta.id);
      return {
        ...meta,
        isNewFormat: !!(data as any)?.fields,
        pendingApproval: pendingIds.has(meta.id),
        fromPlanner: !!task,
        taskTitle: task?.taskTitle ?? null,
        dueAt: task?.dueAt ?? null,
        assigneePriority: task?.assigneePriority ?? null,
        /** Whether the flyer it was generated from can be opened alongside it. */
        hasFlyer: flyerByDraft.has(meta.id),
        flyerName: flyerByDraft.get(meta.id) ?? null,
      };
    });

    const awaitingAction = (r: (typeof rows)[number]) => r.fromPlanner && !r.pushedAt && !r.approvedAt;
    if (view === "pending") {
      // Same order as Planner's My Tasks list. assigneePriority is Planner's
      // own ordering value for that list — opaque strings that sort
      // lexicographically — so matching it means the first task on screen
      // there is the first draft here. Tasks that have never been given a
      // position have none, and fall back to the send deadline.
      const byPriority = rows.filter(awaitingAction).filter((r) => r.assigneePriority);
      const rest = rows.filter(awaitingAction).filter((r) => !r.assigneePriority);
      byPriority.sort((a, b) => String(a.assigneePriority).localeCompare(String(b.assigneePriority)));
      rest.sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime());
      rows = [...byPriority, ...rest];
    } else if (view === "saved") {
      rows = rows.filter((r) => !awaitingAction(r));
    }

    // Tasks the schedule looked at and couldn't draft. These only ever
    // reached a log line before, which meant a community missing from the app
    // was invisible: the eblast simply never appeared and nothing said why.
    // They ride along with the pending view so they surface where someone is
    // actually looking.
    let needsAttention: Array<{
      taskId: string;
      title: string;
      dueAt: Date | null;
      reason: string;
      kind: "missing_community" | "waiting_on_flyer" | "other";
    }> = [];
    if (view === "pending") {
      const stuck = await db
        .select({
          taskId: plannerTasks.taskId,
          title: plannerTasks.title,
          dueAt: plannerTasks.dueAt,
          reason: plannerTasks.skipReason,
        })
        .from(plannerTasks)
        .where(and(isNull(plannerTasks.savedDraftId), isNotNull(plannerTasks.skipReason)));

      needsAttention = stuck
        .map((t) => ({
          taskId: t.taskId,
          title: t.title,
          dueAt: t.dueAt,
          reason: t.reason ?? "",
          kind: /doesn't match a known community/i.test(t.reason ?? "")
            ? ("missing_community" as const)
            : /no flyer/i.test(t.reason ?? "")
              ? ("waiting_on_flyer" as const)
              : ("other" as const),
        }))
        // A missing community needs someone to add it; a missing flyer sorts
        // itself out. Put the ones needing action first, then by deadline.
        .sort((a, b) => {
          const rank = (k: string) => (k === "missing_community" ? 0 : k === "other" ? 1 : 2);
          return rank(a.kind) - rank(b.kind) ||
            new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime();
        });
    }

    return NextResponse.json({ ok: true, drafts: rows, needsAttention });
  } catch (err) {
    console.error("[saved-drafts GET]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// POST /api/saved-drafts  — saves a draft. No limit on how many a community
// may keep: drafts are only ever removed when someone deletes one.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.draft) {
    return NextResponse.json({ ok: false, error: "Missing draft" }, { status: 400 });
  }
  const { draft } = body;
  const { id, communitySlug, communityName, savedAt, subject, imageCount } = draft;
  if (!id || !communitySlug) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }
  try {
    await db.insert(savedDrafts)
      .values({
        id,
        communitySlug,
        communityName: communityName ?? communitySlug,
        savedAt: new Date(savedAt ?? Date.now()),
        subject: subject ?? "",
        imageCount: imageCount ?? 0,
        data: draft,
      })
      .onConflictDoUpdate({
        target: savedDrafts.id,
        set: {
          communitySlug,
          communityName: communityName ?? communitySlug,
          savedAt: new Date(savedAt ?? Date.now()),
          subject: subject ?? "",
          imageCount: imageCount ?? 0,
          data: draft,
        },
      });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[saved-drafts POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
