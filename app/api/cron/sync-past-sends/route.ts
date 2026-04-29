// Daily cron — keeps `past_sends` fresh.
// Runs the same `syncPastSends()` logic as the CLI (walks HubSpot list, maps
// to community, fetches stats). Idempotent.
//
// Wired up in `vercel.json` to run once a day. Authenticates via Vercel's
// CRON_SECRET shared secret so external callers can't trigger arbitrary
// HubSpot-API + Claude-API spend.

import { NextRequest, NextResponse } from "next/server";
import { syncPastSends } from "@/lib/past-sends-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron sends a Bearer token matching the CRON_SECRET env var.
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncPastSends({ verbose: false });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
