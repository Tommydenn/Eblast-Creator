import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts, savedDraftApprovals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { isApprovalActionable, newestApprovalTokenByDraft } from "@/lib/approval-status";

// GET /api/saved-drafts/[id]  — returns the full draft including image data,
// plus lock-relevant metadata (approvedAt/pushedAt/pendingApproval) so the
// editor can determine whether further edits must go to a copy instead of
// this row — see DraftContext's lockInfo.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const rows = await db.select().from(savedDrafts).where(eq(savedDrafts.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    // A leftover pending row is not an outstanding request — see
    // approvalBlockedReason. Without this an approved draft reported both
    // "Approved" and "Pending Approval" at the same time.
    const approvals = await db
      .select({
        token: savedDraftApprovals.token,
        savedDraftId: savedDraftApprovals.savedDraftId,
        decision: savedDraftApprovals.decision,
        sentAt: savedDraftApprovals.sentAt,
        isTest: savedDraftApprovals.isTest,
      })
      .from(savedDraftApprovals)
      .where(eq(savedDraftApprovals.savedDraftId, id));
    const newestToken = newestApprovalTokenByDraft(approvals).get(id);
    const pendingApproval = approvals.some((a) =>
      isApprovalActionable({
        decision: a.decision,
        sentAt: a.sentAt,
        draft: rows[0],
        isNewestForDraft: a.token === newestToken,
        isTest: a.isTest,
      }),
    );
    return NextResponse.json({
      ok: true,
      draft: rows[0].data,
      approvedAt: rows[0].approvedAt,
      pushedAt: rows[0].pushedAt,
      pendingApproval,
    });
  } catch (err) {
    console.error("[saved-drafts/[id] GET]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// DELETE /api/saved-drafts/[id]
// Soft-deletes by default (moves to the Deleted Drafts view, recoverable for
// 30 days — see app/api/cron/purge-deleted-drafts). Pass ?permanent=1 to
// hard-delete immediately instead (used by the Deleted Drafts view's "Delete
// Forever" action).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const permanent = req.nextUrl.searchParams.get("permanent") === "1";
  try {
    if (permanent) {
      await db.delete(savedDrafts).where(eq(savedDrafts.id, id));
    } else {
      await db.update(savedDrafts).set({ deletedAt: new Date() }).where(eq(savedDrafts.id, id));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[saved-drafts/[id] DELETE]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
