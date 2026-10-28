/**
 * Checks the date and time rules the drafter no longer decides for itself.
 *
 * Times have one house style and weekdays are arithmetic, so both are worked
 * out in code. This pins the cases that matter: the shapes a flyer writes a
 * time range in, the weekday for dates whose year the flyer never printed,
 * and the one case where the flyer contradicts itself.
 *
 *   npx tsx scripts/check-event-datetime.ts
 */
import { normalizeEventTime, resolveEventDate } from "@/lib/event-datetime";

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

// ── Times ──────────────────────────────────────────────────────────────────
const TIMES: Array<[string, string]> = [
  ["4:00 PM - 5:30 PM", "4:00 PM - 5:30 PM"],
  ["4-5:30 PM", "4:00 PM - 5:30 PM"],
  ["4:00PM-5:30PM", "4:00 PM - 5:30 PM"],
  ["4:00 – 5:30 PM", "4:00 PM - 5:30 PM"],
  ["4:00 PM to 5:30 PM", "4:00 PM - 5:30 PM"],
  ["10 AM - 2 PM", "10:00 AM - 2:00 PM"],
  // A bare start takes the end's half of the day unless that runs backwards.
  ["10 - 2 PM", "10:00 AM - 2:00 PM"],
  ["1 - 3 PM", "1:00 PM - 3:00 PM"],
  // Single times still get minutes and a space.
  ["2pm", "2:00 PM"],
  ["2 PM", "2:00 PM"],
  ["11:30am", "11:30 AM"],
  // The old leading separator comes off.
  ["· 2:00 PM", "2:00 PM"],
  ["· 4:00 PM - 5:30 PM", "4:00 PM - 5:30 PM"],
  // Anything that is not a time is left exactly as it is.
  ["Doors open early", "Doors open early"],
  ["", ""],
];
for (const [input, want] of TIMES) {
  const got = normalizeEventTime(input);
  if (got !== want) fail(`time ${JSON.stringify(input)} gave ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

// ── Weekdays ───────────────────────────────────────────────────────────────
const anchor = new Date(Date.UTC(2026, 9, 27)); // 27 October 2026, a Tuesday

const DATES: Array<[string, string, string | null]> = [
  // No weekday on the flyer: the right one is worked out and added.
  ["November 5", "Thursday, November 5", null],
  ["Nov 5", "Thursday, Nov 5", null],
  ["December 25", "Friday, December 25", null],
  // Already correct: left as it reads.
  ["Thursday, November 5", "Thursday, November 5", null],
  // Wrong weekday on the flyer: corrected, and flagged.
  ["Monday, November 5", "Thursday, November 5", "conflict"],
  ["Wed, November 5", "Thursday, November 5", "conflict"],
  // A date earlier in the year than the anchor belongs to next year, and its
  // weekday comes from that year.
  ["January 5", "Tuesday, January 5", null],
  // An explicit year is believed over any inference.
  ["October 22, 2026", "Thursday, October 22, 2026", null],
  // Not a date: untouched.
  ["Save the date", "Save the date", null],
];
for (const [input, wantText, wantConflict] of DATES) {
  const got = resolveEventDate(input, anchor);
  if (got.text !== wantText) fail(`date ${JSON.stringify(input)} gave ${JSON.stringify(got.text)}, wanted ${JSON.stringify(wantText)}`);
  if (wantConflict && !got.conflict) fail(`date ${JSON.stringify(input)} should have reported a conflict`);
  if (!wantConflict && got.conflict) fail(`date ${JSON.stringify(input)} reported a conflict it should not have: ${got.conflict}`);
}

// The weekday must agree with a real calendar, not just with itself.
for (const [label, y, m, d, weekday] of [
  ["2026-11-05", 2026, 10, 5, "Thursday"],
  ["2027-01-05", 2027, 0, 5, "Tuesday"],
  ["2026-12-25", 2026, 11, 25, "Friday"],
] as Array<[string, number, number, number, string]>) {
  const real = new Date(Date.UTC(y, m, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  if (real !== weekday) fail(`${label} is a ${real}, so this check's own expectation is wrong`);
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `\n${TIMES.length} time formats and ${DATES.length} dates all resolve correctly, ` +
  `and the weekdays agree with the calendar.`,
);
