/**
 * The Facebook event tasks.
 *
 *   GET  — what is on file, with each one's pairing to its eblast
 *   POST — read Planner again and bring the list up to date
 *
 * The daily Planner pass already does the POST's work as it goes, so this is
 * for seeing the effect of a change now rather than tomorrow. It is separate
 * from /api/planner on purpose: that one drafts eblasts and marks tasks In
 * progress, and refreshing a list should not do either.
 */
import { NextRequest, NextResponse } from "next/server";
import { getGraphToken } from "@/lib/graph";
import { listAssignedTasks } from "@/lib/planner";
import { listFbEventTasks, syncFbEventTasks, writePendingFbEvents } from "@/lib/fb-events";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, events: await listFbEventTasks() });
}

export async function POST(req: NextRequest) {
  const userEmail = process.env.PLANNER_USER_EMAIL;
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "PLANNER_USER_EMAIL is not set" }, { status: 400 });
  }
  // ?write=1 also writes the copy for anything inside the lookahead, which is
  // what the daily pass does — here so it can be done now rather than
  // tomorrow morning. Open for the same reason /api/planner is: it only ever
  // prepares words, and nothing is posted anywhere without a person.
  const write = req.nextUrl.searchParams.get("write") === "1";
  try {
    const token = await getGraphToken();
    const all = await listAssignedTasks(userEmail, token);
    const summary = await syncFbEventTasks(all, token);
    const wrote = write ? await writePendingFbEvents() : null;
    return NextResponse.json({
      ok: true,
      scanned: all.length,
      ...summary,
      wrote,
      events: await listFbEventTasks(),
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
