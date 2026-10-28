/**
 * Checks that the sidebar is still the email.
 *
 * The sidebar used to be five tabs over an email with seven sections, and the
 * names did not line up: the Hero tab held the Header too, the Footer tab held
 * the Call to Action, and the photos were gathered onto a tab of their own,
 * away from the words they sit between. Nothing caught it, because nothing
 * ever compared the two lists.
 *
 * So this compares them. Four things have to hold:
 *
 *   - every section of the email is a row in the outline
 *   - every scope the AI has is reachable from one of those rows
 *   - every row but the header has something behind it to edit
 *   - every block the email draws is edited somewhere in the sidebar
 *
 * The last one is the one that would rot quietly: a block whose box was lost
 * while moving things around still renders in the email, still takes up room
 * in the order, and can no longer be typed into by anybody.
 *
 *   npx tsx scripts/check-editor-outline.ts
 */
import fs from "node:fs";
import { SECTIONS, SECTION_NAMES } from "@/lib/eblast-blocks";
import { SECTION_FIELDS, type EblastSection } from "@/lib/eblast-sections";
import { OUTLINE_ROWS, OUTLINE_SCOPE, OUTLINE_WITHOUT_FIELDS } from "@/lib/editor-outline";

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

const PANEL = "components/drafter/EditorPanel.tsx";
const panel = fs.readFileSync(PANEL, "utf8");

// ── Every section of the email is a row in the outline ─────────────────────
for (const name of SECTION_NAMES) {
  if (!OUTLINE_SCOPE[name]) fail(`the ${name} section of the email has no row in the sidebar`);
  if (!OUTLINE_ROWS.includes(name)) fail(`the ${name} section is missing from the outline`);
}
for (const row of Object.keys(OUTLINE_SCOPE)) {
  if (row !== "Subject" && !SECTION_NAMES.includes(row)) {
    fail(`the outline has a row called "${row}" that the email has no section for`);
  }
}
if (new Set(OUTLINE_ROWS).size !== OUTLINE_ROWS.length) {
  fail("a row appears in the outline twice");
}

// ── Every scope the AI has can be reached ──────────────────────────────────
{
  const reachable = new Set(Object.values(OUTLINE_SCOPE));
  for (const scope of Object.keys(SECTION_FIELDS) as EblastSection[]) {
    if (!reachable.has(scope)) {
      fail(`the AI has a "${scope}" scope that no row of the sidebar can point it at`);
    }
  }
}

// ── Every row but the header has something behind it ───────────────────────
{
  // The sections' bodies are a record in the panel; the subject's is written
  // straight into its own row, because it is the one row that is not a
  // section of the email.
  const block = panel.match(/const body: Record<string, React\.ReactNode> = \{([\s\S]*?)\n  \};/);
  if (!block) {
    fail(`${PANEL} no longer declares what each section puts in the panel`);
  } else {
    const bodies = new Set(
      [...block[1].matchAll(/^\s*(?:"([^"]+)"|([A-Za-z]\w*)):/gm)].map((m) => m[1] ?? m[2]),
    );
    if (/<SubjectSection\s*\/>/.test(panel)) bodies.add("Subject");

    for (const row of OUTLINE_ROWS) {
      const expected = !OUTLINE_WITHOUT_FIELDS.includes(row);
      if (expected && !bodies.has(row)) fail(`the ${row} row opens onto nothing`);
      if (!expected && bodies.has(row)) {
        fail(`${row} is listed as having no fields, but the panel has a body for it`);
      }
    }
    for (const row of bodies) {
      if (!OUTLINE_ROWS.includes(row)) fail(`the panel has a body for "${row}", which is not a row`);
    }
  }

  for (const row of OUTLINE_WITHOUT_FIELDS) {
    if (!OUTLINE_ROWS.includes(row)) fail(`"${row}" has no fields and is not a row either`);
  }
}

// ── The outline is built from the email, not from a list of its own ────────
if (!/orderedSections\(/.test(panel)) {
  fail(`${PANEL} no longer reads the email's own section order — a section added to lib/eblast-blocks.ts would not appear`);
}

// ── Every block the email draws is edited somewhere ────────────────────────
{
  const edited = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/\b(?:block|orderBlock)="([^"]+)"/g)) edited.add(m[1]);
    }
  };
  walk("components/drafter");

  for (const section of SECTIONS) {
    for (const block of section.blocks) {
      if (!edited.has(block.name)) {
        fail(`the ${section.name} section draws "${block.name}" and nothing in the sidebar edits it`);
      }
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const blocks = SECTIONS.reduce((n, s) => n + s.blocks.length, 0);
console.log(
  `\nThe sidebar is the email: ${OUTLINE_ROWS.length} rows for ${SECTION_NAMES.length} sections and the subject line,\n` +
  `all ${new Set(Object.values(OUTLINE_SCOPE)).size} of the AI's scopes reachable, every row but ` +
  `${OUTLINE_WITHOUT_FIELDS.join(", ")} opening onto its own fields,\nand all ${blocks} blocks editable somewhere.`,
);
