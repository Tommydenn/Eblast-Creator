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
import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/graph";
import { listAssignedTasks } from "@/lib/planner";
import { listFbEventTasks, syncFbEventTasks } from "@/lib/fb-events";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, events: await listFbEventTasks() });
}

export async function POST() {
  const userEmail = process.env.PLANNER_USER_EMAIL;
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "PLANNER_USER_EMAIL is not set" }, { status: 400 });
  }
  try {
    const token = await getGraphToken();
    const all = await listAssignedTasks(userEmail, token);
    const summary = await syncFbEventTasks(all, token);
    return NextResponse.json({ ok: true, scanned: all.length, ...summary, events: await listFbEventTasks() });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
