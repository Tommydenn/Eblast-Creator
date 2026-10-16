/**
 * Put a draft in Archived, or take it out again.
 *
 * Archived is the one folder nothing moves a draft out of on its own. The
 * tidy-up that keeps only the newest eblast per community skips it, and so
 * does the purge. Putting a draft here is a decision to keep it, and a folder
 * that quietly emptied itself would be no different from Done.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { archived?: boolean };
  try {
    body = await req.json();
  } catch {
    body = { archived: true };
  }
  const archived = body.archived !== false;

  try {
    const updated = await db
      .update(savedDrafts)
      .set({
        archivedAt: archived ? new Date() : null,
        // Archiving something that was in the bin takes it back out, which is
        // what someone means by it: they want to keep this one.
        ...(archived ? { deletedAt: null } : {}),
      })
      .where(eq(savedDrafts.id, params.id))
      .returning({ id: savedDrafts.id });

    if (updated.length === 0) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, archived });
  } catch (err) {
    console.error("[saved-drafts/[id]/archive POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
