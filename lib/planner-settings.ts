/**
 * How far ahead the Planner pass drafts, and when it runs.
 */
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const LOOKAHEAD_KEY = "planner_lookahead_days";
export const LOOKAHEAD_MIN = 1;
export const LOOKAHEAD_MAX = 60;
export const LOOKAHEAD_DEFAULT = 30;

/** The office's timezone. The schedule and the day window both use it. */
export const PLANNER_TIMEZONE = "America/Chicago";

export function clampLookahead(value: number): number {
  if (!Number.isFinite(value)) return LOOKAHEAD_DEFAULT;
  return Math.min(LOOKAHEAD_MAX, Math.max(LOOKAHEAD_MIN, Math.round(value)));
}

export async function getLookaheadDays(): Promise<number> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, LOOKAHEAD_KEY)).limit(1);
  return row ? clampLookahead(Number(row.value)) : LOOKAHEAD_DEFAULT;
}

export async function setLookaheadDays(value: number): Promise<number> {
  const days = clampLookahead(value);
  await db
    .insert(appSettings)
    .values({ key: LOOKAHEAD_KEY, value: String(days), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(days), updatedAt: new Date() },
    });
  return days;
}

/** The calendar date in the office's timezone, as YYYY-MM-DD. */
function localDate(at: Date, timeZone = PLANNER_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * The last calendar day a task may be due on and still be drafted.
 *
 * Whole days, not a rolling 24 hours, because the tasks are scheduled by day:
 * at 7am on Thursday with a lookahead of 1, everything due on Thursday AND
 * everything due on Friday is in scope. Counting hours would take in only part
 * of Friday and leave the rest of that day's work undrafted.
 */
export function lastDayInWindow(lookaheadDays: number, now: Date = new Date()): string {
  const days = clampLookahead(lookaheadDays);
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return localDate(end);
}

/** True when the task's due date falls on or before the last day in the window. */
export function isDueWithinWindow(
  dueDateTime: string | null,
  lookaheadDays: number,
  now: Date = new Date(),
): boolean {
  if (!dueDateTime) return false;
  const due = new Date(dueDateTime);
  if (Number.isNaN(due.getTime())) return false;
  // Compared as dates, so a task due later today is still in scope even though
  // its timestamp has already passed this morning's run.
  return localDate(due) <= lastDayInWindow(lookaheadDays, now);
}

/**
 * Whether it is currently the scheduled hour in the office's timezone.
 *
 * Vercel's scheduler only speaks UTC, so the cron fires at both hours that
 * could be 7am in Chicago and this decides which one is real. Without it the
 * run would drift an hour every time daylight saving changes.
 */
export function isScheduledHour(hour = 7, now: Date = new Date()): boolean {
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: PLANNER_TIMEZONE,
    hour: "numeric",
    hour12: false,
  }).format(now);
  return Number(local) === hour;
}
