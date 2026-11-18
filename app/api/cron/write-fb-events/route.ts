/**
 * The daily pass that writes the Facebook events ahead of time.
 *
 * Fired at both 14:00 and 15:00 UTC for the same reason the eblast pass is
 * fired at 12:00 and 13:00: only one of those is 9:00 AM in Chicago, and
 * which one changes with daylight saving. An hour after the eblasts, so a
 * task drafted this morning is written from the draft rather than the flyer.
 *
 * It reads Planner first, so an event added yesterday is known about before
 * anything is written for it.
 *
 * Nothing here posts anything. Facebook has no API that creates an event and
 * Further's has no write method for one, so this only prepares the words.
 */
import { NextRequest, NextResponse } from "next/server";
import { getGraphToken } from "@/lib/graph";
import { listAssignedTasks } from "@/lib/planner";
import { isScheduledHour } from "@/lib/planner-settings";
import { finishWrittenFbEvents, syncFbEventTasks, writePendingFbEvents } from "@/lib/fb-events";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SCHEDULED_HOUR_LOCAL = 9;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.PLANNER_USER_EMAIL) {
    return NextResponse.json({ ok: false, error: "PLANNER_USER_EMAIL is not set" }, { status: 400 });
  }
  // ?force=1 runs it now, for trying it out without waiting for the hour.
  const forced = req.nextUrl.searchParams.get("force") === "1";
  if (!forced && !isScheduledHour(SCHEDULED_HOUR_LOCAL)) {
    return NextResponse.json({ ok: true, skipped: "not 9:00 AM Central" });
  }

  try {
    const token = await getGraphToken();
    const all = await listAssignedTasks(process.env.PLANNER_USER_EMAIL, token);
    const sync = await syncFbEventTasks(all, token);
    const wrote = await writePendingFbEvents();
    const finished = await finishWrittenFbEvents();
    console.log(
      `[cron/write-fb-events] ${sync.seen} open, ${sync.paired} paired; ` +
        `considered ${wrote.considered}, wrote ${wrote.written}, ` +
        `skipped ${wrote.skipped}, failed ${wrote.failed}`,
    );
    return NextResponse.json({ ok: true, sync, wrote, finished });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[cron/write-fb-events] failed:", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
