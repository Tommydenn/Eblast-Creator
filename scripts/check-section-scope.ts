/**
 * Checks that asking the AI for a change inside a section stays inside it.
 *
 * Clicking a section in the preview points the AI at that part of the email.
 * The model is told as much, but the guarantee is the bound applied after it
 * answers — so this checks the bound rather than the asking, by handing it a
 * reply that rewrote every field and making sure only the section's own
 * survive.
 *
 * Also checks the map itself: a field in two sections would be reachable from
 * both, and an editable field in none could never be refined at all.
 *
 *   npx tsx scripts/check-section-scope.ts
 */
import {
  SECTION_FIELDS,
  SECTION_LABELS,
  boundToSection,
  isEblastSection,
  sectionScopeInstruction,
  type EblastSection,
} from "@/lib/eblast-sections";
import { FIELD_FONT_SIZES } from "@/lib/eblast-defaults";

const failures: string[] = [];
const fail = (m: string) => failures.push(m);
const SECTIONS = Object.keys(SECTION_FIELDS) as EblastSection[];

// ── 1. The map is sound ────────────────────────────────────────────────────
const owner = new Map<string, EblastSection>();
for (const section of SECTIONS) {
  for (const field of SECTION_FIELDS[section]) {
    const already = owner.get(field);
    if (already) fail(`${field} belongs to both ${already} and ${section}`);
    owner.set(field, section);
  }
  if (!SECTION_LABELS[section]) fail(`${section} has no label anyone could read`);
}

// Every field the toolbar can format is a field someone can see and edit, so
// every one of them has to be refinable from some section.
for (const field of Object.keys(FIELD_FONT_SIZES)) {
  if (!owner.has(field)) fail(`${field} is editable but belongs to no section, so the AI can never be asked to change it`);
}

// ── 2. The bound holds ─────────────────────────────────────────────────────
const before: Record<string, unknown> = {};
const after: Record<string, unknown> = {};
for (const field of owner.keys()) {
  before[field] = `original ${field}`;
  after[field] = `REWRITTEN ${field}`;
}
// Fields no section owns, which nothing should ever be allowed to touch.
for (const field of ["heroBgColor", "textAlign", "ctaButtonHref", "audienceHints"]) {
  before[field] = `original ${field}`;
  after[field] = `REWRITTEN ${field}`;
}

for (const section of SECTIONS) {
  const bounded = boundToSection(before, after, section);
  for (const field of Object.keys(before)) {
    const owned = (SECTION_FIELDS[section] as readonly string[]).includes(field);
    const want = owned ? after[field] : before[field];
    if (bounded[field] !== want) {
      fail(
        owned
          ? `working in ${section}, a change to its own ${field} was discarded`
          : `working in ${section}, a change to ${field} got through and should not have`,
      );
    }
  }
  // The instruction has to name the section, or it tells the model nothing.
  const text = sectionScopeInstruction(section);
  if (!text.includes(SECTION_LABELS[section])) fail(`the scope note for ${section} never names it`);
  for (const field of SECTION_FIELDS[section]) {
    if (!text.includes(field)) fail(`the scope note for ${section} leaves out ${field}`);
  }
}

// Photos own one line — the label above the grid, which the email draws in
// that section and the panel now edits there. Nothing else written may survive
// a request made in Photos.
const photos = boundToSection(before, after, "images");
for (const field of Object.keys(before)) {
  const owned = field === "galleryLabel";
  if (photos[field] !== (owned ? after[field] : before[field])) {
    fail(owned ? `a request in Photos could not change ${field}` : `a request in Photos changed ${field}`);
  }
}

// No section means the whole email, which is how it worked before any of this.
const whole = boundToSection(before, after, null);
for (const field of Object.keys(after)) {
  if (whole[field] !== after[field]) fail(`a request on the whole email had ${field} held back`);
}

// ── 3. Only real sections are accepted off the wire ────────────────────────
for (const bad of ["", "footer", "Hero", "everything", null, 7, {}]) {
  if (isEblastSection(bad)) fail(`${JSON.stringify(bad)} was accepted as a section`);
}
for (const good of SECTIONS) {
  if (!isEblastSection(good)) fail(`${good} was rejected as a section`);
}

// ── Report ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
const owned = [...owner.keys()].length;
console.log(
  `\n${SECTIONS.length} sections own ${owned} fields between them, none shared.\n` +
  `A refinement asked in a section changes that section's fields and puts every other field back.\n` +
  `Every field the toolbar can format belongs to a section, so all of them can be asked for.`,
);
