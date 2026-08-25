import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts, savedDraftApprovals } from "@/lib/db/schema";
import { eq, desc, inArray, isNull, and } from "drizzle-orm";
import { isApprovalActionable, newestApprovalTokenByDraft } from "@/lib/approval-status";

// GET /api/saved-drafts?communitySlug=X  — filter by community (omit for all)
// Only returns non-deleted drafts — see /api/saved-drafts/deleted for the trash view.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("communitySlug");
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

    const rows = rawRows.map(({ data, ...meta }) => ({
      ...meta,
      isNewFormat: !!(data as any)?.fields,
      pendingApproval: pendingIds.has(meta.id),
    }));
    return NextResponse.json({ ok: true, drafts: rows });
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
