/**
 * Checks that rearranging moves things, moves only them, and keeps them home.
 *
 * Three things have to hold, and the third is the one that would otherwise
 * rot quietly:
 *
 *   - a stored order changes the order the email draws in
 *   - a block never leaves its section, however the order is written
 *   - every gap the sidebar offers is a gap the email actually draws
 *
 * That last one had already broken once. The hero tab offered a place to add
 * a line after the call button and the email never drew one, so a line added
 * there was saved and never seen again. The sidebar and the renderer now read
 * the same list, and this checks they still do.
 *
 *   npx tsx scripts/check-block-order.ts
 */
import fs from "node:fs";
import { buildEblastHtml } from "@/lib/render-email";
import { SECTIONS, SECTION_NAMES, allSlots, applyOrder, orderedBlocks } from "@/lib/eblast-blocks";

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

const full: any = {
  subject: "Check subject", previewText: "Preview text", eyebrow: "Eyebrow",
  heroImageAlt: "Hero photo", heroImageDescription: "A photo", audienceHints: [],
  rsvpLabel: "RSVP Required",
  headline: "An Afternoon of Music",
  scriptSubheadline: "with the Lakeside Trio",
  eventDate: "Thursday, June 12",
  eventTime: "2:00 PM - 3:30 PM",
  heroAddress: "1234 Oak St, Green Bay, WI 54301",
  storyEyebrow: "A Look Inside",
  storyScriptTitle: "Our Summer Series",
  bodyParagraphs: ["Come spend the afternoon with us."],
  galleryLabel: "Around Our Community",
  ctaRsvpLabel: "Seats Are Limited",
  ctaEventDate: "Thursday the twelfth",
  ctaEventTime: "Two until half past three",
  thankYouText: "Thank You!",
  footerSenderName: "Dana Reed",
  footerName: "The Checkworth Team",
  footerSenderEmail: "dana@example.com",
  footerButtonLabel: "Visit Our Website",
  ctaEyebrow: "Reserve Your Seat", ctaHeadline: "June 12", ctaSubline: "RSVP required",
  ctaButtonLabel: "Call 920-555-1234", ctaButtonHref: "tel:9205551234",
  finalCtaButtonLabel: "Call 920-555-1234",
};

const px = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"/>`)}`;
const opts = { heroImageUrl: px(600), secondaryImageUrl: px(528), galleryImageUrls: [px(252), px(252)] };

/** Where a block's own text lands in the rendered email. */
const MARKER: Record<string, string> = {
  rsvpLabel: "RSVP Required",
  headline: "An Afternoon of Music",
  scriptSubheadline: "Lakeside Trio",
  eventDateTime: "Thursday, June 12",
  ctaButtonLabel: 'data-deletefield="ctaButtonHidden"',
  storyEyebrow: "A Look Inside",
  storyScriptTitle: "Our Summer Series",
  ctaRsvpLabel: "Seats Are Limited",
  ctaEventDateTime: "Thursday the twelfth",
  finalCtaButtonLabel: 'data-deletefield="finalCtaButtonHidden"',
  footerButtonLabel: "Visit Our Website",
  thankYouText: "Thank You!",
  footerSenderName: "Dana Reed",
  footerName: "The Checkworth Team",
  footerSenderEmail: "dana@example.com",
};

// ── Reversing a section puts its blocks in the opposite order ──────────────
for (const section of SECTIONS) {
  if (section.blocks.length < 2) continue;
  const names = section.blocks.map((b) => b.name);
  const reversed = [...names].reverse();

  const html = buildEblastHtml({ ...full, blockOrder: { [section.name]: reversed } }, community, opts);
  const at = reversed.map((n) => ({ name: n, at: html.indexOf(MARKER[n]) }));

  for (const piece of at) {
    if (piece.at === -1) {
      fail(`${section.name}: ${piece.name} vanished when the section was reversed`);
    }
  }
  for (let i = 1; i < at.length; i++) {
    if (at[i - 1].at !== -1 && at[i].at !== -1 && at[i - 1].at > at[i].at) {
      fail(`${section.name}: ${at[i - 1].name} should now come before ${at[i].name}`);
    }
  }
}

// ── A block cannot be moved into another section ───────────────────────────
{
  // Ask for the headline — a hero block — in the footer's order, and for the
  // footer's sign-off in the hero's.
  const html = buildEblastHtml(
    {
      ...full,
      blockOrder: {
        Footer: ["headline", "thankYouText", "footerName"],
        Hero: ["thankYouText", "headline", "rsvpLabel"],
      },
    },
    community,
    opts,
  );
  const heroAt = html.indexOf("An Afternoon of Music");
  const thanksAt = html.indexOf("Thank You!");
  if (heroAt === -1) fail("the headline disappeared when another section asked for it");
  if (thanksAt === -1) fail("the sign-off disappeared when another section asked for it");
  if (heroAt !== -1 && thanksAt !== -1 && heroAt > thanksAt) {
    fail("the headline was drawn in the footer — a block left its section");
  }
  if ((html.match(/An Afternoon of Music/g) ?? []).length !== 1) {
    fail("the headline was drawn twice");
  }
}

// ── A stale order neither loses nor duplicates anything ────────────────────
{
  const canonical = ["a", "b", "c", "d"];
  const cases: Array<[string, string[] | undefined, string[]]> = [
    ["nothing stored", undefined, canonical],
    ["already canonical", ["a", "b", "c", "d"], ["a", "b", "c", "d"]],
    ["reversed", ["d", "c", "b", "a"], ["d", "c", "b", "a"]],
    // Each name the stored order never mentioned goes back after the one
    // it follows in the template, so a block added to the template later
    // lands beside its neighbours rather than on the end.
    ["a name that no longer exists", ["d", "zz", "a"], ["d", "a", "b", "c"]],
    ["a name it never heard of", ["c", "a"], ["c", "d", "a", "b"]],
    ["the same name twice", ["b", "b", "a"], ["b", "c", "d", "a"]],
  ];
  for (const [what, stored, want] of cases) {
    const got = applyOrder(canonical, stored);
    if (got.join(",") !== want.join(",")) {
      fail(`a stored order with ${what} gave ${got.join(",")}, expected ${want.join(",")}`);
    }
    if (new Set(got).size !== canonical.length) {
      fail(`a stored order with ${what} lost or duplicated a block: ${got.join(",")}`);
    }
  }
}

// ── Reordering the sections reorders the email ─────────────────────────────
{
  const reversed = [...SECTION_NAMES].reverse();
  const html = buildEblastHtml({ ...full, sectionOrder: reversed }, community, opts);
  const footerAt = html.indexOf('data-section="Footer"');
  const heroAt = html.indexOf('data-section="Hero"');
  const headerAt = html.indexOf('data-section="Header"');
  if (footerAt === -1 || heroAt === -1 || headerAt === -1) {
    fail("a section disappeared when the sections were reversed");
  } else if (!(footerAt < heroAt && heroAt < headerAt)) {
    fail("reversing the sections did not reverse the email");
  }

  // The secondary image is a section of its own now, so it can lead.
  const first = buildEblastHtml(
    { ...full, sectionOrder: ["Secondary Image", ...SECTION_NAMES.filter((n) => n !== "Secondary Image")] },
    community,
    opts,
  );
  const secondAt = first.indexOf('data-section="Secondary Image"');
  const hdrAt = first.indexOf('data-section="Header"');
  if (secondAt === -1) fail("the secondary image disappeared when moved to the top");
  else if (secondAt > hdrAt) fail("the secondary image would not move above the header");
}

// ── Every gap the sidebar offers is one the email draws ────────────────────
{
  const known = new Set(allSlots());

  const renderer = fs.readFileSync("lib/render-email.ts", "utf8");
  const drawn = new Set(
    [...renderer.matchAll(/linesAfter\(\s*"([^"]+)"/g)].map((m) => m[1]),
  );
  // The hero, story, cta and footer draw their blocks' gaps through the block
  // list rather than by name, so those are drawn by definition.
  for (const section of SECTIONS) {
    for (const block of section.blocks) drawn.add(block.slot);
  }

  const offered = new Set<string>();
  for (const file of fs.readdirSync("components/drafter/sections")) {
    const src = fs.readFileSync(`components/drafter/sections/${file}`, "utf8");
    for (const m of src.matchAll(/BlockGap slot="([^"]+)"/g)) offered.add(m[1]);
  }

  for (const slot of offered) {
    if (!known.has(slot)) fail(`the sidebar offers a gap "${slot}" that is not in the block list`);
    if (!drawn.has(slot)) fail(`the sidebar offers a gap "${slot}" the email never draws`);
  }
  for (const slot of known) {
    if (!offered.has(slot)) fail(`the block list has a gap "${slot}" the sidebar never offers`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const movable = SECTIONS.filter((s) => s.blocks.length > 1);
console.log(
  `\n${movable.length} sections rearrange their blocks (${movable.map((s) => s.blocks.length).reduce((a, b) => a + b, 0)} in all),\n` +
  "no block can be drawn outside the section it belongs to, and a stale order\n" +
  `neither loses nor duplicates one. All ${allSlots().length} gaps the sidebar offers are gaps the email draws.`,
);
