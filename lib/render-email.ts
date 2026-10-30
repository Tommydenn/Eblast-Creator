// Templated marketing email renderer.
// Takes an ExtractedFlyer + Community → produces brand-themed HTML.
// One template, every community gets it with their own brand variables.

import type { Community } from "@/data/communities";
import { allCustomLines } from "@/lib/extracted-flyer";
import { orderedBlocks, orderedSections } from "@/lib/eblast-blocks";
import logoDimensions from "@/lib/logo-dimensions.json";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import {
  communityAddressLine,
  defaultGalleryLabel,
  defaultFooterName,
  DEFAULT_THANK_YOU_TEXT,
  DEFAULT_WEBSITE_BUTTON_LABEL,
  FIELD_FONT_SIZES,
} from "@/lib/eblast-defaults";

/**
 * How big to draw a community's logo in the header.
 *
 * The reference is the Amira wordmark, which renders 203px wide by 84px tall
 * and was judged right. Every other logo is drawn to that same width, so the
 * wordmarks line up across communities. A logo that would come out shorter
 * than the reference at that width — the very wide ones — is drawn at the
 * reference height instead, and one that would come out much taller — the
 * square marks — is capped. So each logo shares either the reference's width
 * or its height, whichever its shape allows.
 *
 * Sizing by equal area was tried first and read wrong: a detailed line drawing
 * such as Seven Hills has far less ink in its box than a dense wordmark, so at
 * the same area it looked smaller.
 *
 * Email clients need the size written on the tag — Outlook otherwise shows the
 * file at natural size, thousands of pixels wide — and the renderer also runs
 * in the browser, where it cannot read files. The sizes come from
 * lib/logo-dimensions.json, produced by scripts/measure-logos.mjs. A logo not
 * in that file falls back to the old fixed 88px, safe rather than broken.
 */
const LOGO_REFERENCE_WIDTH = 203; // the Amira wordmark's width at its reference height
const LOGO_REFERENCE_HEIGHT = 84; // never shorter than this
const LOGO_MAX_HEIGHT = 126; // square marks stop here
const LOGO_MAX_WIDTH = 300; // the header's content column

function logoRenderSize(url: string): { width: number; height: number } | null {
  const d = (logoDimensions as Record<string, { width: number; height: number }>)[url];
  if (!d || !d.width || !d.height) return null;
  const ratio = d.width / d.height;
  let width = LOGO_REFERENCE_WIDTH;
  let height = width / ratio;
  if (height < LOGO_REFERENCE_HEIGHT) { height = LOGO_REFERENCE_HEIGHT; width = height * ratio; }
  if (height > LOGO_MAX_HEIGHT) { height = LOGO_MAX_HEIGHT; width = height * ratio; }
  if (width > LOGO_MAX_WIDTH) { width = LOGO_MAX_WIDTH; height = width / ratio; }
  return { width: Math.round(width), height: Math.round(height) };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Body paragraph content may include editor-generated formatting (strong, em, span color,
// underline). Strip only dangerous constructs; leave safe inline HTML intact.
function renderBodyParagraph(p: string): string {
  const clean = p
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
  // A line with nothing on it takes up no space at all — measured, a break
  // with nothing after it adds 0px. A non-breaking space gives the empty line
  // something to hold, which is what makes it visible. Between two lines this
  // is identical to what came before: both measure 94.0px.
  return hasText(clean) ? clean : "&nbsp;";
}

// Inline field: sanitize rich HTML from single-line contentEditable fields.
// Strips div wrappers, dangerous elements, and event handlers — preserves
// inline formatting (bold, italic, color spans, font spans).
function renderInlineField(s: string): string {
  if (!s) return "";
  // A break at the end is kept: the editor already discards the spare one it
  // uses to park the caret, so anything left is a line someone asked for.
  const clean = s
    .replace(/^<div>([\s\S]*)<\/div>$/i, "$1")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .trim();
  // Same reason as renderBodyParagraph: the last line needs something on it or
  // it occupies no height and the break appears to have done nothing.
  return /<br\s*\/?>$/i.test(clean) ? `${clean}&nbsp;` : clean;
}

// Strip all HTML tags to get plain text — used for fields that feed into
// computed values (phone replacement, toUpperCase, etc.).
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

/**
 * Whether a field would actually show a reader anything.
 *
 * Tags, entities and whitespace do not count. A field the editor left as an
 * empty paragraph, a stray line break or a non-breaking space reads as empty
 * here, because that is how it looks in the email.
 */
function hasText(value?: string | string[] | null): boolean {
  if (value == null) return false;
  const html = Array.isArray(value) ? value.join("") : value;
  return (
    html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&zwnj;|&#8203;|&#xfeff;/gi, " ")
      .replace(/[\s\u00a0\u200b\ufeff]+/g, "").length > 0
  );
}

/**
 * Whether a block is hidden.
 *
 * Hiding is a display choice and keeps the words; clearing the box removes
 * the words. Both end up showing nothing, and they are kept apart so that
 * unhiding brings back what was written rather than an empty line.
 */
function isHidden(flyer: ExtractedFlyer, block: string): boolean {
  return (flyer.hiddenBlocks ?? []).includes(block);
}

/**
 * A line that can be removed simply by clearing its text.
 *
 * A field nobody has touched is undefined, and shows whatever the template
 * would otherwise supply. A field someone emptied is an empty string, and
 * renders nothing at all, so the line and the space it held both go rather
 * than leaving a blank paragraph propping a gap open.
 *
 * Hiding the block does the same to the output and nothing to the words, so
 * unhiding brings the line back exactly as it was written.
 */
function deletableLine(
  value: string | null | undefined,
  fallbackHtml: string | null,
  wrap: (innerHtml: string) => string,
  hidden = false,
): string {
  if (hidden) return "";
  if (value === undefined || value === null) return fallbackHtml ? wrap(fallbackHtml) : "";
  if (!hasText(value)) return "";
  return wrap(renderInlineField(value));
}

// Relative luminance (0 = black, 1 = white). Returns null for malformed hex.
function relLuminance(hex: string): number | null {
  const h = hex.replace("#", "");
  if (h.length < 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG-style contrast ratio between two colors (1 = identical, 21 = max).
function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  if (la === null || lb === null) return 1;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Returns "#ffffff" for dark backgrounds and "#1a1a1a" for light ones.
// Prevents text from being the same color as its background.
function pickTextColor(bgHex: string): string {
  const lum = relLuminance(bgHex);
  if (lum === null) return "#ffffff";
  return lum > 0.4 ? "#1a1a1a" : "#ffffff";
}

// Chroma proxy: spread of the RGB channels, 0..255. Near 0 = neutral gray,
// higher = a real color (warm beige/cream sit ~10-13; true grays sit ~2-7).
function chroma255(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 0;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

// Text color for a button. The button label should match the surrounding
// section's text color so the button reads as part of that section — we use it
// in every case where it stays legible on the button fill. We only override it
// when the section text and the fill are so close in tone that the label would
// be effectively invisible (e.g. white text on a near-white fill); in that one
// case we flip to a high-contrast color. The threshold is intentionally low so
// "matches the section text" wins for all normal mid-tone fills (a dark-ish
// brand color with white text reads fine even at modest contrast for large,
// bold, uppercase button labels) — it is NOT a strict WCAG gate.
const BUTTON_TEXT_MIN_CONTRAST = 1.35;
function buttonTextColor(sectionTextHex: string, buttonBgHex: string): string {
  return contrastRatio(sectionTextHex, buttonBgHex) >= BUTTON_TEXT_MIN_CONTRAST
    ? sectionTextHex
    : pickTextColor(buttonBgHex);
}

/**
 * Warm cream used for the hero address line, and — since they're meant to read
 * as the same tier of supporting detail — for the RSVP label in both the hero
 * and the CTA. Shared as a constant so the RSVP label can't drift away from
 * the address again.
 */

const HERO_ADDRESS_COLOR = "#E8DDC4";

/**
 * Sizes that used to be chosen from how much text a field contained.
 *
 * They shrank as you typed and grew as you deleted, which meant the size was
 * never yours and the toolbar's number was a guess — the toolbar reads a fixed
 * list, so on a short subheadline it showed 40 while the email rendered 48, and
 * nudging down "one point" dropped it nine. One fixed size per field fixes both
 * halves of that: nothing moves on its own, and the number in the toolbar is
 * the truth.
 *
 * They come from lib/eblast-defaults.ts, which the editor's toolbar reads too,
 * so the number shown while editing is the number that renders. Long text
 * wraps instead of shrinking, which the pinned 600px shell and the wrapping
 * rules already handle.
 */
const SCRIPT_SUBHEADLINE_SIZE = FIELD_FONT_SIZES.scriptSubheadline;
const CTA_DATE_SIZE = FIELD_FONT_SIZES.ctaEventDate;
const CALL_BUTTON_SIZE = FIELD_FONT_SIZES.ctaButtonLabel;

/**
 * How round the call and website buttons are.
 *
 * Enough to soften the corner, not enough to read as a pill. Outlook on
 * Windows ignores border-radius and squares them off, which is the same
 * button and no worse than it was.
 */
const BUTTON_RADIUS = 6;

/**
 * Darkest color in a community's brand palette — used for the footer
 * salesperson emails so they read as text rather than as a bright accent link.
 *
 * Considers the palette's text-capable colors only. `background` is excluded
 * deliberately: it's a surface color, and on brands with a dark surface it
 * would win here and make the address effectively invisible against the
 * footer. Falls back to a near-black if the palette has nothing usable.
 */
function darkestBrandColor(brand: Community["brand"]): string {
  const candidates = [
    brand.primary,
    brand.accent,
    (brand as any).secondary as string | undefined,
    ...(((brand as any).supporting as string[] | undefined) ?? []),
  ].filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c.trim()));

  let best: string | null = null;
  let bestLum = Infinity;
  for (const c of candidates) {
    const lum = relLuminance(c);
    if (lum === null) continue;
    if (lum < bestLum) { bestLum = lum; best = c; }
  }
  return best ?? "#2D2926";
}

/**
 * Normalize a user-typed photo link into an href we're willing to emit.
 *
 * Deliberately allow-list only: http(s)/mailto/tel, plus bare domains typed
 * without a scheme ("example.com/tour"). Anything else — most importantly
 * javascript: — returns null and the photo simply renders unlinked, so a
 * pasted value can never become an executable href in a recipient's inbox.
 */
export function normalizePhotoLink(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(v)) return `https://${v}`;
  return null;
}

/**
 * Tag a photo with the attributes the live preview uses to identify it, and
 * wrap it in its click-through link when one is set.
 *
 * data-linkfield / data-linkindex are present whether or not a link exists —
 * the preview needs them to know which photo was clicked so a link can be
 * added in the first place (see PreviewPanel's link-click handling).
 */
function linkedImage(
  imgTag: string,
  href: string | undefined,
  field: "heroImageLink" | "secondaryImageLink" | "galleryImageLinks",
  index?: number,
): string {
  const tagged = imgTag.replace(
    /^<img\b/i,
    `<img data-linkfield="${field}"${index === undefined ? "" : ` data-linkindex="${index}"`}`,
  );
  const url = normalizePhotoLink(href);
  if (!url) return tagged;
  // display:block keeps the anchor from adding inline-element descender space
  // under the photo in Outlook/Gmail.
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:block; text-decoration:none; border:0;">${tagged}</a>`;
}

/**
 * The date and the time, on their own lines, as two separate fields.
 *
 * Date and time stay distinct data-field spans, so the drafter still extracts
 * them separately, the sidebar keeps its own Event Date and Event Time inputs,
 * and each can be formatted on its own. Combining them is purely visual.
 *
 * They were briefly split into two fixed half-width columns to stop one from
 * shoving the other off the page. That turned out to be treating a symptom:
 * the real cause was the preview clipping a 600px email in a narrower column
 * (see PreviewPanel), plus an auto-layout shell that any wide row could
 * stretch. With the shell pinned to 600px and wrapping enabled, a single
 * centred line wraps safely on its own and reads better than a rigid 50/50
 * split, which broke awkwardly whenever one side was much longer.
 */
function dateTimeRow(opts: {
  dateHtml: string;
  dateField: string;
  timeHtml: string;
  timeField: string;
  fontFamily: string;
  fontSize: number;
  /** Alignment chosen for either half of the line, already resolved. */
  align?: string;
  extraStyle: string;
  marginBottom: number;
}): string {
  const {
    dateHtml, dateField, timeHtml, timeField,
    fontFamily, fontSize, extraStyle, marginBottom, align,
  } = opts;

  const base = `${align ? `text-align: ${align}; ` : ""}font-family: ${fontFamily}; font-size: ${fontSize}px; color: #FFFFFF; ${extraStyle}`;
  // The time sits under the date rather than beside it, so there is no
  // separator between them any more — the line break does that job, and a
  // dot floating mid-line was doing it worse. The date's own margin only has
  // to clear the time below it; the time carries the gap to whatever follows.
  const dateStyle = `${base} margin: 0 0 ${timeHtml ? 4 : marginBottom}px 0;`;
  const timeStyle = `${base} margin: 0 0 ${marginBottom}px 0;`;

  // Each line must hold together, so both carry the no-wrap class.
  // Times written before the date and time were split apart begin with the
  // separator that used to sit between them. On its own line that dot has
  // nothing to separate and reads as a typo, so it comes off on the way out.
  // Only here: the stored value is left alone, because a draft that was
  // already approved keeps the text it was approved with.
  const timeWithoutSeparator = timeHtml.replace(
    /^((?:<[^>]+>|s|&nbsp;)*)[·•]s*(?:&nbsp;)?s*/i,
    "$1",
  );

  const dateLine = `<p class="glm-nowrap" style="${dateStyle}"><span data-field="${dateField}" data-deletefield="block:${dateField}" style="color:#FFFFFF; text-decoration:none;">${dateHtml}</span></p>`;
  const timeLine = timeHtml
    ? `<p class="glm-nowrap" style="${timeStyle}"><span data-field="${timeField}" data-deletefield="block:${timeField}" style="color:#FFFFFF; text-decoration:none;">${timeWithoutSeparator}</span></p>`
    : "";
  return `${dateLine}${timeLine}`;
}

export interface RenderOptions {
  /** Hero image URL or data URI. If omitted, the hero block has no photo — just brand color. */
  heroImageUrl?: string;
  /** Secondary inline image, placed between body paragraphs. */
  secondaryImageUrl?: string;
  /** Additional images for the gallery section near the bottom. Up to 4 used. */
  galleryImageUrls?: string[];
  /**
   * Draws a note in place of an email with every section hidden.
   *
   * The editor only. Hiding the last section leaves a blank white page,
   * which reads as something broken rather than as a thing you just did, so
   * the preview says so and points at the way back. Nothing is added to a
   * real send: an email with everything hidden is genuinely empty.
   */
  forPreview?: boolean;
}

export function buildEblastHtml(
  flyer: ExtractedFlyer,
  community: Community,
  options: RenderOptions = {},
): string {
  const { brand } = community;
  const heroImg = options.heroImageUrl;
  const secondaryImg = options.secondaryImageUrl;
  const galleryImgs = (options.galleryImageUrls ?? []).slice(0, 4);

  /**
   * Whether a block shows: it has words, and nobody has hidden it.
   *
   * Every line in the email asks this, so hiding one is the same decision
   * everywhere rather than a flag per field.
   */
  const shows = (block: string, value: string | string[] | null | undefined) =>
    hasText(value) && !isHidden(flyer, block);

  /**
   * The alignment someone chose for a field, as a style fragment.
   *
   * Empty unless they chose one, so every section keeps the alignment the
   * template gives it and only a deliberate choice overrides that.
   */
  const alignStyleFor = (field: string) => {
    const value = flyer.textAlign?.[field];
    return value ? `text-align: ${value}; ` : "";
  };
  /**
   * The lines someone added in a given gap.
   *
   * Each is a field in its own right, so it formats and aligns like any
   * other. The colour comes from the section, because the hero reads white
   * on the brand colour while everything below it reads dark on white.
   *
   * Deliberately quiet — smaller and a touch lighter than the lines
   * the template puts there — so adding one does not compete with them.
   */
  const linesAfter = (slot: string, color = "#4A4A4A") =>
    allCustomLines(flyer)
      .filter((line) => line.after === slot)
      .map((line) => {
        const field = `footerCustomLine:${line.id}`;
        return `<p data-field="${field}" data-deletefield="${field}" style="${alignStyleFor(field)}font-family: ${fontBody}; font-size: 15px; color: ${color}; margin: 0 0 6px 0;">${hasText(line.text) ? renderInlineField(line.text) : "&nbsp;"}</p>`;
      })
      .join("");

  /** Wrap something inline, like the footer's email link, so it can be aligned. */
  const alignWrap = (field: string, html: string) => {
    const value = flyer.textAlign?.[field];
    return value ? `<div style="text-align: ${value};">${html}</div>` : html;
  };

  const showEventDate = !!flyer.eventDate && !isHidden(flyer, "eventDate");
  const showEventTime = !!flyer.eventTime && !isHidden(flyer, "eventTime");

  const addressLine = flyer.heroAddress ?? communityAddressLine(community);

  /**
   * The bordered band holds the date, the time and the address, and it has
   * always needed a date or a time to appear at all — so on an eblast with no
   * event, the address had nowhere to print and no way to be asked for.
   *
   * It draws for the address on its own when the draft has explicitly asked
   * for it, which is a thing only the editor's switch writes. No draft made
   * before that switch existed carries it, so nothing already sent or waiting
   * renders any differently than it did.
   */
  const askedForAddress =
    (flyer.shownBlocks ?? []).includes("heroAddress") &&
    !isHidden(flyer, "heroAddress") &&
    hasText(addressLine);
  const hasEventDateLine = showEventDate || showEventTime || askedForAddress;

  // RSVP label from the flyer ("RSVP Required" / "RSVP Requested")
  const rsvpLabel = flyer.rsvpLabel?.trim() ?? "";
  // CTA/footer section may have independent overrides; fall back to hero values
  const ctaRsvpLabel = (flyer.ctaRsvpLabel ?? flyer.rsvpLabel)?.trim() ?? "";
  const ctaDate = flyer.ctaEventDate ?? flyer.eventDate;
  const ctaTime = flyer.ctaEventTime ?? flyer.eventTime;
  const showCtaDate = !!ctaDate && !isHidden(flyer, "ctaEventDate");
  const showCtaTime = !!ctaTime && !isHidden(flyer, "ctaEventTime");
  const hasCtaDateLine = showCtaDate || showCtaTime;
  /** 600px shell minus a section's 36px side padding. */
  const CONTENT_WIDTH = 600 - 36 * 2;

  // The brand font, exactly as the Community page has it, with nothing added.
  //
  // A backup was tried here and taken out again on request: naming one means
  // every recipient without the brand font gets the SAME substitute we picked,
  // where before each client chose its own. The preference is for the
  // recipient s own system to choose, so nothing is appended.
  const fontHeadline = brand.fontHeadline;
  const fontBody = brand.fontBody;

  // Header color rule: the header must ALWAYS be a light, non-gray surface —
  // white (matching the story section's white body), or the community's own
  // warm/beige surface if it has one. The only exception is a genuinely DARK
  // brand surface, which gets a dark header AND forces a light/knockout logo.
  //
  // Classify brand.background three ways: dark vs light, and (within light)
  // gray vs warm/beige. brand.background is used directly only when it's a warm
  // light surface; gray surfaces fall back to white.
  const bgLum = relLuminance(brand.background) ?? 1; // treat malformed as light
  const bgChroma = chroma255(brand.background);
  // Brand grays sit at chroma <=10 (cool grays #B1B3B6=5/#C1C6C8=7/#DDDDDB=2 and
  // the warm "Stone" #DBD6D1=10); real cream surfaces sit higher (#F1ECE6=11,
  // #FBF7EE=13). 10 cleanly separates gray-ish surfaces from true beige/cream.
  const GRAY_CHROMA_MAX = 10;
  const surfaceIsLight = bgLum > 0.4;
  const surfaceIsGray = surfaceIsLight && bgChroma <= GRAY_CHROMA_MAX;

  // A dark header is only allowed when the brand surface is genuinely dark.
  const isDarkHeader = !surfaceIsLight;
  const defaultHeaderBg = isDarkHeader
    ? brand.background // genuinely dark brand surface -> dark header
    : surfaceIsGray
      ? "#ffffff" // gray surface -> force white (never a gray header)
      : brand.background; // warm/beige light surface -> keep it
  // Manual per-draft override, set from the editor's section-color picker.
  const headerBg = flyer.headerBgColor ?? defaultHeaderBg;
  const headerStripe = brand.accent;

  // The three sections that sit on the shell's white. Each falls back to
  // that same white, so an eblast with nothing chosen looks exactly as it
  // always has.
  const SHELL_WHITE = "#ffffff";
  const storyBg = flyer.storyBgColor ?? SHELL_WHITE;
  const secondaryImageBg = flyer.secondaryImageBgColor ?? SHELL_WHITE;
  const galleryLabelBg = flyer.galleryLabelBgColor ?? SHELL_WHITE;
  const galleryBg = flyer.galleryBgColor ?? SHELL_WHITE;

  // Logo follows the HEADER, not the raw surface. On a light header use the
  // light/primary logo; on a dark header require a dark/knockout (or "any")
  // logo — if none exists, fall through to the white text wordmark below.
  const lightLogo =
    community.logos.find(l => (l.onColor === "light" || l.onColor === "any") && l.variant === "primary") ??
    community.logos.find(l => l.onColor === "light" || l.onColor === "any") ??
    community.logos[0];
  const darkLogo =
    community.logos.find(l => (l.onColor === "dark" || l.onColor === "any") && (l.variant === "knockout" || l.variant === "primary")) ??
    community.logos.find(l => l.onColor === "dark" || l.onColor === "any");
  const chosenLogo = isDarkHeader ? (darkLogo ?? null) : lightLogo;

  // Text fallback when no logo asset is available.
  const locationSuffix = community.displayName.replace(community.shortName, "").trim();
  const textFallback = `<span style="font-family: ${fontHeadline}; font-size: 28px; color: ${isDarkHeader ? "#ffffff" : brand.primary}; letter-spacing: 1px; display:block;">${escapeHtml(community.shortName)}</span>${locationSuffix ? `<span style="font-family: ${fontBody}; font-size: 15px; letter-spacing: 3px; color: ${isDarkHeader ? "#cccccc" : brand.accent}; text-transform: uppercase; display:block; margin-top:5px;">${escapeHtml(locationSuffix)}</span>` : ""}`;

  // Keep logo URLs as-is. Relative paths (e.g. /logos/slug/primary.png) are
  // intentionally left relative so callers can embed them as base64 data URIs
  // via inlineRelativeImages — this works in srcDoc iframes, approval emails,
  // and any other context without depending on env-var URL construction.
  const logoSrc = chosenLogo?.url ?? null;
  const logoContent = logoSrc
    ? (() => {
        const size = logoRenderSize(logoSrc);
        return size
          ? `<img src="${logoSrc}" alt="${escapeHtml(community.displayName)}" width="${size.width}" height="${size.height}" style="display:block; width:${size.width}px; height:${size.height}px; border:0; margin:0 auto;">`
          : `<img src="${logoSrc}" alt="${escapeHtml(community.displayName)}" height="88" style="display:block; height:88px; width:auto; max-width:300px; border:0; margin:0 auto;">`;
      })()
    : textFallback;

  // Always use the community's CallRail tracking number for the CTA phone.
  const ctaPhone = community.trackingPhone;
  const ctaHref = ctaPhone
    ? `tel:+1${ctaPhone.replace(/\D/g, "")}`
    : flyer.ctaButtonHref;
  // Use the AI-generated button label (context-aware action phrase with phone).
  // If a tracking phone is configured, replace any phone number in the label
  // with the tracking phone formatted as XXX.XXX.XXXX.
  const formattedTracking = ctaPhone
    ? ctaPhone.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1.$2.$3")
    : null;
  const PHONE_RE = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
  // The button label is rich HTML (bold/color/font/size all render). Reconcile
  // the phone number to the community tracking line, then render it inline so
  // formatting survives. Uppercasing is done in CSS (text-transform), and the
  // plain-text form is used only for width/length sizing.
  //
  // Hero and the bottom "Call to Action" section each have their OWN call
  // button field (ctaButtonLabel / finalCtaButtonLabel) — they generate with
  // the same text by default (finalCtaButtonLabel falls back to ctaButtonLabel
  // until a user explicitly edits it) but are independently editable/formattable
  // from that point on, same pattern as ctaEventDate/ctaRsvpLabel overriding
  // eventDate/rsvpLabel. Each needs its own size/width/letter-spacing since
  // their text can diverge in length once edited separately.
  function reconcileCtaLabel(raw: string | undefined) {
    const rawLabelHtml = raw && raw.trim()
      ? raw
      : (formattedTracking ? `Call ${formattedTracking}` : "Call Us");
    const reconciledLabelHtml = formattedTracking
      ? (PHONE_RE.test(stripHtml(rawLabelHtml))
          ? rawLabelHtml.replace(PHONE_RE, formattedTracking)
          : `${rawLabelHtml} ${formattedTracking}`)
      : rawLabelHtml;
    const displayText = stripHtml(reconciledLabelHtml);
    const displayHtml = renderInlineField(reconciledLabelHtml);
    const fontSize = CALL_BUTTON_SIZE;
    const letterSpacing = "2.5px";
    // Explicit pixel width for CTA button tables. Outlook/Word auto-sizes tables
    // with no width attribute, and white-space:nowrap causes the cell to grow
    // wider on each forward/reply cycle. A fixed width prevents this accumulation.
    const width = displayText.length <= 24 ? 240 : displayText.length <= 36 ? 300 : 340;
    return { displayText, displayHtml, fontSize, letterSpacing, width };
  }

  // Manual per-draft background overrides, set from the editor's section-color
  // picker. Each defaults to the exact same brand token used today, so a draft
  // that never touches these renders pixel-identical to before this feature.
  const heroBg = flyer.heroBgColor ?? brand.primary;
  const finalCtaBg = flyer.finalCtaBgColor ?? brand.accent;
  const footerBg = flyer.footerBgColor ?? "#FFFFFF";
  // Same idea for the three buttons — each independently overridable now
  // (previously they shared brand.accent/brand.primary directly).
  const ctaButtonBg = flyer.ctaButtonBgColor ?? brand.accent;
  const finalCtaButtonBg = flyer.finalCtaButtonBgColor ?? brand.primary;
  const footerButtonBg = flyer.footerButtonBgColor ?? brand.primary;

  const heroCta = reconcileCtaLabel(flyer.ctaButtonLabel);
  const finalCtaLabel = reconcileCtaLabel(flyer.finalCtaButtonLabel ?? flyer.ctaButtonLabel);
  // Legacy aliases kept so the hero markup below (unchanged) still reads correctly.
  const ctaDisplayHtml = heroCta.displayHtml;
  const ctaBtnFontSize = heroCta.fontSize;
  const ctaBtnLetterSpacing = heroCta.letterSpacing;
  const ctaBtnWidth = heroCta.width;

  // Component fragments — kept as inline HTML because email clients reward
  // redundancy and table-based layouts. CSS variables/classes don't survive Outlook.
  // data-section and data-field attributes are used by the preview's interactive
  // script for hover labels and inline text editing; email clients ignore them.

  const header = flyer.headerSectionHidden ? "" : `
  <tr data-section="Header" data-deletefield="headerSectionHidden">
    <td class="glm-bg-header" bgcolor="${headerBg}" style="padding: 26px 36px; background:${headerBg}; border-top: 4px solid ${headerStripe}; text-align:center;" align="center" data-bgfield="headerBgColor">
      ${logoContent}
    </td>
  </tr>`;

  // The hero's blocks, by name. They all share one table cell, so drawing
  // them in a different sequence is all rearranging them takes.
  const heroBlocks: Record<string, string> = {
    rsvpLabel: `${shows("rsvpLabel", rsvpLabel) ? `<p data-field="rsvpLabel" data-deletefield="block:rsvpLabel" style="${alignStyleFor("rsvpLabel")}font-family: ${fontBody}; font-size: ${FIELD_FONT_SIZES.rsvpLabel}px; font-weight: 700; letter-spacing: 4px; color: ${HERO_ADDRESS_COLOR}; text-transform: uppercase; margin: 0 0 14px 0;">${renderInlineField(rsvpLabel)}</p>` : ""}`,
    headline: `${shows("headline", flyer.headline) ? `<p data-field="headline" data-deletefield="block:headline" class="glm-nowrap" style="${alignStyleFor("headline")}font-family: ${fontHeadline}; font-size: ${FIELD_FONT_SIZES.headline}px; line-height:1.1; color: #FFFFFF; letter-spacing: 0.5px; margin: 0 0 6px 0;">${renderInlineField(flyer.headline)}</p>` : ""}`,
    scriptSubheadline: `${shows("scriptSubheadline", flyer.scriptSubheadline) ? `<p data-field="scriptSubheadline" data-deletefield="block:scriptSubheadline" class="glm-nowrap" style="${alignStyleFor("scriptSubheadline")}font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: ${SCRIPT_SUBHEADLINE_SIZE}px; color: #F0E2C0; line-height: 1.1; margin: 0 auto 18px auto;">${renderInlineField(flyer.scriptSubheadline!)}</p>` : ""}`,
    eventDateTime: `${hasEventDateLine ? `
            <!-- This table had no width at all, so it auto-sized to its text.
                 A date line longer than the column made it wider than the
                 600px frame, which is what stretched the email (and, once the
                 frame was pinned, spilled off the edge instead). Constrained
                 to the hero's content width so the text wraps inside it. -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${CONTENT_WIDTH}" style="width: ${CONTENT_WIDTH}px; margin: 12px auto 22px auto; max-width: ${CONTENT_WIDTH}px; table-layout: fixed;">
              <tr>
                <!-- Vertical padding matches the header's 22px, and there is no
                     side padding so the date, time and address line up with the
                     header rather than sitting 26px further in. -->
                <td style="border-top: 1px solid #ffffff; border-bottom: 1px solid #ffffff; padding: 22px 0; max-width: ${CONTENT_WIDTH}px;" align="center">
                  ${dateTimeRow({
                    dateHtml: showEventDate ? renderInlineField(flyer.eventDate ?? "") : "",
                    dateField: "eventDate",
                    timeHtml: showEventTime ? renderInlineField(flyer.eventTime!) : "",
                    timeField: "eventTime",
                    fontFamily: fontHeadline,
                    fontSize: FIELD_FONT_SIZES.eventDate,
                    align: flyer.textAlign?.eventDate ?? flyer.textAlign?.eventTime,
                    extraStyle: "letter-spacing: 1px;",
                    // No address beneath it means no space needed under the date.
                    marginBottom: shows("heroAddress", addressLine) ? 8 : 0,
                  })}
                  ${linesAfter("eventTime", "#F0E2C0")}
                  ${shows("heroAddress", addressLine) ? `<p data-field="heroAddress" data-deletefield="block:heroAddress" class="glm-nowrap" style="${alignStyleFor("heroAddress")}font-family: ${fontBody}; font-size: ${FIELD_FONT_SIZES.heroAddress}px; letter-spacing: 1px; color: ${HERO_ADDRESS_COLOR}; margin: 0;"><span style="color: ${HERO_ADDRESS_COLOR}; text-decoration: none;">${flyer.heroAddress ? renderInlineField(flyer.heroAddress) : escapeHtml(addressLine)}</span></p>` : ""}
                </td>
              </tr>
            </table>` : ""}`,
    ctaButtonLabel: `${flyer.ctaButtonHidden ? "" : `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${ctaBtnWidth}">
              <tr>
                <td width="${ctaBtnWidth}" class="glm-bg-herobtn" bgcolor="${ctaButtonBg}" align="center" style="background:${ctaButtonBg}; border-radius:${BUTTON_RADIUS}px;" data-bgfield="ctaButtonBgColor" data-deletefield="ctaButtonHidden">
                  <a href="${escapeHtml(ctaHref)}" style="display:block; padding:16px 36px; text-align:center; color:${buttonTextColor("#FFFFFF", ctaButtonBg)}; text-decoration:none; font-family:${fontBody}; font-size:${ctaBtnFontSize}px; letter-spacing:${ctaBtnLetterSpacing}; text-transform:uppercase; font-weight:700; line-height:1.4;">${ctaDisplayHtml}</a>
                </td>
              </tr>
            </table>`}`,
  };
  const heroPieces = () =>
    orderedBlocks(flyer, "Hero")
      .map((b) => `${heroBlocks[b.name] ?? ""}\n            ${linesAfter(b.slot, "#F0E2C0")}`)
      .join("\n            ");
  const hero = flyer.heroSectionHidden ? "" : `
  <tr data-section="Hero" data-deletefield="heroSectionHidden">
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${heroImg ? `
        <tr>
          <td style="padding: 0; line-height: 0; font-size: 0; overflow: hidden;">
            ${linkedImage(`<img src="${heroImg}" data-img-label="Hero image" width="600" height="340" alt="${escapeHtml(flyer.heroImageAlt)}" style="display:block; width:600px; max-width:100%; height:auto; border:0;">`, flyer.heroImageLink, "heroImageLink")}
          </td>
        </tr>` : ""}
        <tr>
          <td class="glm-bg-hero" bgcolor="${heroBg}" style="background:${heroBg}; padding: ${heroImg ? "36px" : "60px"} 36px 40px 36px;" align="center" data-bgfield="heroBgColor">
            ${linesAfter("hero:start", "#F0E2C0")}
            ${heroPieces()}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  // Each of these lines disappears when its text is cleared, and the row that
  // held it goes with it. An empty row would otherwise keep its 44px of top
  // padding and leave a gap exactly where the text used to be. When the
  // eyebrow and title are both gone, the body row takes over that top padding
  // so the section still sits properly below the one before it.
  const storyEyebrowHtml = shows("storyEyebrow", flyer.storyEyebrow) ? renderInlineField(flyer.storyEyebrow) : "";
  const storyTitleHtml = shows("storyScriptTitle", flyer.storyScriptTitle) ? renderInlineField(flyer.storyScriptTitle!) : "";
  const storyStartLines = linesAfter("story:start");
  const storyEyebrowLines = linesAfter("storyEyebrow");
  const storyTitleLines = linesAfter("storyScriptTitle");
  const storyHeadShown = !!(
    storyEyebrowHtml || storyTitleHtml || storyStartLines || storyEyebrowLines || storyTitleLines
  );
  // The body is a list of lines, rendered literally: one line break between
  // each, so a blank entry is a blank line and Enter in the editor moves down
  // exactly one line. Joining with two breaks instead meant every Enter opened
  // a blank line the writer never asked for. Only an entirely empty body drops
  // the row.
  const storyBodyHtml = shows("bodyParagraphs", flyer.bodyParagraphs)
    ? flyer.bodyParagraphs.map((p) => renderBodyParagraph(p)).join("<br>")
    : "";

  // Whether the gallery label follows body text or a photo in the same white
  // block rather than opening a fresh one.
  //
  // The label reserved 44px above itself for the case where it opens the
  // white area. Added to the 28px the story text and the secondary photo
  // already leave below them, that put 72px between the copy and the label —
  // roughly twice the gap anywhere else in the email, and it read as a hole.
  const storyBodyLines = linesAfter("bodyParagraphs");
  const storyBodyShown = !flyer.storySectionHidden && !!(storyBodyHtml || storyBodyLines);
  const secondaryShown = !!secondaryImg && !flyer.secondaryImageSectionHidden;
  const galleryFollowsContent = storyBodyShown || secondaryShown;

  // Story's heading, by name — the eyebrow and the title share a
  // table cell, so drawing them in a different sequence is all it takes.
  // The body copy has a cell of its own, carrying the padding that sets the
  // section off from the one above, so it stays below them.
  const storyHeadBlocks: Record<string, string> = {
    storyEyebrow: `${storyEyebrowHtml ? `<p data-field="storyEyebrow" data-deletefield="block:storyEyebrow" class="glm-nowrap" style="${alignStyleFor("storyEyebrow")}font-family: ${fontBody}; font-size: ${FIELD_FONT_SIZES.storyEyebrow}px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0 0 10px 0;">${storyEyebrowHtml}</p>` : ""}`,
    storyScriptTitle: `${storyTitleHtml ? `<p data-field="storyScriptTitle" data-deletefield="block:storyScriptTitle" class="glm-nowrap" style="${alignStyleFor("storyScriptTitle")}font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: ${FIELD_FONT_SIZES.storyScriptTitle}px; color: ${brand.accent}; line-height: 1.1; margin: 0 0 10px 0;">${storyTitleHtml}</p>` : ""}`,
  };
  const storyHeadPieces = () =>
    orderedBlocks(flyer, "Story")
      .map((b) => `${storyHeadBlocks[b.name] ?? ""}\n      ${linesAfter(b.slot)}`)
      .join("\n      ");
  const story = `
  ${flyer.storySectionHidden ? "" : `
  ${storyHeadShown ? `
  <tr data-section="Story" data-deletefield="storySectionHidden">
    <td class="glm-bg-story" bgcolor="${storyBg}" style="background:${storyBg}; padding: 44px 36px 12px 36px;" data-bgfield="storyBgColor">
      ${storyStartLines}
      ${storyHeadPieces()}
    </td>
  </tr>` : ""}
  ${(storyBodyHtml || storyBodyLines) ? `
  <tr data-section="Story" data-deletefield="storySectionHidden">
    <td class="glm-bg-story" bgcolor="${storyBg}" style="background:${storyBg}; padding: ${storyHeadShown ? "0" : "44px"} 36px 28px 36px;" data-bgfield="storyBgColor">
      <p data-field="bodyParagraphs" data-deletefield="block:bodyParagraphs" style="${alignStyleFor("bodyParagraphs")}font-family: ${fontBody}; font-size: 19px; line-height: 1.65; color: #3A3A3A; margin: 0;">${storyBodyHtml}</p>
      ${linesAfter("bodyParagraphs")}
    </td>
  </tr>` : ""}`}`;

  const secondary = (secondaryImg && !flyer.secondaryImageSectionHidden) ? `
  <tr data-section="Secondary Image" data-deletefield="secondaryImageSectionHidden">
    <td class="glm-bg-secondary" bgcolor="${secondaryImageBg}" style="background:${secondaryImageBg}; padding: 0 36px 28px 36px;" data-bgfield="secondaryImageBgColor">
      ${linkedImage(`<img src="${secondaryImg}" data-img-label="Secondary image" width="528" height="300" alt="${escapeHtml(flyer.secondaryImageAlt ?? "")}" style="display:block; width:528px; max-width:100%; height:auto; border:0;">`, flyer.secondaryImageLink, "secondaryImageLink")}
    </td>
  </tr>` : "";

  // Gallery: 2- or 4-up grid of additional photos extracted from the flyer.
  // Sits between the story and the final CTA.
  // Requires at least 2 images — a single orphaned photo looks unfinished.
  const gallery = (() => {
    if (flyer.gallerySectionHidden) return "";
    if (galleryImgs.length === 0) return "";

    // 1 image → full-width; 2 images → 2-up; 3 → 3-up; 4+ → 2×2 grid.
    const cols = galleryImgs.length === 1 ? 1 : galleryImgs.length === 3 ? 3 : 2;
    const tileW = cols === 1 ? 528 : Math.floor(528 / cols) - 12;
    const tileH = Math.round(tileW * 3 / 4); // 4:3 aspect ratio throughout
    // Each tile carries a stable 1-based name ("Gallery image N") that matches
    // the hover label in the preview and the refine manifest, so users can call
    // out a specific gallery photo by name.
    const tiles = galleryImgs.map((src, i) => ({ src, label: `Gallery image ${i + 1}`, index: i }));
    const rows: Array<Array<{ src: string; label: string; index: number }>> = [];
    for (let i = 0; i < tiles.length; i += cols) {
      rows.push(tiles.slice(i, i + cols));
    }

    // Never set shows the default label; cleared shows nothing and drops the
    // row, handing its top padding to the photos below.
    const galleryLabelHtml =
      flyer.galleryLabel === undefined || flyer.galleryLabel === null
        ? escapeHtml(defaultGalleryLabel(community))
        : shows("galleryLabel", flyer.galleryLabel)
          ? renderInlineField(flyer.galleryLabel)
          : "";

    return `
  ${galleryLabelHtml ? `
  <tr data-section="Photo Gallery" data-deletefield="gallerySectionHidden">
    <td class="glm-bg-gallerylabel" bgcolor="${galleryLabelBg}" style="background:${galleryLabelBg}; padding: ${galleryFollowsContent ? "8px" : "44px"} 36px 12px 36px;" align="center" data-bgfield="galleryLabelBgColor">
      <p data-field="galleryLabel" data-deletefield="block:galleryLabel" style="${alignStyleFor("galleryLabel")}font-family: ${fontBody}; font-size: ${FIELD_FONT_SIZES.galleryLabel}px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0;">${galleryLabelHtml}</p>
      ${linesAfter("galleryLabel")}
    </td>
  </tr>` : ""}
  <tr data-section="Photo Gallery" data-deletefield="gallerySectionHidden">
    <td class="glm-bg-gallery" bgcolor="${galleryBg}" style="background:${galleryBg}; padding: ${galleryLabelHtml ? "16px" : "44px"} 36px 32px 36px;" data-bgfield="galleryBgColor">
      <table role="presentation" cellpadding="0" cellspacing="6" border="0" width="100%" style="border-collapse:separate; border-spacing:6px;">
        ${rows
          .map(
            (row) => `
        <tr>
          ${row
            .map(
              (tile) => `
          <td valign="top" width="${tileW}" style="padding:0; overflow:hidden;">
            ${linkedImage(`<img src="${tile.src}" data-img-label="${tile.label}" width="${tileW}" height="${tileH}" alt="${escapeHtml(community.displayName)}" style="display:block; width:${tileW}px; height:${tileH}px; border:0;">`, (flyer.galleryImageLinks ?? [])[tile.index], "galleryImageLinks", tile.index)}
          </td>`,
            )
            .join("")}
        </tr>`,
          )
          .join("")}
      </table>
    </td>
  </tr>`;
  })();

  // Call to Action's blocks, by name. They share one table cell, so drawing
  // them in a different sequence is all rearranging them takes.
  const finalCtaBlocks: Record<string, string> = {
    ctaRsvpLabel: `${shows("ctaRsvpLabel", ctaRsvpLabel) ? `<p data-field="ctaRsvpLabel" data-deletefield="block:ctaRsvpLabel" style="font-family: ${fontBody}; font-size: ${FIELD_FONT_SIZES.ctaRsvpLabel}px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #FFFFFF; margin: 0 0 14px 0;">${renderInlineField(ctaRsvpLabel)}</p>` : ""}`,
    ctaEventDateTime: `${hasCtaDateLine ? dateTimeRow({
              dateHtml: showCtaDate ? renderInlineField(ctaDate ?? "") : "",
              dateField: "ctaEventDate",
              timeHtml: showCtaTime ? renderInlineField(ctaTime!) : "",
              timeField: "ctaEventTime",
              fontFamily: fontHeadline,
              fontSize: CTA_DATE_SIZE,
              extraStyle: "line-height: 1.2;",
              marginBottom: 22,
            }) : ""}`,
    finalCtaButtonLabel: `${flyer.finalCtaButtonHidden ? "" : `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${finalCtaLabel.width}">
              <tr>
                <td width="${finalCtaLabel.width}" class="glm-bg-finalctabtn" bgcolor="${finalCtaButtonBg}" align="center" style="background:${finalCtaButtonBg}; border-radius:${BUTTON_RADIUS}px;" data-bgfield="finalCtaButtonBgColor" data-deletefield="finalCtaButtonHidden">
                  <a href="${escapeHtml(ctaHref)}" style="display:block; padding:16px 36px; text-align:center; color:${buttonTextColor("#FFFFFF", finalCtaButtonBg)}; text-decoration:none; font-family:${fontBody}; font-size:${finalCtaLabel.fontSize}px; letter-spacing:${finalCtaLabel.letterSpacing}; text-transform:uppercase; font-weight:700; line-height:1.4;">${finalCtaLabel.displayHtml}</a>
                </td>
              </tr>
            </table>`}`,
  };
  const finalCtaPieces = () =>
    orderedBlocks(flyer, "Call to Action")
      .map((b) => `${finalCtaBlocks[b.name] ?? ""}\n            ${linesAfter(b.slot, "#FFFFFF")}`)
      .join("\n            ");
  const finalCta = flyer.finalCtaSectionHidden ? "" : `
  <tr data-section="Call to Action" data-deletefield="finalCtaSectionHidden">
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="glm-bg-finalcta" bgcolor="${finalCtaBg}" style="background:${finalCtaBg};" data-bgfield="finalCtaBgColor">
        <tr>
          <td style="padding: 40px 36px;" align="center">
            ${linesAfter("cta:start", "#FFFFFF")}
            ${finalCtaPieces()}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const websiteSource = flyer.footerWebsiteUrl || community.websiteUrl || "";
  const websiteHref = websiteSource
    ? (/^https?:\/\//.test(websiteSource) ? websiteSource : `https://${websiteSource}`)
    : "";
  const primarySender = community.senders?.find((s) => s.isPrimary) ?? community.senders?.[0] ?? null;
  // Secondary senders contribute their email only (never a second name) and are
  // the default contents of the Additional Emails boxes, always below the primary.
  // Salesperson addresses read as contact text, not as a bright accent link,
  // so they take the darkest color in the brand palette rather than the accent.
  const senderEmailColor = darkestBrandColor(brand);
  // A sender can be recorded by name alone, in which case the footer shows the
  // name and simply has no address line under it.
  const primarySenderEmail = primarySender?.email?.trim() ?? "";
  const secondarySenderEmails = (community.senders ?? [])
    .flatMap((s) => (s !== primarySender && s.email?.trim() ? [s.email.trim()] : []));

  // Footer's blocks, by name. They share one table cell, so drawing
  // them in a different sequence is all rearranging them takes.
  const footerBlocks: Record<string, string> = {
    footerButtonLabel: `${(websiteHref && !flyer.footerButtonHidden) ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="220" style="margin-bottom:28px;">
        <tr>
          <td width="220" class="glm-bg-footerbtn" bgcolor="${footerButtonBg}" align="center" style="background:${footerButtonBg}; border-radius:${BUTTON_RADIUS}px;" data-bgfield="footerButtonBgColor" data-deletefield="footerButtonHidden">
            <a href="${escapeHtml(websiteHref)}" data-field="footerButtonLabel" style="display:block; padding:13px 28px; color:${buttonTextColor("#FFFFFF", footerButtonBg)}; text-decoration:none; font-family:${fontBody}; font-size:${FIELD_FONT_SIZES.footerButtonLabel}px; letter-spacing:2.5px; text-transform:uppercase; font-weight:700;">${flyer.footerButtonLabel ? renderInlineField(flyer.footerButtonLabel) : escapeHtml(DEFAULT_WEBSITE_BUTTON_LABEL)}</a>
          </td>
        </tr>
      </table>` : ""}`,
    thankYouText: `${deletableLine(flyer.thankYouText, DEFAULT_THANK_YOU_TEXT, (inner) => `<p data-field="thankYouText" data-deletefield="block:thankYouText" style="${alignStyleFor("thankYouText")}font-family: ${fontHeadline}; font-size: ${FIELD_FONT_SIZES.thankYouText}px; color: ${brand.primary}; margin: 0 0 10px 0;">${inner}</p>`, isHidden(flyer, "thankYouText"))}`,
    footerSenderName: `${primarySender?.name ? deletableLine(flyer.footerSenderName, escapeHtml(primarySender.name), (inner) => `<p data-field="footerSenderName" data-deletefield="block:footerSenderName" style="${alignStyleFor("footerSenderName")}font-family: ${fontBody}; font-size: ${FIELD_FONT_SIZES.footerSenderName}px; color: #3A3A3A; margin: 0 0 2px 0;">${inner}</p>`, isHidden(flyer, "footerSenderName")) : ""}`,
    footerName: `${deletableLine(flyer.footerName, escapeHtml(defaultFooterName(community)), (inner) => `<p data-field="footerName" data-deletefield="block:footerName" style="${alignStyleFor("footerName")}font-family: ${fontBody}; font-size: ${FIELD_FONT_SIZES.footerName}px; color: #3A3A3A; margin: 0 0 4px 0;">${inner}</p>`, isHidden(flyer, "footerName"))}`,
    footerSenderEmail: `${primarySenderEmail ? alignWrap("footerSenderEmail", deletableLine(flyer.footerSenderEmail, escapeHtml(primarySenderEmail), (inner) => `<a href="mailto:${escapeHtml(primarySenderEmail)}" data-field="footerSenderEmail" data-deletefield="block:footerSenderEmail" style="font-family: ${fontBody}; font-size: ${FIELD_FONT_SIZES.footerSenderEmail}px; color: ${senderEmailColor}; text-decoration: none;">${inner}</a>`, isHidden(flyer, "footerSenderEmail"))) : ""}
      ${(flyer.additionalFooterEmails ?? secondarySenderEmails)
        .filter((e) => stripHtml(e ?? "").trim())
        .map((e) => `<div style="margin-top: 2px;"><a href="mailto:${escapeHtml(stripHtml(e).trim())}" style="font-family: ${fontBody}; font-size: 18px; color: ${senderEmailColor}; text-decoration: none;">${renderInlineField(e)}</a></div>`)
        .join("")}`,
  };
  const footerPieces = () =>
    orderedBlocks(flyer, "Footer")
      .map((b) => `${footerBlocks[b.name] ?? ""}\n      ${linesAfter(b.slot)}`)
      .join("\n      ");
  const footer = flyer.footerSectionHidden ? "" : `
  <tr data-section="Footer" data-deletefield="footerSectionHidden">
    <td class="glm-bg-footer" bgcolor="${footerBg}" style="padding: 40px 36px 32px 36px; background: ${footerBg};" align="center" data-bgfield="footerBgColor">${linesAfter("top")}
      ${footerPieces()}
    </td>
  </tr>`;

  // The sections, by name, drawn in whatever order this draft asks for.
  // Rearranging one takes its blocks with it: a block lives in a section and
  // has nowhere else to be written down.
  const bySection: Record<string, string> = {
    Header: header,
    Hero: hero,
    Story: story,
    "Secondary Image": secondary,
    "Photo Gallery": gallery,
    "Call to Action": finalCta,
    Footer: footer,
  };

  // Everything hidden is a state worth naming rather than a blank page.
  const sections = orderedSections(flyer).map((def) => bySection[def.name] ?? "");
  const body = sections.some((section) => section.trim())
    ? sections.join("\n      ")
    : options.forPreview
      ? `
      <tr><td style="padding:72px 36px; text-align:center; font-family:${fontBody}; font-size:15px; color:#8a8a8a;">
        Every section is hidden. Turn one back on to see it here.
      </td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<!-- No viewport tag on purpose: this is a fixed 600px design, and clients
     zoom it to fit. Setting width=device-width made Gmail squeeze and reflow
     it; setting width=600 fixed Gmail and broke Apple Mail. -->
<!-- Stops iOS turning phone numbers, dates and addresses into its own blue
     underlined links — which is what put a blue number inside the call button. -->
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(flyer.subject)}</title>
<style>
  /*
    Nothing may ever leave the 600px frame. Long words, pasted URLs and
    date/time lines that don't fit the column wrap instead of running off the
    edge or stretching the email. break-word only kicks in when a single token
    genuinely cannot fit, so normal copy still breaks at spaces.
  */
  td, p, a, span, div, h1, h2, h3 {
    overflow-wrap: break-word;
    word-wrap: break-word;
    word-break: break-word;
  }
  img { max-width: 100%; }

  body, table, td, p, a, span, div {
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  /*
    Apple Mail and iOS wrap anything they think is a phone number, date or
    address in their own link, with their own blue underlined styling — inside
    a button that reads as a broken-looking highlight. The meta tag above asks
    them not to; this puts the colour back for anything that slips past.
  */
  a[x-apple-data-detectors] {
    color: inherit !important;
    text-decoration: none !important;
    font-size: inherit !important;
    font-family: inherit !important;
    font-weight: inherit !important;
    line-height: inherit !important;
  }

  /*
    The headline, script subheadline, address, story eyebrow and title, and
    both date lines. The global break-word rule above is undone here so a long
    word in one of them breaks at a space rather than being split down the
    middle. Deliberately not white-space:nowrap — that pushed the hero past the
    edge in Gmail and Apple Mail whenever a recipient's font ran wider than
    expected.
  */
  .glm-nowrap {
    word-break: normal !important;
    overflow-wrap: normal !important;
    word-wrap: normal !important;
  }

  /*
    Outlook (new Outlook / Outlook.com) applies its own automatic dark-mode
    repaint that treats near-white surfaces as "unstyled chrome" and force-
    darkens them — this happens even with a bgcolor attribute set, and even
    with the color-scheme meta tags above. Outlook's own dark-mode docs
    describe tagging repainted elements with data-ogsc/data-ogsb attributes;
    author CSS targeting those attributes is the documented way to pin the
    original color back. One rule per distinct brand color actually used in
    this render — kept as classes (not inline !important) because Outlook's
    repaint targets inline style values directly.
  */
  [data-ogsc] .glm-bg-outer, [data-ogsb] .glm-bg-outer { background-color: #f5f5f5 !important; }
  [data-ogsc] .glm-bg-white, [data-ogsb] .glm-bg-white { background-color: #ffffff !important; }
  [data-ogsc] .glm-bg-header, [data-ogsb] .glm-bg-header { background-color: ${headerBg} !important; }
  [data-ogsc] .glm-bg-hero, [data-ogsb] .glm-bg-hero { background-color: ${heroBg} !important; }
  [data-ogsc] .glm-bg-finalcta, [data-ogsb] .glm-bg-finalcta { background-color: ${finalCtaBg} !important; }
  [data-ogsc] .glm-bg-herobtn, [data-ogsb] .glm-bg-herobtn { background-color: ${ctaButtonBg} !important; }
  [data-ogsc] .glm-bg-finalctabtn, [data-ogsb] .glm-bg-finalctabtn { background-color: ${finalCtaButtonBg} !important; }
  [data-ogsc] .glm-bg-footerbtn, [data-ogsb] .glm-bg-footerbtn { background-color: ${footerButtonBg} !important; }
  [data-ogsc] .glm-bg-footer, [data-ogsb] .glm-bg-footer { background-color: ${footerBg} !important; }
  [data-ogsc] .glm-bg-story, [data-ogsb] .glm-bg-story { background-color: ${storyBg} !important; }
  [data-ogsc] .glm-bg-secondary, [data-ogsb] .glm-bg-secondary { background-color: ${secondaryImageBg} !important; }
  [data-ogsc] .glm-bg-gallerylabel, [data-ogsb] .glm-bg-gallerylabel { background-color: ${galleryLabelBg} !important; }
  [data-ogsc] .glm-bg-gallery, [data-ogsb] .glm-bg-gallery { background-color: ${galleryBg} !important; }
</style>
</head>
<body class="glm-bg-outer" style="margin:0; padding:0; background:#f5f5f5;" bgcolor="#f5f5f5">
<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(flyer.previewText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="glm-bg-outer" bgcolor="#f5f5f5" style="background:#f5f5f5;">
  <!-- No padding. This used to hold the email 32px clear of the page,
       which reads as a band of grey above the logo and below the footer —
       page decoration on something that should be only the email. -->
  <tr><td align="center" style="padding:0;">
    <!-- table-layout:fixed makes width:600px binding. Without it the table is
         auto-layout, so any single wide row (a long unwrapped date line, a
         fixed-width button) stretches the whole email past 600px while the
         images stay at their declared widths, leaving uneven background beside
         them. The email must never be wider than its images. -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="glm-bg-white" bgcolor="#ffffff" style="width:600px; table-layout:fixed; margin:0 auto; background:#ffffff;">
      ${body}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
