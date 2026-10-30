/**
 * Checks that the panel can tell what is in the email and what is not.
 *
 * A draft that came out of an informational flyer has no date, no time and no
 * RSVP, and the email simply prints nothing for them. The panel used to show
 * those boxes looking exactly like every other box — the address worst of all,
 * because it pre-fills with the community's own address and so looked not just
 * present but filled in, while the email was printing nothing at all. That is
 * the same failure the shared-defaults rule exists to prevent, in the other
 * direction: the panel claiming something the email does not do.
 *
 * So the panel reads back what the email drew rather than working it out a
 * second time. This checks the names it reads by are the names the email
 * really writes, which is the one way that reading can quietly stop working:
 * a row whose name the email never emits would wear "Not shown" forever, and
 * a row named after something always present could never wear it at all.
 *
 *   npx tsx scripts/check-not-shown.ts
 */
import { buildEblastHtml } from "@/lib/render-email";
import { ROW_SOURCES, ROW_HIDE, RESTORABLE_FIELDS, drawnFieldsIn, rowOff } from "@/lib/eblast-inspector";

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

const community: any = {
  slug: "check-community",
  displayName: "Checkworth Senior Living",
  shortName: "Checkworth",
  brand: {
    primary: "#004D71", accent: "#CCAC77", background: "#FBF7EE",
    fontBody: "Nexa", fontHeadline: "Nexa",
  },
  address: { street: "1234 Oak St", city: "Green Bay", state: "WI", zip: "54301" },
  websiteUrl: "https://example.com",
  logos: [],
  trackingPhone: "9205551234",
  socials: {},
  hubspot: {},
  senders: [{ id: "s1", name: "Dana Reed", email: "dana@example.com", title: null, isPrimary: true }],
};

const px = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"/>`)}`;
const opts = { heroImageUrl: px(600), secondaryImageUrl: px(528), galleryImageUrls: [px(252), px(252)] };

/** A draft with words in every row, so nothing is missing for want of text. */
const full: any = {
  subject: "Check subject", previewText: "Preview text", eyebrow: "Eyebrow",
  heroImageAlt: "Hero photo", heroImageDescription: "A photo", audienceHints: [],
  rsvpLabel: "RSVP Required",
  headline: "An Afternoon of Music",
  scriptSubheadline: "with the Lakeside Trio",
  eventDate: "Thursday, June 12",
  eventTime: "2:00 PM",
  heroAddress: "1234 Oak St, Green Bay, WI 54301",
  storyEyebrow: "A Look Inside",
  storyScriptTitle: "Our Summer Series",
  bodyParagraphs: ["Come spend the afternoon with us."],
  galleryLabel: "Around Our Community",
  ctaRsvpLabel: "Seats Are Limited",
  ctaEventDate: "Thursday the twelfth",
  ctaEventTime: "Two o'clock",
  thankYouText: "Thank You!",
  footerSenderName: "Dana Reed",
  footerName: "The Checkworth Team",
  footerSenderEmail: "dana@example.com",
  footerButtonLabel: "Visit Our Website",
  ctaEyebrow: "Reserve Your Seat", ctaHeadline: "June 12", ctaSubline: "RSVP required",
  ctaButtonLabel: "Call 920-555-1234", ctaButtonHref: "tel:9205551234",
  finalCtaButtonLabel: "Call 920-555-1234",
};

const draw = (flyer: any) => drawnFieldsIn(buildEblastHtml(flyer, community, opts));

// ── 1. Every row's name is one the email really writes ─────────────────────
//
// With every row filled in, every row has to come back as drawn. A name the
// email never emits would leave that row marked "Not shown" on every draft
// there has ever been.
{
  const drawn = draw(full);
  for (const [row, spec] of Object.entries(ROW_SOURCES)) {
    if (!spec.drawn.some((name) => drawn.has(name))) {
      fail(`${row} is read back as "${spec.drawn.join(" or ")}", which this email never writes`);
    }
  }
}

// ── 2. Turning a row off is seen ───────────────────────────────────────────
//
// The other half: a name that is always present whatever the draft says would
// mean a row could never be marked at all.
{
  const BY_BLOCK: Array<[row: string, make: (f: any) => any]> = [
    ["rsvpLabel", (f) => ({ ...f, hiddenBlocks: ["rsvpLabel"] })],
    ["headline", (f) => ({ ...f, hiddenBlocks: ["headline"] })],
    ["scriptSubheadline", (f) => ({ ...f, hiddenBlocks: ["scriptSubheadline"] })],
    ["heroAddress", (f) => ({ ...f, hiddenBlocks: ["heroAddress"] })],
    ["storyEyebrow", (f) => ({ ...f, hiddenBlocks: ["storyEyebrow"] })],
    ["storyScriptTitle", (f) => ({ ...f, hiddenBlocks: ["storyScriptTitle"] })],
    ["bodyParagraphs", (f) => ({ ...f, hiddenBlocks: ["bodyParagraphs"] })],
    ["galleryLabel", (f) => ({ ...f, hiddenBlocks: ["galleryLabel"] })],
    ["ctaRsvpLabel", (f) => ({ ...f, hiddenBlocks: ["ctaRsvpLabel"] })],
    ["thankYouText", (f) => ({ ...f, hiddenBlocks: ["thankYouText"] })],
    ["footerSenderName", (f) => ({ ...f, hiddenBlocks: ["footerSenderName"] })],
    ["footerName", (f) => ({ ...f, hiddenBlocks: ["footerName"] })],
    ["footerSenderEmail", (f) => ({ ...f, hiddenBlocks: ["footerSenderEmail"] })],
    ["eventDate", (f) => ({ ...f, hiddenBlocks: ["eventDate"] })],
    ["eventTime", (f) => ({ ...f, hiddenBlocks: ["eventTime"] })],
    ["ctaEventDate", (f) => ({ ...f, hiddenBlocks: ["ctaEventDate"] })],
    ["ctaEventTime", (f) => ({ ...f, hiddenBlocks: ["ctaEventTime"] })],
    ["ctaButtonLabel", (f) => ({ ...f, ctaButtonHidden: true })],
    ["finalCtaButtonLabel", (f) => ({ ...f, finalCtaButtonHidden: true })],
    ["footerButtonLabel", (f) => ({ ...f, footerButtonHidden: true })],
  ];

  for (const [row, make] of BY_BLOCK) {
    const spec = ROW_SOURCES[row];
    if (!spec) { fail(`${row} has no entry in ROW_SOURCES`); continue; }
    const flyer = make(full);
    const drawn = draw(flyer);
    if (spec.drawn.some((name) => drawn.has(name))) {
      fail(`${row} was turned off and the email still prints it`);
    }
    if (!rowOff(flyer, row, drawn)) fail(`${row} was turned off and the panel would still call it on`);
  }

  // Every row that can be turned off is covered above.
  for (const row of Object.keys(ROW_SOURCES)) {
    if (!BY_BLOCK.some(([name]) => name === row)) fail(`${row} is never checked for being turned off`);
  }
}

// ── 3. An informational flyer reads as an informational flyer, and every
//      row it left out can be switched back on ─────────────────────────────
//
// The draft this whole thing is for: no event, so no date, no time, no RSVP
// and no subheading. The address is the one worth naming — it is still set,
// and it still does not print, because the band it sits inside is not there.
//
// All three of those are the same thing to whoever opens the draft: the row
// is off, and the switch has to turn it on. A row the draft never wrote has
// nothing to un-hide, which is exactly why being asked for is remembered
// separately — without that the switch would flip and nothing would change.
{
  const informational: any = {
    ...full,
    rsvpLabel: "",
    scriptSubheadline: "",
    eventDate: "",
    eventTime: "",
  };
  const drawn = draw(informational);
  const OUT = ["rsvpLabel", "scriptSubheadline", "eventDate", "eventTime", "heroAddress"];

  for (const row of OUT) {
    if (!rowOff(informational, row, drawn)) {
      fail(`an informational draft leaves ${row} out and the panel would not show it as off`);
    }
  }
  // And the rest of the email is untouched by any of that.
  for (const row of ["headline", "storyEyebrow", "bodyParagraphs", "thankYouText", "footerName"]) {
    if (rowOff(informational, row, drawn)) {
      fail(`an informational draft marked ${row} off, and it has nothing to do with the event`);
    }
  }

  // The switch, on each of them, with the box still empty.
  for (const row of OUT) {
    const names = [ROW_HIDE[row].block!];
    const asked = { ...informational, shownBlocks: names };
    if (rowOff(asked, row, drawn)) {
      fail(`${row} was switched on and stayed off, so the control does nothing`);
    }
    // And it goes back off again, which is the other half of a switch.
    const hiddenAgain = { ...asked, hiddenBlocks: names, shownBlocks: [] };
    if (!rowOff(hiddenAgain, row, drawn)) fail(`${row} could not be switched off again`);
  }
}

// ── 3b. Every row's switch works on a draft that never wrote it ────────────
//
// Not just the four above: the request was every text box in every section.
{
  const bare: any = { ...full, hiddenBlocks: [] };
  for (const key of Object.keys(ROW_SOURCES)) {
    const hide = ROW_HIDE[key];
    // The buttons are governed by their own flag, which has always worked in
    // both directions and does not depend on there being any words.
    if (hide.flag) {
      if (!rowOff({ ...bare, [hide.flag]: true }, key, draw({ ...bare, [hide.flag]: true }))) {
        fail(`${key} could not be switched off by its flag`);
      }
      continue;
    }
    const names = [hide.block!];
    // Empty it the way a draft that never wrote it would.
    const emptied: any = { ...bare };
    for (const n of names) emptied[n] = "";
    if (key === "bodyParagraphs") emptied.bodyParagraphs = [];
    if (key === "heroAddress") emptied.heroAddress = "";

    const drawn = draw(emptied);
    if (!rowOff(emptied, key, drawn)) fail(`${key} was left out of the draft and does not read as off`);
    if (rowOff({ ...emptied, shownBlocks: names }, key, drawn)) {
      fail(`${key} was switched on while still empty and stayed off`);
    }
  }
}

// ── 4. Clearing a restorable field stops it, and clearing the clear puts it
//      back ────────────────────────────────────────────────────────────────
//
// "Show this" on these rows sets the field back to undefined. That only means
// anything if undefined really does bring the default back.
{
  for (const field of RESTORABLE_FIELDS) {
    const row = Object.entries(ROW_SOURCES).find(([, s]) => s.storage === field)?.[0];
    if (!row) { fail(`${field} is restorable but belongs to no row`); continue; }

    const cleared = draw({ ...full, [field]: "" });
    if (ROW_SOURCES[row].drawn.some((n) => cleared.has(n))) {
      fail(`${field} was cleared and the email still prints it, so "Not shown" would be wrong`);
    }

    const restored = draw({ ...full, [field]: undefined });
    if (!ROW_SOURCES[row].drawn.some((n) => restored.has(n))) {
      fail(`${field} has no default to come back, so "Show this" would do nothing`);
    }
  }
}

// ── 5. Asking for the address on an eblast with no event prints it, and
//      nothing made before that switch existed changes ────────────────────
//
// The bordered band holds the date, the time and the address, and it has
// always needed a date or a time to appear at all. So on an informational
// eblast the address had nowhere to print and no way to be asked for, and
// switching it on in the panel would have done nothing anybody could see.
{
  const noEvent: any = { ...full, eventDate: "", eventTime: "" };
  if (drawnFieldsIn(buildEblastHtml(noEvent, community, opts)).has("heroAddress")) {
    fail("an eblast with no event prints the address without being asked");
  }

  const asked = { ...noEvent, shownBlocks: ["heroAddress"] };
  if (!drawnFieldsIn(buildEblastHtml(asked, community, opts)).has("heroAddress")) {
    fail("the address was switched on and the email still will not print it");
  }
  if (rowOff(asked, "heroAddress", draw(asked))) {
    fail("the address was switched on and the panel still reads it as off");
  }

  // Hiding outranks asking, or the switch would only work one way.
  const both = { ...asked, hiddenBlocks: ["heroAddress"] };
  if (drawnFieldsIn(buildEblastHtml(both, community, opts)).has("heroAddress")) {
    fail("the address was hidden and asked for at once, and hiding lost");
  }

  // A draft from before the switch existed carries no shownBlocks, so every
  // eblast already sent or waiting renders exactly as it did.
  for (const [what, flyer] of [["an event draft", full], ["an informational draft", noEvent]] as const) {
    if (buildEblastHtml(flyer, community, opts) !== buildEblastHtml({ ...flyer, shownBlocks: [] }, community, opts)) {
      fail(`${what} renders differently once shownBlocks exists but is empty`);
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `\nAll ${Object.keys(ROW_SOURCES).length} rows are read back by a name the email really writes.\n` +
  "Each one reads as off when the draft leaves it out, or when it is turned off,\n" +
  "and turns back on from the row menu even with the box still empty. " +
  `${RESTORABLE_FIELDS.size} of them\n` +
  "restore a community default when they had been cleared. An informational draft\n" +
  "marks its date, time, RSVP and address, and leaves the rest of the email alone.",
);
