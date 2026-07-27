import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/saved-drafts/[id]  — returns the full draft including image data
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const rows = await db.select().from(savedDrafts).where(eq(savedDrafts.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, draft: rows[0].data });
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
