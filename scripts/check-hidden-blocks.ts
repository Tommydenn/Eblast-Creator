/**
 * Checks what hiding a block does, and what it leaves alone.
 *
 * Every line in the email now asks whether it is hidden before it draws, which
 * touched almost every branch in the renderer. Two things are worth holding
 * still after a change that broad:
 *
 *   - hiding a block removes that block's words and no others, and
 *   - unhiding restores the email byte for byte.
 *
 * The second is the one that catches a careless fix: it is easy to make a line
 * vanish by clearing the field, and that would pass the first check while
 * quietly throwing away what somebody wrote.
 *
 * Hiding is deliberately not the same as clearing. A cleared field has no
 * words left; a hidden one keeps them and simply does not print them.
 *
 *   npx tsx scripts/check-hidden-blocks.ts
 */
import { buildEblastHtml } from "@/lib/render-email";

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

/** A draft with words in every block, so nothing is missing for want of text. */
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

const shown = buildEblastHtml(full, community, opts);

/**
 * Every block the sidebar offers a hide control for, and a distinctive piece
 * of the text it should take with it.
 */
const BLOCKS: Array<[block: string, words: string]> = [
  ["rsvpLabel", "RSVP Required"],
  ["headline", "An Afternoon of Music"],
  ["scriptSubheadline", "Lakeside Trio"],
  ["eventDate", "Thursday, June 12"],
  ["eventTime", "2:00 PM - 3:30 PM"],
  ["heroAddress", "1234 Oak St"],
  ["storyEyebrow", "A Look Inside"],
  ["storyScriptTitle", "Our Summer Series"],
  ["bodyParagraphs", "Come spend the afternoon"],
  ["galleryLabel", "Around Our Community"],
  ["ctaRsvpLabel", "Seats Are Limited"],
  ["thankYouText", "Thank You!"],
  ["footerSenderName", "Dana Reed"],
  ["footerName", "The Checkworth Team"],
  ["footerSenderEmail", "dana@example.com"],
];

// ── Every block is actually present to begin with ──────────────────────────
for (const [block, words] of BLOCKS) {
  if (!shown.includes(words)) {
    fail(`${block} never rendered at all, so hiding it proves nothing — check the sample draft`);
  }
}

// ── Hiding one takes its words and leaves the rest ─────────────────────────
for (const [block, words] of BLOCKS) {
  const html = buildEblastHtml({ ...full, hiddenBlocks: [block] }, community, opts);
  if (html.includes(words)) {
    fail(`hiding ${block} left its text in the email`);
  }
  for (const [other, otherWords] of BLOCKS) {
    if (other === block) continue;
    // The date and the time share one line, and the two footer names share a
    // word — compare only text that is unique to the other block.
    if (!shown.includes(otherWords)) continue;
    if (words !== otherWords && !words.includes(otherWords) && !otherWords.includes(words)) {
      if (!html.includes(otherWords)) {
        fail(`hiding ${block} also removed ${other}`);
      }
    }
  }
}

// ── Unhiding restores the email exactly ────────────────────────────────────
for (const [block] of BLOCKS) {
  const back = buildEblastHtml({ ...full, hiddenBlocks: [] }, community, opts);
  if (back !== shown) {
    fail(`an empty hidden list does not render the same as no hidden list at all (${block})`);
    break;
  }
}
{
  const hiddenThenShown = buildEblastHtml(
    { ...full, hiddenBlocks: ["headline", "thankYouText"] },
    community,
    opts,
  );
  const restored = buildEblastHtml({ ...full, hiddenBlocks: undefined }, community, opts);
  if (hiddenThenShown === restored) fail("hiding two blocks changed nothing");
  if (restored !== shown) fail("unhiding did not restore the email exactly");
}

// ── The sections can go too, including the header and the footer ───────────
const SECTIONS: Array<[flag: string, words: string]> = [
  ["headerSectionHidden", 'data-section="Header"'],
  ["heroSectionHidden", "An Afternoon of Music"],
  ["storySectionHidden", "A Look Inside"],
  ["secondaryImageSectionHidden", 'data-section="Secondary Image"'],
  ["gallerySectionHidden", "Around Our Community"],
  ["finalCtaSectionHidden", "Seats Are Limited"],
  ["footerSectionHidden", "Thank You!"],
];
for (const [flag, words] of SECTIONS) {
  const html = buildEblastHtml({ ...full, [flag]: true }, community, opts);
  if (html.includes(words)) fail(`${flag} did not hide the section`);
}

// ── Everything hidden says so in the editor, and nowhere else ──────────────
{
  const allHidden: any = { ...full };
  for (const [flag] of SECTIONS) allHidden[flag] = true;

  const preview = buildEblastHtml(allHidden, community, { ...opts, forPreview: true });
  if (!preview.includes("Every section is hidden")) {
    fail("an email with every section hidden says nothing in the preview");
  }

  const send = buildEblastHtml(allHidden, community, opts);
  if (send.includes("Every section is hidden")) {
    fail("the preview's empty-state note reached a real send");
  }
}

// ── An added line sits in the gap it was added to ──────────────────────────
{
  const withLine = buildEblastHtml(
    {
      ...full,
      customLines: [{ id: "x1", text: "Doors open at 1:30.", after: "headline" }],
    },
    community,
    opts,
  );
  if (!withLine.includes("Doors open at 1:30.")) fail("an added line did not render");
  const headlineAt = withLine.indexOf("An Afternoon of Music");
  const lineAt = withLine.indexOf("Doors open at 1:30.");
  const scriptAt = withLine.indexOf("Lakeside Trio");
  if (!(headlineAt < lineAt && lineAt < scriptAt)) {
    fail("a line added after the headline did not land between it and the subheadline");
  }

  // Lines written before the other sections had gaps still render.
  const legacy = buildEblastHtml(
    {
      ...full,
      footerCustomLines: [{ id: "x2", text: "See you soon.", after: "thankYou" }],
    },
    community,
    opts,
  );
  if (!legacy.includes("See you soon.")) {
    fail("a line from the old footer-only list stopped rendering");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `\nAll ${BLOCKS.length} blocks and ${SECTIONS.length} sections hide only themselves, and unhiding\n` +
  "restores the email byte for byte. Added lines land in the gap they were added to,\n" +
  "and lines written before the other sections had gaps still render.",
);
