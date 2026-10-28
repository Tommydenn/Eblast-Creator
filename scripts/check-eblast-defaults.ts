/**
 * Guards the one rule the editor depends on: the sidebar and the preview must
 * agree.
 *
 * Every box in the sidebar pre-fills with what the email would render for an
 * untouched field, and the toolbar shows the size that field renders at. Both
 * claims only hold while the two sides read the same values. They stopped
 * holding once — the address line dropped the community name in the email and
 * kept it in the sidebar — because each side had its own copy of the default.
 *
 * lib/eblast-defaults.ts is now the only copy. This checks that it stayed that
 * way: that the email really renders what that module says, and that no
 * sidebar field has quietly grown a second copy of a default.
 *
 *   npx tsx scripts/check-eblast-defaults.ts
 */
import fs from "node:fs";
import { buildEblastHtml } from "@/lib/render-email";
import {
  FIELD_FONT_SIZES,
  SECTION_COLOR_FIELDS,
  COLORABLE_TEXT_FIELDS,
  singleTextColor,
  withoutTextColor,
  withTextColor,
  communityAddressLine,
  defaultGalleryLabel,
  defaultFooterName,
  DEFAULT_THANK_YOU_TEXT,
  DEFAULT_WEBSITE_BUTTON_LABEL,
} from "@/lib/eblast-defaults";
import { SECTION_PANELS, UNREACHABLE_COLORS } from "@/lib/eblast-inspector";
import { SECTION_NAMES } from "@/lib/eblast-blocks";

const failures: string[] = [];
const notes: string[] = [];
const fail = (msg: string) => failures.push(msg);

const community: any = {
  slug: "check-community",
  displayName: "Checkworth Senior Living",
  shortName: "Checkworth",
  // Shaped like a real stored brand — the renderer reads every one of these.
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

/** The fields an ExtractedFlyer always carries, whether or not they render. */
const required: any = {
  subject: "Check subject", previewText: "Preview text", eyebrow: "Eyebrow",
  headline: "Headline", storyEyebrow: "Eyebrow", bodyParagraphs: ["Body copy."],
  ctaEyebrow: "Reserve Your Seat", ctaHeadline: "March 3 · 2pm",
  ctaSubline: "RSVP required", ctaButtonLabel: "Call 920-555-1234",
  ctaButtonHref: "tel:9205551234", heroImageAlt: "Hero photo",
  // The hero address rides with the date line, so the date has to be present
  // for the address to render at all.
  eventDate: "Wednesday, March 3",
  heroImageDescription: "A photo of the community", audienceHints: [],
};

/** Text for every field, so nothing is hidden by an empty-value guard. */
const populated: any = {
  ...required,
  rsvpLabel: "RSVP", headline: "Headline", scriptSubheadline: "Subheadline",
  eventDate: "March 3", eventTime: "· 2pm", heroAddress: "1 Test St",
  storyEyebrow: "Eyebrow", storyScriptTitle: "Title", bodyParagraphs: ["Body copy."],
  galleryLabel: "Gallery", ctaRsvpLabel: "RSVP", ctaEventDate: "March 3",
  ctaEventTime: "· 2pm", thankYouText: "Thanks", footerSenderName: "Dana Reed",
  footerName: "Checkworth", footerSenderEmail: "dana@example.com",
  footerButtonLabel: "Website", ctaButtonLabel: "Call 920-555-1234",
  finalCtaButtonLabel: "Call 920-555-1234",
};

const px = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"/>`)}`;
const opts = { heroImageUrl: px(600), secondaryImageUrl: px(528), galleryImageUrls: [px(252), px(252), px(252)] };

// ── 1. Rendered sizes match the table the toolbar reads ────────────────────
const html = buildEblastHtml(populated, community, opts);

/** The size a field actually renders at: its own tag's, else its container's. */
function renderedSize(field: string): number | null {
  const at = html.indexOf(`data-field="${field}"`);
  if (at === -1) return null;
  let cursor = at;
  for (let hop = 0; hop < 4; hop++) {
    const open = html.lastIndexOf("<", cursor);
    if (open === -1) return null;
    const close = html.indexOf(">", open);
    const size = html.slice(open, close).match(/font-size:\s*(\d+)px/);
    if (size) return Number(size[1]);
    cursor = open - 1; // no size on this tag — try the one enclosing it
  }
  return null;
}

for (const [field, listed] of Object.entries(FIELD_FONT_SIZES)) {
  const rendered = renderedSize(field);
  if (rendered === null) {
    // Call-button labels are styled through the button, not a data-field, so
    // there is no tag to read back. Their sizes come from the same table.
    notes.push(`${field}: not tagged in the email, size not checkable by rendering`);
    continue;
  }
  if (rendered !== listed) {
    fail(`${field} renders at ${rendered}px but the toolbar shows ${listed}px`);
  }
}

// ── 2. Untouched fields render the shared defaults ─────────────────────────
const bare = buildEblastHtml(required, community, opts);
const textOf = (field: string) => {
  const m = bare.match(new RegExp(`data-field="${field}"[^>]*>(.*?)</`, "s"));
  return m ? m[1].replace(/<[^>]*>/g, "").trim() : null;
};
const expected: Record<string, string> = {
  heroAddress: communityAddressLine(community),
  galleryLabel: defaultGalleryLabel(community),
  thankYouText: DEFAULT_THANK_YOU_TEXT,
  footerName: defaultFooterName(community),
  footerButtonLabel: DEFAULT_WEBSITE_BUTTON_LABEL,
};
for (const [field, want] of Object.entries(expected)) {
  const got = textOf(field);
  if (got !== want) fail(`${field} defaults to "${got}" in the email but "${want}" in lib/eblast-defaults.ts`);
}

// The community name belongs to the logo above the address, not the address.
if (communityAddressLine(community).includes(community.displayName)
    || communityAddressLine(community).includes(community.shortName)) {
  fail("the default address line still carries the community name");
}

// ── 3. Every colourable section is one the email actually draws ───────────
for (const field of SECTION_COLOR_FIELDS) {
  if (!html.includes(`data-bgfield="${field}"`)) {
    fail(`${field} can be coloured in the editor but the email has no section tagged with it`);
  }
}
// And the other way: nothing the email offers is missing from the list, or it
// could be coloured by clicking the preview and never reset or carried forward.
for (const tagged of html.matchAll(/data-bgfield="([^"]+)"/g)) {
  if (!(SECTION_COLOR_FIELDS as readonly string[]).includes(tagged[1])) {
    fail(`the email tags ${tagged[1]} as colourable but it is not in SECTION_COLOR_FIELDS`);
  }
}

// ── 4. A colour carries forward only when the whole field wears it ────────
const COLOR_CASES: Array<[string, string | null]> = [
  ["plain text", null],
  ['<span style="color: #ff0000">all of it</span>', "#ff0000"],
  ['<span style="color: #ff0000">part</span> and plain', null],
  ['<span style="color: #ff0000">one</span><span style="color: #00ff00">two</span>', null],
  ['<span style="font-weight: 700">bold, no colour</span>', null],
  ['<span style="color: #ff0000; font-weight: 700">both</span>', "#ff0000"],
];
for (const [html_, want] of COLOR_CASES) {
  const got = singleTextColor(html_);
  if (got !== want) fail(`singleTextColor(${JSON.stringify(html_)}) gave ${got}, expected ${want}`);
  // Whatever it reports, stripping must leave nothing for it to find.
  if (singleTextColor(withoutTextColor(html_)) !== null) {
    fail(`a colour survived withoutTextColor on ${JSON.stringify(html_)}`);
  }
}
// Stripping must leave the words, and everything else done to them, alone.
const formatted = '<span style="color: #ff0000; font-weight: 700; font-size: 22px">Keep me</span>';
const stripped = withoutTextColor(formatted);
if (!stripped.includes("Keep me")) fail("withoutTextColor lost the text");
if (!stripped.includes("font-weight: 700") || !stripped.includes("font-size: 22px")) {
  fail("withoutTextColor took off more than the colour");
}
// And a colour put on must be one that reads back.
if (singleTextColor(withTextColor("words", "#123456")) !== "#123456") {
  fail("a colour carried onto a field does not read back as that colour");
}
// The body is colourable too, and is the one field that is not a string.
if (!COLORABLE_TEXT_FIELDS.includes("bodyParagraphs")) {
  fail("bodyParagraphs is missing from COLORABLE_TEXT_FIELDS");
}

// ── 5. No part of the editor has grown a second copy of a default ──────────
//
// Named by what the copy would look like rather than by which file it would
// be in: the editor's files move, and a guard that names them stops guarding
// the moment one is renamed. Every file under components/drafter is read.
const SIDEBAR_COPIES: Array<[RegExp, string]> = [
  [/displayName.*address\?\.street/s, "builds its own address line"],
  [/`A Look Around \$\{/, "hardcodes the gallery label"],
  [/\?\?\s*"Visit Our Website"/, "hardcodes the website button label"],
  [/\?\?\s*"Thank You!"/, "hardcodes the thank-you text"],
  [/\?\?\s*community\?\.displayName/, "hardcodes the footer signature"],
  [/const FIELD_FONT_SIZES/, "keeps its own font-size table"],
  [/type BgFieldKey\b/, "keeps its own list of colourable sections"],
];

function editorFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return editorFiles(path);
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [path] : [];
  });
}

const EDITOR_FILES = editorFiles("components/drafter");
for (const file of EDITOR_FILES) {
  const src = fs.readFileSync(file, "utf8");
  for (const [pattern, what] of SIDEBAR_COPIES) {
    if (pattern.test(src)) fail(`${file} ${what} — it should read lib/eblast-defaults.ts instead`);
  }
}

// ── 6. Nothing writes to the draft through a spread ────────────────────────
//
// `setFields` takes a Partial<ExtractedFlyer>, and TypeScript checks the key
// names of an object literal against it — but not the keys that arrive in a
// spread. `setFields({ ...splitDateTime(html) })` compiled cleanly while
// writing to fields called `date` and `time`, which the draft does not have,
// so the hero's date box took every keystroke and kept none of them. Naming
// each field puts the check back.
for (const file of EDITOR_FILES) {
  const src = fs.readFileSync(file, "utf8");
  if (/setFields\(\s*\{\s*\.\.\./.test(src)) {
    fail(`${file} spreads into setFields — name each field, or a wrong key is written silently`);
  }
}

// ── 7. Every colourable surface is reachable from a section's panel ────────
//
// Background colour had no control at all for a while: the only way to change
// one was to hover the right part of the preview and click. Each colour now
// belongs to the panel of the section that draws it, and a colour belonging to
// no panel would be exactly as unreachable as before.
for (const field of UNREACHABLE_COLORS) {
  fail(`${field} belongs to no section's panel, so nobody can change it`);
}
for (const field of SECTION_COLOR_FIELDS) {
  const owners = Object.keys(SECTION_PANELS).filter((name) =>
    SECTION_PANELS[name].colors.some((c) => c.field === field),
  );
  if (owners.length > 1) fail(`${field} appears in ${owners.join(" and ")} — it can only belong to one`);
}
for (const name of Object.keys(SECTION_PANELS)) {
  if (!SECTION_NAMES.includes(name)) fail(`the panel describes "${name}", which the email has no section for`);
}
for (const name of SECTION_NAMES) {
  if (!SECTION_PANELS[name]) fail(`the email draws "${name}" and the panel has nothing to show for it`);
}

// ── Report ─────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  note: ${n}`);
if (failures.length) {
  console.error(`\nThe sidebar and the preview disagree in ${failures.length} place(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `\nPanel and preview agree: ${Object.keys(FIELD_FONT_SIZES).length} field sizes, ` +
  `${Object.keys(expected).length} text defaults, ${SECTION_COLOR_FIELDS.length} colourable surfaces ` +
  `each reachable from exactly one of ${SECTION_NAMES.length} sections, ` +
  `${COLOR_CASES.length} colour-carrying cases, ` +
  `${SIDEBAR_COPIES.length} duplicate-copy patterns across ${EDITOR_FILES.length} editor files.`,
);
