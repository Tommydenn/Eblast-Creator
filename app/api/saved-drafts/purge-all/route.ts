/**
 * Empty the bin now, rather than waiting out the week.
 *
 * Everything in Deleted, and nothing else — archiving a draft takes it out of
 * Deleted, so there is no overlap to worry about.
 *
 * This is a hard delete. The drafts go, and so do their flyers, their photos
 * and their approval records.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const inTheBin = isNotNull(savedDrafts.deletedAt);

  try {
    if (body.dryRun) {
      const rows = await db
        .select({ id: savedDrafts.id, subject: savedDrafts.subject })
        .from(savedDrafts)
        .where(inTheBin);
      return NextResponse.json({ ok: true, dryRun: true, count: rows.length });
    }

    const gone = await db.delete(savedDrafts).where(inTheBin).returning({ id: savedDrafts.id });
    return NextResponse.json({ ok: true, deleted: gone.length });
  } catch (err) {
    console.error("[saved-drafts/purge-all POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
