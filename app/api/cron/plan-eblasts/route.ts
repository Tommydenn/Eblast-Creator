/**
 * The scheduled pass over the Planner task list.
 *
 * vercel.json fires this at both 12:00 and 13:00 UTC, because only one of
 * those is 7:00 AM in Chicago and which one changes with daylight saving.
 * The hour is checked here so the run happens at 7:00 local all year, and the
 * other firing does nothing.
 *
 * Also the endpoint a run uses to hand off to its successor, via ?chain=N.
 *
 * Nothing here sends an eblast. It creates drafts and marks their tasks In
 * progress; approving, pushing and sending all stay manual.
 */
import { NextRequest, NextResponse } from "next/server";
import { startPlannerRun } from "@/lib/planner-chain";
import { isScheduledHour } from "@/lib/planner-settings";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SCHEDULED_HOUR_LOCAL = 7;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.PLANNER_USER_EMAIL) {
    return NextResponse.json({ ok: false, error: "PLANNER_USER_EMAIL is not set" }, { status: 400 });
  }

  const chainRaw = req.nextUrl.searchParams.get("chain");
  const chainIndex = chainRaw === null ? 0 : Number(chainRaw);
  const isChained = chainRaw !== null && Number.isFinite(chainIndex);

  // A chained run is a continuation and runs whenever it is asked to. Only the
  // scheduled firing is held to the local hour.
  if (!isChained && !isScheduledHour(SCHEDULED_HOUR_LOCAL)) {
    return NextResponse.json({ ok: true, skipped: "not 7:00 AM Central" });
  }

  try {
    const result = await startPlannerRun(isChained ? "chain" : "cron", isChained ? chainIndex : 0);
    if (!result.started) {
      console.log(`[cron/plan-eblasts] skipped — ${result.reason}`);
      return NextResponse.json({ ok: true, skipped: result.reason });
    }
    const s = result.summary!;
    console.log(
      `[cron/plan-eblasts] run ${result.runId} (chain ${chainIndex}): ` +
        `scanned ${s.scanned}, drafted ${s.drafted.length}, skipped ${s.skipped.length}, ` +
        `failed ${s.failed.length}, recovered ${s.recovered}, remaining ${s.remaining}` +
        (result.handedOff ? " — handed off to the next run" : ""),
    );
    return NextResponse.json({ ok: true, runId: result.runId, handedOff: result.handedOff, ...s });
  } catch (e: any) {
    console.error("[cron/plan-eblasts] failed:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
