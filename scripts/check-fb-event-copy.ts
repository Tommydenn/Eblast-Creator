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
  buildDescriptions,
  formatEventDate,
  formatEventTime,
  ordinal,
  phoneFrom,
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

  // Further runs its own RSVP form, so the close must not be there.
  if (further.includes("651-360-1691")) fail("Further's copy still tells people to phone");
  if (further.includes("RSVP required")) fail("Further's copy still carries the RSVP close");
  if (!further.includes("📍 1910 County Road C East, Maplewood, MN")) {
    fail("Further's copy lost the detail block, which is more than the tail");
  }
  if (!facebook.startsWith(further)) {
    fail("Further's copy should be the Facebook one with the close removed, nothing else changed");
  }
}
{
  // No number on file: no line telling anyone to call one.
  const { facebook } = buildDescriptions({
    paragraphs: ["Only this."],
    date: "Thursday, November 19",
    time: "2:00 PM",
    location: "Somewhere",
    phone: null,
    rsvpRequired: true,
  });
  if (/call today/i.test(facebook)) fail("told people to call with no number to call");
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
