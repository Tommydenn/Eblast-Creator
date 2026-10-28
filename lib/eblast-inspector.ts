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
