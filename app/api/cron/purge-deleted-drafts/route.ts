/**
 * The nightly tidy-up.
 *
 * Two jobs. It retires an eblast once a newer one for the same community has
 * been pushed or approved, which is what keeps Done to one per community and
 * stops it growing forever. Then it permanently deletes anything that has sat
 * in Deleted long enough.
 *
 * Archived is left alone by both. Putting a draft there is a decision to keep
 * it, and a folder that emptied itself would be no different from Done.
 *
 * Same auth pattern as app/api/cron/sync-past-sends: Vercel Cron sends a
 * Bearer token matching the CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts, pendingFlyers } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { PURGE_AFTER_DAYS } from "@/lib/draft-folders";

/**
 * Replacements from this date onward retire the eblast they replace.
 *
 * The backlog that existed when the rule arrived is left where it is. Clearing
 * it is a separate, deliberate act — see the note on the retire query below.
 */
const RETIRE_FROM = new Date("2026-10-16T00:00:00Z");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;



export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Retire the ones a newer eblast has replaced. Only pushed or approved
    // drafts count as replacements and only they can be replaced: something
    // still being written is not a send, and should not push anything out.
    //
    // The newest one per community stays wherever it is. Everything older
    // goes to Deleted, where it is recoverable for a week.
    //
    // Only replacements made since RETIRE_FROM count. When this rule arrived
    // there were 107 finished eblasts across 28 communities, and retiring
    // every superseded one would have moved 79 of them to Deleted on the
    // first night. That may well be wanted, but it is a decision to make
    // deliberately rather than something a tidy-up does on its own the first
    // time it runs. From here on it keeps pace, one at a time.
    const retired = await db.execute(sql`
      update saved_drafts d
      set deleted_at = now()
      where d.deleted_at is null
        and d.archived_at is null
        and (d.pushed_at is not null or d.approved_at is not null)
        and exists (
          select 1 from saved_drafts newer
          where newer.community_slug = d.community_slug
            and newer.id <> d.id
            and newer.deleted_at is null
            and (newer.pushed_at is not null or newer.approved_at is not null)
            and coalesce(newer.approved_at, newer.pushed_at) > coalesce(d.approved_at, d.pushed_at)
            and coalesce(newer.approved_at, newer.pushed_at) >= ${RETIRE_FROM}
        )
      returning d.id
    `);

    const purged = await db
      .delete(savedDrafts)
      .where(
        sql`${savedDrafts.deletedAt} is not null
            and ${savedDrafts.archivedAt} is null
            and ${savedDrafts.deletedAt} < now() - interval '${sql.raw(String(PURGE_AFTER_DAYS))} days'`,
      )
      .returning({ id: savedDrafts.id });

    // A flyer uploaded by hand waits in staging until its draft is saved and
    // claims it. Anything still waiting a day later belongs to a generation
    // that was abandoned, and would otherwise sit in the database forever.
    const staleFlyers = await db
      .delete(pendingFlyers)
      .where(sql`${pendingFlyers.createdAt} < now() - interval '1 day'`)
      .returning({ key: pendingFlyers.key });

    const retiredCount = Array.isArray((retired as any)?.rows)
      ? (retired as any).rows.length
      : Number((retired as any)?.rowCount ?? 0);

    return NextResponse.json({
      ok: true,
      retired: retiredCount,
      purged: purged.length,
      staleFlyers: staleFlyers.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
