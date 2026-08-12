// Calls the deployed generate endpoint with notes only and prints the copy.
// The route returns the draft; it does NOT persist one (saving happens
// client-side), so this reads real output without creating a saved draft.
const BASE = "https://eblast-creator.vercel.app";

const CASES = [
  {
    label: "FESTIVE — Talamore Sun Prairie (same input as the reference chat)",
    slug: "talamore-sun-prairie",
    notes: `Summer kickoff event. Refreshments, community tours, and a special visit from Havens Petting Farm bringing bunnies, goats, alpacas and more for the whole family.
Thursday, June 11th, 1:00 PM - 4:00 PM. Petting zoo 1:30 PM - 3:30 PM.
Talamore Sun Prairie, 275 North City Station Drive, Sun Prairie, WI 53590.
RSVP is requested.`,
  },
  {
    label: "SERIOUS — Caretta Holmen family education (same input as the reference chat)",
    slug: "caretta-holmen",
    notes: `Free family education presentation by Pam Dunwald, Co-CEO of Your Nurse Advocate Consulting: "11 Signs Your Aging Parents May Need Help in the Home."
Covers changes in safety, nutrition, hygiene, health management and daily household responsibilities. Attendees get next steps, local resources, and questions to ask when exploring care options.
Refreshments and a tour afterward.
Tuesday, July 7th at 2:30 PM. Caretta Holmen, 2120 Staphorst Lane, Holmen WI 54636. RSVP requested.`,
  },
];

function show(label, extracted) {
  console.log("\n" + "=".repeat(78));
  console.log(label);
  console.log("=".repeat(78));
  const f = extracted;
  console.log(`SUBJECT:        ${f.subject}`);
  console.log(`PREVIEW:        ${f.previewText}`);
  console.log(`EYEBROW:        ${f.eyebrow}`);
  console.log(`HEADLINE:       ${f.headline}`);
  console.log(`SCRIPT SUB:     ${f.scriptSubheadline ?? ""}`);
  console.log(`STORY EYEBROW:  ${f.storyEyebrow}`);
  console.log(`STORY TITLE:    ${f.storyScriptTitle ?? ""}`);
  console.log(`RSVP LABEL:     ${f.rsvpLabel ?? ""}`);
  console.log("\nBODY:");
  (f.bodyParagraphs ?? []).forEach((p, i) => console.log(`  [${i + 1}] ${p}\n`));
  console.log(`CTA EYEBROW:    ${f.ctaEyebrow}`);
  console.log(`CTA HEADLINE:   ${f.ctaHeadline}`);
  console.log(`CTA SUBLINE:    ${f.ctaSubline ?? ""}`);
  console.log(`CTA BUTTON:     ${f.ctaButtonLabel}`);
}

for (const c of CASES) {
  const fd = new FormData();
  fd.append("communitySlug", c.slug);
  fd.append("notes", c.notes);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/draft-from-pdf`, { method: "POST", body: fd });
  const data = await res.json().catch(() => null);
  if (!data?.ok) {
    console.log(`\n${c.label}\n  FAILED (${res.status}): ${data?.error ?? "no body"}`);
    continue;
  }
  show(`${c.label}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`, data.extracted);
}
