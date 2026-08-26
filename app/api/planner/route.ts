/**
 * What the Pending Drafts tab talks to.
 *
 *   GET   — the lookahead setting and, if one is going, the run in progress
 *   POST  — start a run now
 *   PATCH — change the lookahead
 *
 * Open to anyone using the app, deliberately: a run only ever creates drafts,
 * and approving, pushing and sending all remain manual.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plannerRuns } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { startPlannerRun } from "@/lib/planner-chain";
import { currentRun } from "@/lib/planner-run";
import {
  LOOKAHEAD_MAX,
  LOOKAHEAD_MIN,
  getLookaheadDays,
  setLookaheadDays,
} from "@/lib/planner-settings";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function state() {
  const [lookaheadDays, running] = await Promise.all([getLookaheadDays(), currentRun()]);
  const [last] = await db
    .select()
    .from(plannerRuns)
    .orderBy(desc(plannerRuns.startedAt))
    .limit(1);
  return {
    lookaheadDays,
    min: LOOKAHEAD_MIN,
    max: LOOKAHEAD_MAX,
    configured: !!process.env.PLANNER_USER_EMAIL,
    running: running
      ? {
          id: running.id,
          startedAt: running.startedAt,
          drafted: running.drafted,
          skipped: running.skipped,
          failed: running.failed,
          remaining: running.remaining,
          currentTask: running.currentTask,
        }
      : null,
    lastRun: last
      ? {
          status: last.status,
          finishedAt: last.finishedAt,
          drafted: last.drafted,
          skipped: last.skipped,
          failed: last.failed,
          remaining: last.remaining,
          error: last.error,
        }
      : null,
  };
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await state()) });
  } catch (e: any) {
    console.error("[planner GET]", e);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw = Number(body?.lookaheadDays);
  if (!Number.isFinite(raw)) {
    return NextResponse.json({ ok: false, error: "lookaheadDays must be a number" }, { status: 400 });
  }
  try {
    // Out-of-range values are clamped rather than rejected, so the control can
    // never be left in a state the run wouldn't accept.
    const lookaheadDays = await setLookaheadDays(raw);
    return NextResponse.json({ ok: true, lookaheadDays });
  } catch (e: any) {
    console.error("[planner PATCH]", e);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

export async function POST() {
  if (!process.env.PLANNER_USER_EMAIL) {
    return NextResponse.json({ ok: false, error: "No Planner account is configured." }, { status: 400 });
  }
  try {
    const result = await startPlannerRun("manual");
    if (!result.started) {
      return NextResponse.json({ ok: false, error: result.reason ?? "Already running" }, { status: 409 });
    }
    const s = result.summary!;
    return NextResponse.json({
      ok: true,
      runId: result.runId,
      handedOff: result.handedOff,
      drafted: s.drafted.length,
      skipped: s.skipped.length,
      failed: s.failed.length,
      recovered: s.recovered,
      remaining: s.remaining,
    });
  } catch (e: any) {
    console.error("[planner POST]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
