/**
 * What belongs to each section of the eblast.
 *
 * Clicking a section in the preview, or opening its tab in the sidebar, points
 * the AI at that part of the email. For that to mean anything, both sides have
 * to agree on which fields a section actually owns: the editor uses it to say
 * what will change, and the refinement route uses it to make sure nothing else
 * does.
 */

/** The sections the editor and the preview both work in. */
export type EblastSection = "subject" | "hero" | "story" | "images" | "cta";

/** What to call each one where someone can read it. */
export const SECTION_LABELS: Record<EblastSection, string> = {
  subject: "Subject line",
  hero: "Hero",
  story: "Story",
  images: "Photos",
  cta: "Footer",
};

/**
 * The fields each section owns, named as they are on the draft.
 *
 * Grouped by where a field is edited rather than by where it renders, because
 * that is what someone has in front of them when they ask for a change. The
 * gallery label is the one that could go either way — it draws above the photo
 * grid but is typed in the Story tab, so it counts as Story.
 *
 * Photos own no text. A request made there can still rearrange the photos,
 * which the model handles separately from the fields.
 */
export const SECTION_FIELDS: Record<EblastSection, readonly string[]> = {
  subject: ["subject", "previewText"],
  hero: [
    "eyebrow",
    "headline",
    "scriptSubheadline",
    "rsvpLabel",
    "eventDate",
    "eventTime",
    "eventLocation",
    "heroAddress",
    "ctaButtonLabel",
    "heroImageAlt",
    "heroImageDescription",
  ],
  story: [
    "storyEyebrow",
    "storyScriptTitle",
    "bodyParagraphs",
    "galleryLabel",
    "secondaryImageAlt",
    "secondaryImageDescription",
  ],
  images: [],
  cta: [
    "ctaEyebrow",
    "ctaHeadline",
    "ctaSubline",
    "ctaRsvpLabel",
    "ctaEventDate",
    "ctaEventTime",
    "finalCtaButtonLabel",
    "thankYouText",
    "footerSenderName",
    "footerName",
    "footerSenderEmail",
    "footerButtonLabel",
    "footerCustomLines",
  ],
};

/**
 * A refinement, held to the section it was asked in.
 *
 * The model is told which fields it may change, but being told is not the same
 * as being held to it, and a refinement that quietly rewrote the footer while
 * someone was editing the hero is the thing that makes an assistant hard to
 * trust. Every field outside the section is put back exactly as it was.
 *
 * Photos are deliberately not bounded here: the model only rearranges them
 * when an instruction plainly asks it to, and someone asking for a photo
 * change has asked for it wherever they happen to be standing.
 */
export function boundToSection<T extends Record<string, unknown>>(
  before: T,
  after: T,
  section: EblastSection | null,
): T {
  if (!section) return after;
  const allowed = new Set(SECTION_FIELDS[section]);
  const bounded: Record<string, unknown> = { ...after };
  for (const key of Object.keys(bounded)) {
    if (!allowed.has(key)) bounded[key] = before[key];
  }
  return bounded as T;
}

/** Whether a name is one of the sections, for a value arriving over the wire. */
export function isEblastSection(value: unknown): value is EblastSection {
  return typeof value === "string" && value in SECTION_FIELDS;
}

/**
 * What to tell the model about the part of the email someone is working in.
 *
 * Only ever narrows. The hard guarantee is applied after the model answers —
 * fields outside the section are put back as they were — but saying so up
 * front is what stops it rewriting half the email and having most of that work
 * thrown away.
 */
export function sectionScopeInstruction(section: EblastSection): string {
  const fields = SECTION_FIELDS[section];
  const label = SECTION_LABELS[section];
  if (fields.length === 0) {
    return [
      `The user is working on the ${label} and their instruction is about those photos.`,
      `No text field may change. If they are asking for something other than which photos appear, or how they are arranged, change nothing and say so in refineNote.`,
    ].join("\n");
  }
  return [
    `The user is working on the ${label} of the email, so read their instruction as being about that part of it.`,
    `Only these fields may change: ${fields.join(", ")}.`,
    `Return every other field exactly as it was given to you. A change outside this list will be discarded, so spending the reply on one helps nobody.`,
    `If what they are asking for lives somewhere else in the email, leave everything alone and say which part it belongs to in refineNote.`,
  ].join("\n");
}
