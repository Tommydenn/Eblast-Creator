/**
 * Checks the half of a Facebook event's description that is built, not written.
 *
 * The date, the time, the address and the number to call are facts with one
 * correct form. They are assembled here rather than asked of the model for the
 * same reason the eblast renders its own date band: a model writing them will
 * eventually write a different number, and a wrong phone number on a public
 * event does not look wrong.
 *
 *   npx tsx scripts/check-fb-event-copy.ts
 */
import { readFileSync } from "node:fs";
import {
  NO_FB_PHONE,
  buildDescriptions,
  formatEventDate,
  formatEventTime,
  ordinal,
  phoneFrom,
  phoneInDescription,
} from "@/lib/fb-event-copy";

const failures: string[] = [];
const fail = (m: string) => failures.push(m);
const eq = (what: string, got: unknown, want: unknown) => {
  if (got !== want) fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

// ── Day endings ───────────────────────────────────────────────────────────
for (const [n, want] of [
  [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"],
  [11, "11th"], [12, "12th"], [13, "13th"],
  [21, "21st"], [22, "22nd"], [23, "23rd"], [30, "30th"], [31, "31st"],
] as Array<[number, string]>) {
  eq(`ordinal(${n})`, ordinal(n), want);
}

// ── Dates ─────────────────────────────────────────────────────────────────
eq("a plain date", formatEventDate("Thursday, November 19"), "Thursday, November 19th");
eq("the first", formatEventDate("Saturday, October 1"), "Saturday, October 1st");
eq("a teen", formatEventDate("Wednesday, November 11"), "Wednesday, November 11th");
eq("blank", formatEventDate(""), "");
// Left alone, deliberately: nothing here can say which number is the day.
for (const text of [
  "October 21/22",
  "November 19 - 21",
  "Saturday, May 2 at 2:00",
  "Friday, February 12th",
  "Thursday, November 13th",
  "Thanksgiving week",
]) {
  eq(`"${text}" untouched`, formatEventDate(text), text);
}

// ── Times ─────────────────────────────────────────────────────────────────
eq("the eblast separator", formatEventTime("· 2:00 PM"), "2:00 PM");
eq("an en dash separator", formatEventTime("– 2:00 PM"), "2:00 PM");
eq("a range is kept whole", formatEventTime("2:00 PM - 4:00 PM"), "2:00 PM - 4:00 PM");
eq("blank", formatEventTime(""), "");

// ── Phone numbers ─────────────────────────────────────────────────────────
eq("from the href", phoneFrom("tel:7633258107"), "763-325-8107");
eq("with a country code", phoneFrom("tel:+16513601691"), "651-360-1691");
eq("from the label when the href has none", phoneFrom(null, "Call 651.360.1691 to RSVP"), "651-360-1691");
eq("nothing to go on", phoneFrom(null, null), null);
eq("too few digits", phoneFrom("tel:12345"), null);
// Nearly every real draft has both, and reading them together gave twenty
// digits and therefore no number at all — which is how this was found.
eq(
  "both on the draft, as they always are",
  phoneFrom("tel:7633438336", "Call 763.343.8336 to RSVP"),
  "763-343-8336",
);
eq(
  "a label the editor has coloured",
  phoneFrom(null, '<span style="color: rgb(69, 103, 101)">Call 952.295.3158 to RSVP</span>'),
  "952-295-3158",
);
eq(
  "both, with the label coloured",
  phoneFrom("tel:6122609862", '<span style="color: rgb(69, 103, 101)">Call 612.260.9862 for Details</span>'),
  "612-260-9862",
);

// ── The whole description ─────────────────────────────────────────────────
{
  const { facebook, further } = buildDescriptions({
    paragraphs: ["First paragraph.", "Second paragraph."],
    date: "Wednesday, November 11",
    time: "· 2:00 PM",
    location: "1910 County Road C East, Maplewood, MN",
    phone: "651-360-1691",
    rsvpRequired: true,
  });

  const want = [
    "First paragraph.",
    "",
    "Second paragraph.",
    "",
    "📅 Wednesday, November 11th",
    "🕐 2:00 PM",
    "📍 1910 County Road C East, Maplewood, MN",
    "",
    "RSVP required, call today!",
    "📞 651-360-1691",
  ].join("\n");
  if (facebook !== want) {
    fail(`the Facebook description is not the house format:\n--- got ---\n${facebook}\n--- want ---\n${want}`);
  }

  // Further has its own fields for all of this and prints them beside the
  // description, so its copy is the prose alone.
  if (further !== "First paragraph.\n\nSecond paragraph.") {
    fail(`Further's copy should be the paragraphs alone, got ${JSON.stringify(further)}`);
  }
  for (const repeated of ["📅", "🕐", "📍", "📞", "RSVP required"]) {
    if (further.includes(repeated)) fail(`Further's copy repeats ${repeated}, which Further already shows`);
  }
  if (!facebook.startsWith(further)) {
    fail("the two should open with the same prose");
  }
}
{
  // An RSVP is wanted and the community has no Facebook number on file. The
  // close stays and says what is missing: dropping it quietly would hide the
  // gap behind copy that looks finished, and borrowing the eblast's number
  // would book the call against the wrong campaign while looking right.
  const { facebook } = buildDescriptions({
    paragraphs: ["Only this."],
    date: "Thursday, November 19",
    time: "2:00 PM",
    location: "Somewhere",
    phone: null,
    rsvpRequired: true,
  });
  if (!facebook.includes(NO_FB_PHONE)) {
    fail("an RSVP event with no number does not say the number is missing");
  }
  const close = facebook.split("\n").find((l) => l.startsWith("📞")) ?? "";
  if (!close) fail("dropped the close instead of saying the number is missing");
  if (/\d/.test(close)) fail(`printed a number where the community has none: ${close}`);
  if (facebook.endsWith("\n") || facebook.includes("\n\n\n")) fail("left a gap where the close would be");
}
{
  // No RSVP wanted: no close at all, even with a number on file. The close
  // exists to collect an RSVP, and a number under "call today" turns a
  // walk-in event into one you apparently have to ring first.
  const { facebook } = buildDescriptions({
    paragraphs: ["Only this."],
    date: "Thursday, November 19",
    time: "2:00 PM",
    location: "Somewhere",
    phone: "651-360-1691",
    rsvpRequired: false,
  });
  if (/rsvp/i.test(facebook)) fail("asked for an RSVP on an event that does not want one");
  if (/call/i.test(facebook)) fail("told people to call an event that does not want an RSVP");
  if (facebook.includes("651-360-1691") || facebook.includes("📞")) {
    fail("printed a number to call on an event that does not want an RSVP");
  }
  if (facebook.endsWith("\n") || facebook.includes("\n\n\n")) fail("left a gap where the close would be");
}
{
  // A missing detail drops its own line rather than printing an empty icon.
  const { facebook } = buildDescriptions({
    paragraphs: ["Only this."],
    date: "",
    time: "",
    location: "Somewhere",
    phone: null,
    rsvpRequired: false,
  });
  if (facebook.includes("📅") || facebook.includes("🕐")) fail("printed an icon with nothing after it");
}

// ── Reading the number back off finished copy ─────────────────────────────
{
  const full = buildDescriptions({
    paragraphs: ["Only this."],
    date: "Thursday, November 19",
    time: "2:00 PM",
    location: "Somewhere",
    phone: "651-360-1691",
    rsvpRequired: true,
  }).facebook;
  const read = phoneInDescription(full);
  eq("a finished description has a close", read.line, true);
  eq("and the number it prints", read.phone, "651-360-1691");

  // The marker is a line, not a number. Both halves matter: the line is what
  // says this event asks for a call, and the missing number is what has to
  // be compared against the community page.
  const missing = buildDescriptions({
    paragraphs: ["Only this."],
    date: "Thursday, November 19",
    time: "2:00 PM",
    location: "Somewhere",
    phone: null,
    rsvpRequired: true,
  }).facebook;
  eq("the marker still counts as a close", phoneInDescription(missing).line, true);
  eq("with no number in it", phoneInDescription(missing).phone, null);

  // An event that wants no RSVP has nothing to disagree with.
  const walkIn = buildDescriptions({
    paragraphs: ["Only this."],
    date: "Thursday, November 19",
    time: "2:00 PM",
    location: "Somewhere",
    phone: "651-360-1691",
    rsvpRequired: false,
  }).facebook;
  eq("a walk-in has no close", phoneInDescription(walkIn).line, false);

  // The date line has digits in it and must not be mistaken for the number.
  eq("nothing at all", phoneInDescription(null).phone, null);
}

// ── Written vs built ──────────────────────────────────────────────────────
{
  const drafter = readFileSync("lib/fb-event-draft.ts", "utf-8");
  // The model writes the paragraphs. Everything below them is assembled, so
  // the drafter must not be able to emit a date, a time or a phone number.
  for (const forbidden of ["eventDate", "eventTime", "phone", "address"]) {
    if (new RegExp(`name:\\s*"${forbidden}"`, "i").test(drafter)) {
      fail(`lib/fb-event-draft.ts lets the model write ${forbidden}, which is assembled`);
    }
  }
  if (!drafter.includes("buildDescriptions")) {
    fail("lib/fb-event-draft.ts no longer assembles the description from the facts");
  }
}

// ── Whose number ──────────────────────────────────────────────────────────
{
  const source = readFileSync("lib/fb-event-source.ts", "utf-8");
  if (!source.includes("phone: phoneFrom(community.facebookPhone)")) {
    fail("lib/fb-event-source.ts no longer takes the number from the community's Facebook field");
  }
  // Facebook and the eblasts carry different numbers on purpose, so a call
  // can be told apart by where it came from. Any fallback destroys that and
  // leaves copy that looks perfectly correct, which is why this is checked
  // as the absence of the other numbers rather than the presence of one.
  for (const borrowed of ["trackingPhone", "ctaButton"]) {
    if (source.includes(borrowed)) {
      fail(`lib/fb-event-source.ts borrows ${borrowed} when the Facebook number is missing`);
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "\nDay endings are right, an ambiguous date is left as the eblast wrote it, the\n" +
  "time loses only its separator, the phone number comes from the href, the\n" +
  "description is the house format, and Further's is the same thing with the\n" +
  "call-to-RSVP close removed and nothing else changed.",
);
process.exit(0);
