// Daily cron — permanently deletes saved drafts that have been sitting in the
// Deleted Drafts view for 30+ days. Same auth pattern as
// app/api/cron/sync-past-sends: Vercel Cron sends a Bearer token matching the
// CRON_SECRET env var.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PURGE_AFTER_DAYS = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const purged = await db
      .delete(savedDrafts)
      .where(
        sql`${savedDrafts.deletedAt} is not null and ${savedDrafts.deletedAt} < now() - interval '${sql.raw(String(PURGE_AFTER_DAYS))} days'`,
      )
      .returning({ id: savedDrafts.id });
    return NextResponse.json({ ok: true, purged: purged.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
