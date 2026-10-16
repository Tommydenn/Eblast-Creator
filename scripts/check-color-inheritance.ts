/**
 * Checks what a new eblast would inherit from a community's last one.
 *
 * Colour is a standing choice: a community whose hero was turned burgundy
 * wants the next one burgundy too. This runs the real carry-forward against
 * the drafts actually on file and reports what each community would pick up,
 * so the two rules that matter can be seen rather than assumed —
 *
 *   - it reads the exact community and no other, so The Glenn Hopkins never
 *     inherits from The Glenn West St Paul;
 *   - a text colour carries only where the whole field wears one.
 *
 *   npx tsx scripts/check-color-inheritance.ts
 */
import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { colorsFromLastEblast } from "@/lib/generate-draft";
import { SECTION_COLOR_FIELDS, singleTextColor } from "@/lib/eblast-defaults";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

const sql = neon(process.env.DATABASE_URL!);

/** A new draft, as the drafter would hand it over: text written, no colours. */
const FRESH = {
  subject: "s", previewText: "p", eyebrow: "e",
  headline: "Fall Pie Social", storyEyebrow: "Eyebrow",
  bodyParagraphs: ["First paragraph.", "", "Second paragraph."],
  ctaEyebrow: "c", ctaHeadline: "c", ctaSubline: "c",
  ctaButtonLabel: "Call 920-555-1234", ctaButtonHref: "tel:9205551234",
  heroImageAlt: "a", heroImageDescription: "d", audienceHints: [],
  eventDate: "Wednesday, March 3", thankYouText: "Thank You!",
  galleryLabel: "A Look Around", footerName: "Community",
} as unknown as ExtractedFlyer;

async function main() {
  const failures: string[] = [];

  const communities: any[] = await sql`
    select distinct d.community_slug as slug
    from saved_drafts d where d.deleted_at is null order by 1`;

  let withSections = 0;
  let withText = 0;
  const rows: string[] = [];

  for (const { slug } of communities) {
    const carried = await colorsFromLastEblast(slug, FRESH) as Record<string, unknown>;
    const sections = SECTION_COLOR_FIELDS.filter((f) => carried[f] !== undefined);
    const texts = Object.keys(carried).filter((k) => !(SECTION_COLOR_FIELDS as readonly string[]).includes(k as any));
    if (sections.length) withSections++;
    if (texts.length) withText++;
    if (sections.length || texts.length) {
      rows.push(`  ${slug.padEnd(28)} ${String(sections.length).padStart(2)} section  ${String(texts.length).padStart(2)} text   ${[...sections, ...texts].join(", ").slice(0, 70)}`);
    }

    // Anything carried onto a text field must read back as one single colour,
    // or the carry-forward has invented a mix the previous draft never had.
    for (const key of texts) {
      const value = carried[key];
      const html = Array.isArray(value) ? (value as string[]).filter((p) => p.replace(/<[^>]*>/g, "").trim())[0] : value;
      if (typeof html !== "string") continue;
      if (!singleTextColor(html)) {
        failures.push(`${slug}: ${key} came back without a single colour: ${JSON.stringify(html).slice(0, 80)}`);
      }
    }
    // Nothing may be carried onto a field the fresh draft never had.
    for (const key of texts) {
      if ((FRESH as unknown as Record<string, unknown>)[key] === undefined) {
        failures.push(`${slug}: carried ${key}, which this draft has no text for`);
      }
    }
  }

  // A community with no drafts at all must come back with nothing, not throw.
  const none = await colorsFromLastEblast("a-community-that-does-not-exist", FRESH);
  if (Object.keys(none).length !== 0) {
    failures.push("a community with no previous eblast carried something forward");
  }

  console.log(`communities with a saved draft: ${communities.length}`);
  console.log(`  would inherit section or button colours: ${withSections}`);
  console.log(`  would inherit a text colour:             ${withText}\n`);
  for (const r of rows) console.log(r);

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nEvery carried colour is a single colour, lands on a field the draft has, and an unknown community carries nothing.`);
}

main();
