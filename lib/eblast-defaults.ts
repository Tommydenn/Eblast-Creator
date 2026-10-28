/**
 * Every value the eblast falls back to when a field has never been edited.
 *
 * The sidebar pre-fills each box with what the email would render for an
 * untouched field, and the toolbar shows the size that field renders at. Both
 * only hold while the sidebar and the template agree — and they had drifted:
 * the address line dropped the community name in the email while the sidebar
 * carried on showing it, because each side owned its own copy of the default.
 *
 * So neither side owns one any more. Everything the two have to agree on lives
 * here and is imported by both, which leaves nothing to keep in step by hand.
 */

/**
 * The parts of a community these defaults read. Written structurally so the
 * full Community record from the database and the partial one the sidebar
 * holds (which may still be loading) both satisfy it.
 */
interface AddressForDefaults {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface CommunityForDefaults {
  displayName?: string;
  shortName?: string;
  address?: AddressForDefaults | null;
  /** Where its events are held, when that is not where the community is. */
  eventsAddress?: AddressForDefaults | null;
  useEventsAddress?: boolean;
}

/**
 * The hero address line: street, city, state and zip.
 *
 * The community name is deliberately left out. The logo directly above it
 * already says whose eblast this is, so repeating the name read as clutter.
 * Drafts approved or pushed before this changed keep their old line, which was
 * written into them as their own text and so never falls back to this.
 */
export function communityAddressLine(community: CommunityForDefaults | null | undefined): string {
  // A community that holds its events somewhere else prints that venue. The
  // switch is separate from the address so turning it off keeps the venue on
  // file, and an empty venue falls back rather than printing nothing.
  const venue = community?.useEventsAddress ? community.eventsAddress : null;
  const address = venue && Object.values(venue).some(Boolean) ? venue : community?.address;
  if (!address) return "";
  const stateZip = [address.state, address.zip].filter(Boolean).join(" ");
  return [address.street, address.city, stateZip].filter(Boolean).join(", ");
}

/** Heading above the photo grid. Empty when the community has no short name. */
export function defaultGalleryLabel(community: CommunityForDefaults | null | undefined): string {
  return community?.shortName ? `A Look Around ${community.shortName}` : "";
}

/** Signature under the closing salutation. */
export function defaultFooterName(community: CommunityForDefaults | null | undefined): string {
  return community?.displayName ?? "";
}

export const DEFAULT_THANK_YOU_TEXT = "Thank You!";
export const DEFAULT_WEBSITE_BUTTON_LABEL = "Visit Our Website";

/**
 * The size each field renders at, in pixels.
 *
 * These used to be chosen from how much text a field held. They shrank as you
 * typed and grew as you deleted, so the size was never yours and the toolbar's
 * number was a guess: on a short subheadline it read 40 while the email
 * rendered 48, and nudging down "one point" dropped it nine. One fixed size per
 * field settles both halves — nothing moves on its own, and the number in the
 * toolbar is the truth. Long text wraps instead of shrinking, which the pinned
 * 600px shell and the wrapping rules already handle.
 */
export const FIELD_FONT_SIZES = {
  headline: 40,
  scriptSubheadline: 40,
  eventDate: 26,
  eventTime: 26,
  rsvpLabel: 18,
  storyEyebrow: 15,
  storyScriptTitle: 42,
  bodyParagraphs: 19,
  ctaEventDate: 30,
  ctaEventTime: 30,
  ctaRsvpLabel: 18,
  footerSenderName: 18,
  footerName: 18,
  thankYouText: 30,
  heroAddress: 21,
  galleryLabel: 15,
  ctaButtonLabel: 18,
  finalCtaButtonLabel: 18,
  footerButtonLabel: 17,
  footerSenderEmail: 18,
};

/**
 * Every section and button whose colour someone can set on a draft.
 *
 * The editor's colour picker, the reset, and the carry-forward from a
 * community's last eblast all work from this one list, so a colour added here
 * is picked up by all three rather than by whichever was remembered.
 */
export const SECTION_COLOR_FIELDS = [
  "headerBgColor",
  "heroBgColor",
  "finalCtaBgColor",
  "footerBgColor",
  "storyBgColor",
  "secondaryImageBgColor",
  "galleryLabelBgColor",
  "galleryBgColor",
  "ctaButtonBgColor",
  "finalCtaButtonBgColor",
  "footerButtonBgColor",
] as const;

export type SectionColorField = (typeof SECTION_COLOR_FIELDS)[number];

/**
 * The text fields whose colour someone can set. Every field the toolbar knows
 * a size for is one, plus the body, which is paragraphs rather than a line.
 */
export const COLORABLE_TEXT_FIELDS: string[] = [
  ...Object.keys(FIELD_FONT_SIZES),
  "bodyParagraphs",
];

/**
 * The one colour a field is written in, or null if it is not written in one.
 *
 * Carrying a colour forward only makes sense when the whole field wears it. A
 * line with one word picked out in another colour has no single colour to
 * carry, and a field with any uncoloured text is partly the template's default
 * — in both cases the honest answer is to carry nothing and let the new draft
 * start from the default, which is what was asked for.
 *
 * Reads the canonical inline format the editor writes: flat spans, no nesting.
 */
export function singleTextColor(html: string | undefined | null): string | null {
  if (!html) return null;
  const withoutBreaks = html.replace(/<br\s*\/?>/gi, "");
  let color: string | null = null;
  let sawText = false;
  let cursor = 0;

  const span = /<span([^>]*)>([\s\S]*?)<\/span>/gi;
  let match: RegExpExecArray | null;
  const hasText = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim() !== "";

  while ((match = span.exec(withoutBreaks)) !== null) {
    // Text sitting between spans wears the template's own colour, so the field
    // is a mix whatever the spans say.
    if (hasText(withoutBreaks.slice(cursor, match.index))) return null;
    cursor = match.index + match[0].length;

    if (!hasText(match[2])) continue;
    sawText = true;
    const declared = /(?:^|[;\s"])color\s*:\s*([^;"]+)/i.exec(match[1]);
    if (!declared) return null; // formatted, but still the default colour
    const here = declared[1].trim().toLowerCase();
    if (color === null) color = here;
    else if (color !== here) return null;
  }

  if (hasText(withoutBreaks.slice(cursor))) return null;
  return sawText ? color : null;
}

/** The same field with every colour taken off, and nothing else changed. */
export function withoutTextColor(html: string | undefined | null): string {
  if (!html) return html ?? "";
  return html
    .replace(/\sstyle="([^"]*)"/gi, (_whole, style: string) => {
      const kept = String(style)
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .filter((d) => !/^color\s*:/i.test(d));
      return kept.length ? ` style="${kept.join("; ")}"` : "";
    })
    // A span that carried nothing but a colour has no reason to be left behind.
    .replace(/<span>([\s\S]*?)<\/span>/gi, "$1");
}

/** Wrap a field's text in a colour, for one carried forward from a past draft. */
export function withTextColor(html: string, color: string): string {
  if (!html.trim()) return html;
  return `<span style="color: ${color}">${html}</span>`;
}

/** Size for a field name only known at runtime, such as the editor's selection. */
export function fieldFontSize(field: string | null | undefined): number | undefined {
  return field ? (FIELD_FONT_SIZES as Record<string, number>)[field] : undefined;
}
