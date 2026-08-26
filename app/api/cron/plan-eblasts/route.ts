/**
 * Daily pass over the Planner task list, creating eblast drafts.
 *
 * Wired up in vercel.json. Authenticates with the same CRON_SECRET the other
 * jobs use, so nothing external can trigger Claude and Graph spend.
 *
 * Nothing here sends an eblast. It creates drafts and marks their tasks In
 * progress; approving, pushing and sending all stay manual.
 *
 * ?dryRun=1 reports what it would do and writes nothing — safe to call by
 * hand while checking behaviour.
 */
import { NextRequest, NextResponse } from "next/server";
import { runPlannerDraftPass } from "@/lib/planner-drafts";

export const runtime = "nodejs";
// Each draft is two Claude calls plus a PDF download; the pass stops starting
// new ones well before this and leaves the rest for tomorrow.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.PLANNER_USER_EMAIL) {
    return NextResponse.json(
      { ok: false, error: "PLANNER_USER_EMAIL is not set — nothing to read." },
      { status: 400 },
    );
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  try {
    const summary = await runPlannerDraftPass({ dryRun, limit, startedAt: Date.now() });
    console.log(
      `[cron/plan-eblasts]${dryRun ? " (dry run)" : ""} scanned ${summary.scanned}, ` +
        `${summary.candidates} candidate(s), drafted ${summary.drafted.length}, ` +
        `skipped ${summary.skipped.length}, failed ${summary.failed.length}` +
        (summary.ranOutOfTime ? ", stopped on time budget" : ""),
    );
    return NextResponse.json({ ok: true, dryRun, ...summary });
  } catch (e: any) {
    console.error("[cron/plan-eblasts] failed:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
