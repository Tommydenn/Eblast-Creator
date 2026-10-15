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
export interface CommunityForDefaults {
  displayName?: string;
  shortName?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
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
  const address = community?.address;
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
  ctaEventDate: 32,
  ctaEventTime: 32,
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

/** Size for a field name only known at runtime, such as the editor's selection. */
export function fieldFontSize(field: string | null | undefined): number | undefined {
  return field ? (FIELD_FONT_SIZES as Record<string, number>)[field] : undefined;
}
