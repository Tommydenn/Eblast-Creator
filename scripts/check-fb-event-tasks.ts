/**
 * Checks how a Facebook event task is paired with its eblast.
 *
 * The pairing is the whole thing. An FB Event task carries no flyer, so what
 * it gets paired to decides what the event is made of — pair it to the wrong
 * eblast and the Facebook event describes a different day at a different
 * building, which reads as correct and is not. The rules are therefore: pair
 * only on an exact name once case and spacing are set aside, prefer the same
 * plan, and leave anything ambiguous unpaired with a note.
 *
 *   npx tsx scripts/check-fb-event-tasks.ts
 */
import { readFileSync } from "node:fs";
import {
  eventNameOf,
  isEblastTask,
  isFbEventTask,
  matchEblastTask,
  sameEvent,
} from "@/lib/planner";
import { facebookEventsUrl } from "@/lib/db/queries";

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

const FB = "FB Event - Home for the Holidays Open House December 8";
const EB = "Eblast - Home for the Holidays Open House December 8";

// ── Telling the two kinds apart ───────────────────────────────────────────
if (!isFbEventTask(FB)) fail("a real FB Event title is not recognised");
if (isFbEventTask(EB)) fail("an eblast title is being read as a Facebook event");
if (isEblastTask(FB)) fail("an FB Event title is being read as an eblast");
if (!isEblastTask(EB)) fail("a real eblast title is no longer recognised");
// These are in the same Planner list and must not be swept up by either rule.
for (const other of ["Mailer - Fall Open House", "Flyer - Oktoberfest", "FB Post - Tour Tuesday"]) {
  if (isFbEventTask(other)) fail(`"${other}" should not count as a Facebook event task`);
  if (isEblastTask(other)) fail(`"${other}" should not count as an eblast task`);
}

// ── The name the pair has in common ───────────────────────────────────────
{
  const want = "Home for the Holidays Open House December 8";
  if (eventNameOf(FB) !== want) fail(`FB name came out as "${eventNameOf(FB)}"`);
  if (eventNameOf(EB) !== want) fail(`eblast name came out as "${eventNameOf(EB)}"`);
}
// The separator is typed by hand and varies.
for (const variant of [
  "FB Event - Fall Social",
  "FB Event – Fall Social",
  "FB Event — Fall Social",
  "FB Event: Fall Social",
  "FB Event Fall Social",
  "  fb event -  Fall Social ",
]) {
  if (eventNameOf(variant) !== "Fall Social") {
    fail(`"${variant}" should name "Fall Social", got "${eventNameOf(variant)}"`);
  }
}
// An eblast with no event after it must not pair with anything.
if (sameEvent("Eblast", "FB Event")) fail("two bare openings must not count as the same event");

// ── Same event, and near misses that are not ──────────────────────────────
if (!sameEvent(FB, EB)) fail("the real pair does not match");
if (!sameEvent("Eblast -  fall   social", "FB Event - Fall Social")) {
  fail("case and extra spaces should be ignored");
}
if (sameEvent("Eblast - Fall Social", "FB Event - Fall Social 2")) {
  fail("a different event is being treated as the same one");
}
if (sameEvent("Eblast - Open House December 8", "FB Event - Open House December 9")) {
  fail("two dates are being treated as the same event");
}

// ── Picking the twin out of the whole list ────────────────────────────────
const task = (id: string, title: string, planId: string) => ({ id, title, planId });
{
  const fb = task("fb1", FB, "planA");
  const right = task("eb1", EB, "planA");
  const all = [fb, right, task("eb2", "Eblast - Something Else", "planA")];
  if (matchEblastTask(fb, all)?.id !== "eb1") fail("the obvious pair was not found");
}
{
  // The same event runs at two communities, each with its own pair. The one
  // in this task's own plan is the right one.
  const fb = task("fb1", FB, "planA");
  const all = [fb, task("eb-a", EB, "planA"), task("eb-b", EB, "planB")];
  if (matchEblastTask(fb, all)?.id !== "eb-a") fail("the twin in the same plan should win");
}
{
  // Two eblasts of the same name in one plan: nothing to choose between them.
  const fb = task("fb1", FB, "planA");
  const all = [fb, task("eb-1", EB, "planA"), task("eb-2", EB, "planA")];
  if (matchEblastTask(fb, all) !== null) fail("an ambiguous pair must be left unpaired");
}
{
  const fb = task("fb1", FB, "planA");
  if (matchEblastTask(fb, [fb]) !== null) fail("with no eblast there is no pair");
}
{
  // Only one eblast of that name anywhere, in another plan. Taken, because a
  // plan can be renamed or a task filed in the wrong one, and one candidate
  // is not a guess.
  const fb = task("fb1", FB, "planA");
  const all = [fb, task("eb-b", EB, "planB")];
  if (matchEblastTask(fb, all)?.id !== "eb-b") fail("a single twin elsewhere should still pair");
}
{
  // An FB Event task must never pair with another FB Event task.
  const fb = task("fb1", FB, "planA");
  const all = [fb, task("fb2", FB, "planA")];
  if (matchEblastTask(fb, all) !== null) fail("a Facebook task paired with a Facebook task");
}

// ── The link out to Facebook ──────────────────────────────────────────────
{
  const want = "https://facebook.com/CarettaMaplewood/events";
  for (const given of [
    "facebook.com/CarettaMaplewood",
    "https://facebook.com/CarettaMaplewood",
    "https://facebook.com/CarettaMaplewood/",
    "https://facebook.com/CarettaMaplewood/events",
    "https://facebook.com/CarettaMaplewood/events/",
  ]) {
    const got = facebookEventsUrl(given);
    if (got !== want) fail(`"${given}" should link to ${want}, got ${got}`);
  }
  for (const empty of [null, undefined, "", "   "]) {
    if (facebookEventsUrl(empty) !== null) fail("a community with no page must not get a link");
  }
}

// ── Which source the copy comes from ──────────────────────────────────────
{
  const source = readFileSync("lib/fb-event-source.ts", "utf-8");
  // The order matters. A drafted eblast has been through the voice doctrine
  // and usually a person; the flyer has been through neither. But a Facebook
  // event is due more than a week before its eblast, so the flyer has to be
  // enough on its own or every event is late.
  const draftAt = source.indexOf("kind: \"draft\"");
  const flyerAt = source.indexOf("kind: \"flyer\"");
  if (draftAt === -1 || flyerAt === -1) fail("lib/fb-event-source.ts no longer offers both sources");
  if (draftAt > flyerAt) fail("lib/fb-event-source.ts reaches for the flyer before the draft");
  // The call, not the import at the top, which would be satisfied by a file
  // that imports it and never uses it.
  if (!source.includes("await extractFlyerContent(")) {
    fail("lib/fb-event-source.ts can no longer build an event from the flyer alone");
  }
  if (!source.includes("await flyerFor(")) {
    fail("lib/fb-event-source.ts no longer fetches the flyer off the eblast's Planner task");
  }

  const cover = readFileSync("app/api/fb-events/[taskId]/cover/route.ts", "utf-8");
  if (!cover.includes("fromFlyer")) {
    fail("the cover route can no longer fall back to the flyer, so it waits on the eblast");
  }
  if (!cover.includes("120_000")) {
    fail("the cover route no longer skips small images, so a logo can become the cover");
  }
}

// ── What the sync does with them ──────────────────────────────────────────
{
  const sync = readFileSync("lib/fb-events.ts", "utf-8");
  if (!sync.includes("all.length > 0")) {
    fail("lib/fb-events.ts would clear the table from an empty list, which means a failed fetch");
  }
  if (!sync.includes("matchNote")) fail("lib/fb-events.ts no longer records why a pairing failed");

  const pass = readFileSync("lib/planner-drafts.ts", "utf-8");
  if (!pass.includes("syncFbEventTasks")) {
    fail("lib/planner-drafts.ts no longer records the Facebook event tasks");
  }
  // The eblasts are the half with a deadline; this must not be able to stop
  // them. Measured at the call site, not the import at the top of the file.
  const at = pass.indexOf("await syncFbEventTasks");
  const call = at === -1 ? "" : pass.slice(Math.max(0, at - 400), at + 200);
  if (!/try\s*{/.test(call)) {
    fail("a failure recording Facebook events would take the eblast run down with it");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "\nThe two kinds of task are told apart, the shared name survives whichever\n" +
  "dash was typed, a near miss is not a match, the twin in the same plan wins,\n" +
  "anything ambiguous is left unpaired, and a failure here cannot stop the eblasts.",
);
process.exit(0);
