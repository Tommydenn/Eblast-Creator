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
//
// All three shapes below are in use across the thirty communities, taken from
// their own websites, so all three have to land on the events tab.
{
  const want = "https://www.facebook.com/CarettaHolmen/events";
  for (const given of [
    "www.facebook.com/CarettaHolmen",
    "https://www.facebook.com/CarettaHolmen",
    "https://www.facebook.com/CarettaHolmen/",
    "https://www.facebook.com/CarettaHolmen/events",
    "https://www.facebook.com/CarettaHolmen/events/",
  ]) {
    const got = facebookEventsUrl(given);
    if (got !== want) fail(`"${given}" should link to ${want}, got ${got}`);
  }

  // A name with the page id stuck on the end — Hayden Grove St Anthony's.
  if (
    facebookEventsUrl("https://www.facebook.com/Hayden-Grove-Senior-Living-St-Anthony-107216215068628") !==
    "https://www.facebook.com/Hayden-Grove-Senior-Living-St-Anthony-107216215068628/events"
  ) {
    fail("a page named with its id on the end should still reach its events");
  }

  // Bare numeric, which Amira Lake Elmo and Amira Choice Arvada both use.
  if (facebookEventsUrl("https://www.facebook.com/61556110831964") !== "https://www.facebook.com/61556110831964/events") {
    fail("a page with only an id for a name should still reach its events");
  }

  // profile.php has no name at all, and a path after it is a 404 — this is
  // the one that has to ask for the tab rather than walk to it.
  {
    const got = facebookEventsUrl("https://www.facebook.com/profile.php?id=61554186580603");
    if (got !== "https://www.facebook.com/profile.php?id=61554186580603&sk=events") {
      fail(`profile.php should ask for sk=events, got ${got}`);
    }
    if (got?.includes("profile.php/events")) fail("walked a path onto profile.php, which is a 404");
  }

  // What a share link leaves behind.
  if (
    facebookEventsUrl("https://www.facebook.com/preserveofroseville?mibextid=LQQJ4d") !==
    "https://www.facebook.com/preserveofroseville/events"
  ) {
    fail("a share link's tracking parameter should be dropped");
  }

  for (const empty of [null, undefined, "", "   ", "https://www.facebook.com/", "not a url"]) {
    if (facebookEventsUrl(empty) !== null) {
      fail(`${JSON.stringify(empty)} is not a page and must not produce a link`);
    }
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

  const photos = readFileSync("lib/fb-event-photos.ts", "utf-8");
  if (!photos.includes("flyerFor")) {
    fail("lib/fb-event-photos.ts can no longer reach the flyer, so photos wait on the eblast");
  }
  if (!photos.includes("MIN_AREA")) {
    fail("lib/fb-event-photos.ts no longer skips small images, so logos are offered as photos");
  }
  // Both platforms crop on upload and show what they are doing. Cropping
  // first only takes the choice away, and a 1.91:1 cover is unusable
  // anywhere that wants another shape.
  const one = readFileSync("app/api/fb-events/[taskId]/photos/[index]/route.ts", "utf-8");
  if (/\.resize\(/.test(one)) {
    fail("the photo route resizes or crops, and it should hand over the original");
  }
}

// ── What the sync does with them ──────────────────────────────────────────
{
  const sync = readFileSync("lib/fb-events.ts", "utf-8");
  if (!sync.includes("all.length > 0")) {
    fail("lib/fb-events.ts would clear the table from an empty list, which means a failed fetch");
  }
  if (!sync.includes("matchNote")) fail("lib/fb-events.ts no longer records why a pairing failed");
  // Completed is what retires one of these; without it the list kept events
  // finished months ago. In progress must NOT retire one, because that is
  // the mark this app puts on a task itself once the copy exists — filtering
  // it out would delete every event the moment it became ready.
  if (!sync.includes("percentComplete !== COMPLETED")) {
    fail("lib/fb-events.ts no longer retires completed tasks, or retires its own in-progress ones");
  }
  if (!sync.includes("markTaskInProgress")) {
    fail("lib/fb-events.ts no longer marks a written event In progress in Planner");
  }
  if (!sync.includes("cachePhotos")) {
    fail("lib/fb-events.ts no longer reads the photos up front, so the page waits for a PDF");
  }
  // And nothing here is kept for ever: these rows hold a copy of an event's
  // words and a note of when it was posted, about a day that has passed.
  if (!sync.includes("RETAIN_DAYS")) {
    fail("lib/fb-events.ts keeps past events indefinitely");
  }
  if (!sync.includes("pendingFlyers")) {
    fail("lib/fb-events.ts no longer clears the flyers it cached, so the cache grows for ever");
  }
  // The events are written ahead of their deadline on the same window the
  // eblasts are drafted on, so one setting governs how far ahead the app
  // works and the two cannot drift apart.
  if (!sync.includes("getLookaheadDays") || !sync.includes("isDueWithinWindow")) {
    fail("lib/fb-events.ts no longer writes ahead on the eblasts' own lookahead window");
  }
  // A missing flyer is the ordinary case and must not count as a failure, or
  // a run that is simply early looks broken.
  if (!sync.includes("e instanceof NoSourceError")) {
    fail("lib/fb-events.ts treats having nothing to build from yet as a failure");
  }

  const cron = readFileSync("app/api/cron/write-fb-events/route.ts", "utf-8");
  if (!cron.includes("syncFbEventTasks") || !cron.includes("writePendingFbEvents")) {
    fail("the write-ahead cron no longer reads Planner before writing");
  }
  const crons = readFileSync("vercel.json", "utf-8");
  if ((crons.match(/write-fb-events/g) ?? []).length !== 2) {
    fail("vercel.json should fire write-fb-events twice, since only one hour is 9am Central");
  }

  const panel = readFileSync("components/EventsPanel.tsx", "utf-8");
  // Marking one posted has to take it off the list of things to do without
  // losing it. It moves to the Done shelf and the view follows it there, so
  // the thing just acted on is still the thing in front of you — the first
  // version simply dropped it, which read as the button doing nothing.
  if (!panel.includes(`setShelf(posted ? "done" : "todo")`)) {
    fail("components/EventsPanel.tsx does not follow an event onto the shelf it just moved to");
  }
  if (!panel.includes(`shelf === "done" ? r.postedToFacebookAt : !r.postedToFacebookAt`)) {
    fail("components/EventsPanel.tsx no longer keeps the posted ones on a shelf of their own");
  }
  if (!panel.includes("onPosted(false)")) {
    fail("components/EventsPanel.tsx offers no way back from a mis-clicked tick");
  }

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
