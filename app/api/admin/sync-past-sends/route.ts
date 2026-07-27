// Manual, on-demand version of the daily cron (app/api/cron/sync-past-sends).
// Lets us trigger a sync for a single HubSpot portal right now instead of
// waiting for the next scheduled run — useful when wiring up a brand-new
// account (e.g. Amira) and wanting to see mapping results immediately.
//
// GET /api/admin/sync-past-sends?account=amira
//   &skipStats=1            (optional) skip per-email stats fetch, faster
//   &refreshStatsOnly=1     (optional) only refresh stats for rows already in DB

import { NextRequest, NextResponse } from "next/server";
import { syncPastSends } from "@/lib/past-sends-sync";
import type { HubspotAccount } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const accountParam = params.get("account") ?? "primary";
  if (accountParam !== "primary" && accountParam !== "amira") {
    return NextResponse.json({ ok: false, error: `Unknown account "${accountParam}". Use "primary" or "amira".` }, { status: 400 });
  }
  const account = accountParam as HubspotAccount;

  try {
    const result = await syncPastSends({
      verbose: false,
      account,
      skipStats: params.get("skipStats") === "1",
      refreshStatsOnly: params.get("refreshStatsOnly") === "1",
    });
    return NextResponse.json({ ok: true, account, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
