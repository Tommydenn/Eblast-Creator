/**
 * What the panel shows for each part of the email.
 *
 * The editor has one navigation now — the email itself — so a section's panel
 * has to hold everything that section owns: its words, its photos and its
 * colours. This is the list of what that means, kept here rather than spread
 * across one component per section, because the only way the panel stays
 * consistent between sections is for every section to be described the same
 * way.
 *
 * The section names are the renderer's own, from lib/eblast-blocks.ts, which
 * is also what the preview tags its rows with. So clicking a row in the email
 * and opening the right panel are the same lookup.
 */

import { SECTION_COLOR_FIELDS, type SectionColorField } from "@/lib/eblast-defaults";

/** The photo slot a section draws, for the sections that draw one. */
export type PhotoSlot = "hero" | "secondary" | "gallery";

export interface SectionPanel {
  /** A sentence for the sections that have no words of their own. */
  note?: string;
  /** The photos this section draws, edited as fields inside it. */
  photo?: PhotoSlot;
  /** The surfaces whose colour belongs to this section. */
  colors: Array<{ field: SectionColorField; label: string }>;
}

/**
 * Every photo is a field inside the section that draws it, including the
 * hero's — which is where the email puts it, inside the hero band and in the
 * same table row as the headline, so it could not be a section of its own
 * without changing what lands in the inbox.
 */
export const SECTION_PANELS: Record<string, SectionPanel> = {
  Header: {
    note: "The community's logo. It is set on the Community page, so there is nothing to type here.",
    colors: [{ field: "headerBgColor", label: "Background" }],
  },
  Hero: {
    photo: "hero",
    colors: [
      { field: "heroBgColor", label: "Background" },
      { field: "ctaButtonBgColor", label: "Call button" },
    ],
  },
  Story: {
    colors: [{ field: "storyBgColor", label: "Background" }],
  },
  "Secondary Image": {
    note: "One photo, full width, between the story and the gallery.",
    photo: "secondary",
    colors: [{ field: "secondaryImageBgColor", label: "Background" }],
  },
  "Photo Gallery": {
    photo: "gallery",
    colors: [
      { field: "galleryLabelBgColor", label: "Label background" },
      { field: "galleryBgColor", label: "Grid background" },
    ],
  },
  "Call to Action": {
    colors: [
      { field: "finalCtaBgColor", label: "Background" },
      { field: "finalCtaButtonBgColor", label: "Call button" },
    ],
  },
  Footer: {
    colors: [
      { field: "footerBgColor", label: "Background" },
      { field: "footerButtonBgColor", label: "Website button" },
    ],
  },
};

/** Every colourable surface, and the section it is reached from. */
export function sectionOfColorField(field: SectionColorField): string | undefined {
  return Object.keys(SECTION_PANELS).find((name) =>
    SECTION_PANELS[name].colors.some((c) => c.field === field),
  );
}

/** What a colour is before anybody picks one, which is the community's own. */
export function defaultColor(
  field: SectionColorField,
  community: { brand?: { primary?: string; accent?: string; background?: string } } | null | undefined,
): string {
  const brand = community?.brand;
  switch (field) {
    case "headerBgColor": return brand?.background ?? "#ffffff";
    case "heroBgColor": return brand?.primary ?? "#000000";
    case "finalCtaBgColor": return brand?.accent ?? "#000000";
    case "ctaButtonBgColor": return brand?.accent ?? "#000000";
    case "finalCtaButtonBgColor": return brand?.primary ?? "#000000";
    case "footerButtonBgColor": return brand?.primary ?? "#000000";
    default: return "#FFFFFF";
  }
}

/** Nothing colourable may be unreachable, so this is checked rather than hoped. */
export const UNREACHABLE_COLORS = SECTION_COLOR_FIELDS.filter((f) => !sectionOfColorField(f));

/**
 * Where each row's words are stored, and what to look for in the email to see
 * whether they were drawn.
 *
 * Whether something is in the email is a question only the email can answer.
 * It leaves nothing behind for more reasons than the panel could keep a list
 * of — a field can be empty, or turned off, or perfectly full and still not
 * printed because the band it belongs to needs a date — so the panel reads the
 * answer back out of what was rendered instead of working it out a second
 * time. These are the names to read it by.
 *
 * Storage and drawn name are not always the same. A button carries no words of
 * the draft's own (the phone number and the website come from the community),
 * so it is counted by the flag that would hide it; the hero's date band is one
 * row holding two fields, so either of them counts as the band being there.
 */
export const ROW_SOURCES: Record<string, { storage: string; drawn: string[] }> = {
  rsvpLabel: { storage: "rsvpLabel", drawn: ["rsvpLabel"] },
  headline: { storage: "headline", drawn: ["headline"] },
  scriptSubheadline: { storage: "scriptSubheadline", drawn: ["scriptSubheadline"] },
  eventDate: { storage: "eventDate", drawn: ["eventDate"] },
  eventTime: { storage: "eventTime", drawn: ["eventTime"] },
  heroAddress: { storage: "heroAddress", drawn: ["heroAddress"] },
  ctaButtonLabel: { storage: "ctaButtonLabel", drawn: ["ctaButtonHidden"] },
  storyEyebrow: { storage: "storyEyebrow", drawn: ["storyEyebrow"] },
  storyScriptTitle: { storage: "storyScriptTitle", drawn: ["storyScriptTitle"] },
  bodyParagraphs: { storage: "bodyParagraphs", drawn: ["bodyParagraphs"] },
  galleryLabel: { storage: "galleryLabel", drawn: ["galleryLabel"] },
  ctaRsvpLabel: { storage: "ctaRsvpLabel", drawn: ["ctaRsvpLabel"] },
  ctaEventDate: { storage: "ctaEventDate", drawn: ["ctaEventDate"] },
  ctaEventTime: { storage: "ctaEventTime", drawn: ["ctaEventTime"] },
  finalCtaButtonLabel: { storage: "finalCtaButtonLabel", drawn: ["finalCtaButtonHidden"] },
  footerButtonLabel: { storage: "footerButtonLabel", drawn: ["footerButtonHidden"] },
  thankYouText: { storage: "thankYouText", drawn: ["thankYouText"] },
  footerSenderName: { storage: "footerSenderName", drawn: ["footerSenderName"] },
  footerName: { storage: "footerName", drawn: ["footerName"] },
  footerSenderEmail: { storage: "footerSenderEmail", drawn: ["footerSenderEmail"] },
};

/**
 * Fields the email fills in for itself when the draft leaves them alone.
 *
 * A draft that came out without one of these holds an empty string, which is
 * not the same as never having been set: the empty string is exactly what
 * stops the default. So putting one back means clearing it, which is what
 * "Show this" does for these rows.
 *
 * The buttons are not in here. Clearing a button's label leaves the button
 * standing — it is the flag that takes it away, not the words — so the row is
 * still in the email and offering to show it would describe it wrongly. The
 * guard checks that, which is how the two of them came out of this list.
 */
export const RESTORABLE_FIELDS = new Set([
  "heroAddress",
  "galleryLabel",
  "thankYouText",
  "footerName",
  "ctaRsvpLabel",
]);

/**
 * What the email tags as drawn, by the same rule the editor reads it by.
 *
 * Shared with the guard so the two can never drift: a field counts when it
 * carries words, and a button counts by being there at all.
 */
export function drawnFieldsIn(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/data-field="([^"]+)"[^>]*>([\s\S]*?)<\//g)) {
    const text = m[2].replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
    if (text) out.add(m[1]);
  }
  for (const m of html.matchAll(/data-deletefield="([^"]+)"/g)) out.add(m[1]);
  return out;
}

/**
 * How a row is turned off: by name, or by a flag of its own.
 *
 * One switch per box. The hero's date, time and address used to be one row
 * with two switches inside it and a third nested underneath; they are three
 * boxes now, each answering only for itself.
 */
export interface HideSpec {
  block?: string;
  flag?: string;
}

export const ROW_HIDE: Record<string, HideSpec> = {
  rsvpLabel: { block: "rsvpLabel" },
  headline: { block: "headline" },
  scriptSubheadline: { block: "scriptSubheadline" },
  eventDate: { block: "eventDate" },
  eventTime: { block: "eventTime" },
  heroAddress: { block: "heroAddress" },
  bodyParagraphs: { block: "bodyParagraphs" },
  galleryLabel: { block: "galleryLabel" },
  ctaButtonLabel: { flag: "ctaButtonHidden" },
  storyEyebrow: { block: "storyEyebrow" },
  storyScriptTitle: { block: "storyScriptTitle" },
  ctaRsvpLabel: { block: "ctaRsvpLabel" },
  ctaEventDate: { block: "ctaEventDate" },
  ctaEventTime: { block: "ctaEventTime" },
  finalCtaButtonLabel: { flag: "finalCtaButtonHidden" },
  footerButtonLabel: { flag: "footerButtonHidden" },
  thankYouText: { block: "thankYouText" },
  footerSenderName: { block: "footerSenderName" },
  footerName: { block: "footerName" },
  footerSenderEmail: { block: "footerSenderEmail" },
};

interface Toggles {
  hiddenBlocks?: string[];
  shownBlocks?: string[];
  [key: string]: unknown;
}

const has = (drawn: Set<string> | string[], name: string) =>
  Array.isArray(drawn) ? drawn.includes(name) : drawn.has(name);

/**
 * Whether one hideable name is off.
 *
 * Three ways a line ends up absent, and the row has to read the same for all
 * of them, because the reader only ever sees one outcome: hidden on purpose,
 * never written by the draft, or written but not printed because the band it
 * belongs to is missing.
 *
 * Turning one back on is remembered whatever the reason, so the control works
 * on a box that is still empty — which is the only way it could work at all on
 * a draft that arrived without the line.
 */
export function nameOff(flyer: Toggles, name: string, drawn: Set<string> | string[]): boolean {
  if ((flyer.hiddenBlocks ?? []).includes(name)) return true;
  if ((flyer.shownBlocks ?? []).includes(name)) return false;
  return !has(drawn, name);
}

/** Whether a row is off. */
export function rowOff(flyer: Toggles, key: string, drawn: Set<string> | string[]): boolean {
  const hide = ROW_HIDE[key];
  const spec = ROW_SOURCES[key];
  if (!hide || !spec) return false;
  // A button carries no words, so its flag is the whole story.
  if (hide.flag) return !!flyer[hide.flag];
  return nameOff(flyer, hide.block ?? key, drawn);
}
