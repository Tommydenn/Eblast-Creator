// Templated marketing email renderer.
// Takes an ExtractedFlyer + Community → produces brand-themed HTML.
// One template, every community gets it with their own brand variables.

import type { Community } from "@/data/communities";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";

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
  return p
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

/**
 * Scale every size set inside a field by the same factor.
 *
 * A size chosen in the toolbar is written onto the text itself as an inline
 * style, and an inline size beats the paragraph's. So shrinking the paragraph
 * alone changed nothing for exactly the fields someone had sized by hand —
 * measured, 14 lines across 60 real drafts still overflowed. Scaling the inner
 * sizes by the same factor shrinks the whole line while keeping any deliberate
 * size differences within it.
 */
function scaleInlineSizes(html: string, factor: number): string {
  if (!html || factor >= 1) return html;
  return html.replace(/font-size:\s*(\d+(?:\.\d+)?)px/gi, (_m, px) => {
    const scaled = Math.max(8, Math.round(Number(px) * factor));
    return `font-size: ${scaled}px`;
  });
}

/**
 * A size the user set on this field in the editor, if they set one.
 *
 * The toolbar writes the size onto the text as an inline style, so it lives in
 * the field's own markup. Fitting has to start from that rather than from the
 * template default, or a size someone deliberately chose would be ignored.
 */
function userChosenSize(html: string): number | undefined {
  const m = /font-size:\s*(\d+(?:\.\d+)?)px/i.exec(html ?? "");
  if (!m) return undefined;
  const px = Number(m[1]);
  return Number.isFinite(px) && px > 0 ? Math.round(px) : undefined;
}

// Inline field: sanitize rich HTML from single-line contentEditable fields.
// Strips div wrappers, dangerous elements, and event handlers — preserves
// inline formatting (bold, italic, color spans, font spans).
function renderInlineField(s: string): string {
  if (!s) return "";
  return s
    .replace(/^<div>([\s\S]*)<\/div>$/i, "$1")
    // Trailing breaks are an editing artifact, not content: a break typed at
    // the very end of a field leaves a spare <br> behind so the caret has a
    // visible line to sit on. Drop the whole run so the email has no stray gap.
    .replace(/(?:<br\s*\/?>|\s)+$/i, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .trim();
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
 * A line that can be removed simply by clearing its text.
 *
 * A field nobody has touched is undefined, and shows whatever the template
 * would otherwise supply. A field someone emptied is an empty string, and
 * renders nothing at all, so the line and the space it held both go rather
 * than leaving a blank paragraph propping a gap open.
 */
function deletableLine(
  value: string | null | undefined,
  fallbackHtml: string | null,
  wrap: (innerHtml: string) => string,
): string {
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
 * These MUST stay equal to FIELD_FONT_SIZES in components/drafter/RichEditor.tsx.
 * Long text wraps instead of shrinking, which the pinned 600px shell and the
 * wrapping rules already handle.
 */
const SCRIPT_SUBHEADLINE_SIZE = 40;
const CTA_DATE_SIZE = 32;
const CALL_BUTTON_SIZE = 18;

/** Character between the event date and time. Must match DateTimeField's. */
const SEPARATOR = "·";

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
 * The "date · time" line: one visual text block, two separate fields.
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
  timeStartsWithSeparator: boolean;
  fontFamily: string;
  fontSize: number;
  /** How much the fitted size shrank the line, for sizes set inside it. */
  sizeFactor?: number;
  /** False when the line can't be held on one line and must be free to wrap. */
  lock?: boolean;
  extraStyle: string;
  marginBottom: number;
}): string {
  const {
    dateHtml, dateField, timeHtml, timeField, timeStartsWithSeparator,
    fontFamily, fontSize, extraStyle, marginBottom, sizeFactor = 1, lock = true,
  } = opts;

  const style = `font-family: ${fontFamily}; font-size: ${fontSize}px; color: #FFFFFF; ${extraStyle} margin: 0 0 ${marginBottom}px 0;`;
  // The separator lives INSIDE the time field, never between the two spans as
  // bare text. Outside, it inherits nothing and keeps the base size while the
  // date and time restyle around it. The stored time normally already starts
  // with it; this only adds one for older values that don't.
  const scaledTime = scaleInlineSizes(timeHtml, sizeFactor);
  const timeContent = timeStartsWithSeparator ? scaledTime : `${SEPARATOR} ${scaledTime}`;
  const timePart = timeHtml ? `&nbsp;<span data-field="${timeField}" style="color:#FFFFFF; text-decoration:none;">${timeContent}</span>` : "";

  // Both date lines — hero and footer — must hold one line, so the paragraph
  // carries the no-wrap class and the space before the time is non-breaking.
  return `<p${lock ? ' class="glm-nowrap"' : ""} style="${style}"><span data-field="${dateField}" style="color:#FFFFFF; text-decoration:none;">${scaleInlineSizes(dateHtml, sizeFactor)}</span>${timePart}</p>`;
}

export interface RenderOptions {
  /** Hero image URL or data URI. If omitted, the hero block has no photo — just brand color. */
  heroImageUrl?: string;
  /** Secondary inline image, placed between body paragraphs. */
  secondaryImageUrl?: string;
  /** Additional images for the gallery section near the bottom. Up to 4 used. */
  galleryImageUrls?: string[];
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

  const eventDateLine = [flyer.eventDate, flyer.eventTime].filter(Boolean).join(" · ");

  // Community address line for hero/CTA: "Name, Street, City, ST ZIP"
  const communityAddressLine = (() => {
    const a = community.address;
    const stateZip = [a.state, a.zip].filter(Boolean).join(" ");
    return [community.displayName, a.street, a.city, stateZip].filter(Boolean).join(", ");
  })();
  const addressLine = flyer.heroAddress ?? communityAddressLine;

  // RSVP label from the flyer ("RSVP Required" / "RSVP Requested")
  const rsvpLabel = flyer.rsvpLabel?.trim() ?? "";
  // CTA/footer section may have independent overrides; fall back to hero values
  const ctaRsvpLabel = (flyer.ctaRsvpLabel ?? flyer.rsvpLabel)?.trim() ?? "";
  const ctaDate = flyer.ctaEventDate ?? flyer.eventDate;
  const ctaTime = flyer.ctaEventTime ?? flyer.eventTime;
  const ctaDateLine = [ctaDate, ctaTime].filter(Boolean).join(" · ");
  // This line is a single no-wrap row at a large display size. A long combined
  // date+time string can force it wider than the 600px template, which grows
  // the whole table and leaves a gap beside the fixed-width hero/secondary/
  // gallery images (measured: a 38-char line rendered ~540px against a 528px
  // budget). Shrink with a small safety margin below that measured failure
  // point — short lines (the normal case) keep the original 28px unchanged.
  /**
   * Pick the largest size at which a single unwrapped line still fits the
   * content column, instead of guessing from character count.
   *
   * The old character-count thresholds were calibrated for the pre-bump sizes
   * and silently broke the layout afterwards: "Thursday, August 6 · 1:30-3:30
   * PM" is 33 characters, so it took the LARGE size, which at 32px measured
   * 555px. Add the section's 36px side padding and the row needed 627px inside
   * a 600px frame, so the whole email was forced 27px wider than the images in
   * it and every photo ended up with an uneven sliver of background beside it.
   *
   * CONTENT_WIDTH is the real budget: the 600px shell minus 36px of padding on
   * each side. The 0.53 factor is the measured average glyph width relative to
   * font size for these headline faces (33 chars at 32px measured 555px, which
   * is 0.526), with a little headroom.
   */
  /** 600px shell minus a section's 36px side padding. */
  const CONTENT_WIDTH = 600 - 36 * 2;
  /** Inside the hero's date box, which adds 26px of its own padding each side. */
  // The date box no longer adds side padding of its own, so its content spans
  // the same column as every other section and lines up with the header.
  const HERO_CONTENT_WIDTH = CONTENT_WIDTH;

  // The brand font, exactly as the Community page has it, with nothing added.
  //
  // A backup was tried here and taken out again on request: naming one means
  // every recipient without the brand font gets the SAME substitute we picked,
  // where before each client chose its own. The preference is for the
  // recipient s own system to choose, so nothing is appended.
  //
  // The cost is that line widths are no longer predictable, which is why the
  // fitting below measures against the widest common substitute rather than
  // any particular one.
  const fontHeadline = brand.fontHeadline;
  const fontBody = brand.fontBody;

  /**
   * The size to render a never-wrap line at.
   *
   * These lines carry white-space:nowrap, so text too wide for the column would
   * spill out of the email rather than break. This returns the chosen size when
   * it fits and the largest smaller size when it doesn't. Measured against the
   * BACKUP font, since the brand face is almost never installed.
   *
   * A size the user set by hand on the text itself wins over the template's
   * default, so what they picked is what gets fitted.
   */

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
    ? `<img src="${logoSrc}" alt="${escapeHtml(community.displayName)}" height="88" style="display:block; height:88px; width:auto; max-width:300px; border:0; margin:0 auto;">`
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

  const header = `
  <tr data-section="Header">
    <td class="glm-bg-header" bgcolor="${headerBg}" style="padding: 22px 36px; background:${headerBg}; border-top: 4px solid ${headerStripe}; text-align:center;" align="center" data-bgfield="headerBgColor">
      ${logoContent}
    </td>
  </tr>`;

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
            ${hasText(rsvpLabel) ? `<p data-field="rsvpLabel" style="font-family: ${fontBody}; font-size: 18px; font-weight: 700; letter-spacing: 4px; color: ${HERO_ADDRESS_COLOR}; text-transform: uppercase; margin: 0 0 14px 0;">${renderInlineField(rsvpLabel)}</p>` : ""}
            ${hasText(flyer.headline) ? `<p data-field="headline" class="glm-nowrap" style="font-family: ${fontHeadline}; font-size: 40px; line-height:1.1; color: #FFFFFF; letter-spacing: 0.5px; margin: 0 0 6px 0;">${renderInlineField(flyer.headline)}</p>` : ""}
            ${hasText(flyer.scriptSubheadline) ? `<p data-field="scriptSubheadline" class="glm-nowrap" style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: ${SCRIPT_SUBHEADLINE_SIZE}px; color: #F0E2C0; line-height: 1.1; margin: 0 auto 18px auto;">${renderInlineField(flyer.scriptSubheadline!)}</p>` : ""}
            ${eventDateLine ? `
            <!-- This table had no width at all, so it auto-sized to its text.
                 A date line longer than the column made it wider than the
                 600px frame, which is what stretched the email (and, once the
                 frame was pinned, spilled off the edge instead). Constrained
                 to the hero's content width so the text wraps inside it. -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${HERO_CONTENT_WIDTH}" style="width: ${HERO_CONTENT_WIDTH}px; margin: 12px auto 22px auto; max-width: ${HERO_CONTENT_WIDTH}px; table-layout: fixed;">
              <tr>
                <!-- Vertical padding matches the header's 22px, and there is no
                     side padding so the date, time and address line up with the
                     header rather than sitting 26px further in. -->
                <td style="border-top: 1px solid #ffffff; border-bottom: 1px solid #ffffff; padding: 22px 0; max-width: ${HERO_CONTENT_WIDTH}px;" align="center">
                  ${dateTimeRow({
                    dateHtml: renderInlineField(flyer.eventDate ?? ""),
                    dateField: "eventDate",
                    timeHtml: flyer.eventTime ? renderInlineField(flyer.eventTime) : "",
                    timeField: "eventTime",
                    timeStartsWithSeparator: stripHtml(flyer.eventTime ?? "").trim().startsWith("·"),
                    fontFamily: fontHeadline,
                    fontSize: 26,
                    extraStyle: "letter-spacing: 1px;",
                    // No address beneath it means no space needed under the date.
                    marginBottom: hasText(addressLine) ? 8 : 0,
                  })}
                  ${hasText(addressLine) ? `<p data-field="heroAddress" class="glm-nowrap" style="font-family: ${fontBody}; font-size: 17px; letter-spacing: 1px; color: ${HERO_ADDRESS_COLOR}; margin: 0;"><span style="color: ${HERO_ADDRESS_COLOR}; text-decoration: none;">${flyer.heroAddress ? renderInlineField(flyer.heroAddress) : escapeHtml(addressLine)}</span></p>` : ""}
                </td>
              </tr>
            </table>` : ""}
            ${flyer.ctaButtonHidden ? "" : `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${ctaBtnWidth}">
              <tr>
                <td width="${ctaBtnWidth}" class="glm-bg-herobtn" bgcolor="${ctaButtonBg}" align="center" style="background:${ctaButtonBg};" data-bgfield="ctaButtonBgColor" data-deletefield="ctaButtonHidden">
                  <a href="${escapeHtml(ctaHref)}" style="display:block; padding:16px 36px; text-align:center; color:${buttonTextColor("#FFFFFF", ctaButtonBg)}; text-decoration:none; font-family:${fontBody}; font-size:${ctaBtnFontSize}px; letter-spacing:${ctaBtnLetterSpacing}; text-transform:uppercase; font-weight:700; line-height:1.4;">${ctaDisplayHtml}</a>
                </td>
              </tr>
            </table>`}
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
  const storyEyebrowHtml = hasText(flyer.storyEyebrow) ? renderInlineField(flyer.storyEyebrow) : "";
  const storyTitleHtml = hasText(flyer.storyScriptTitle) ? renderInlineField(flyer.storyScriptTitle!) : "";
  const storyHeadShown = !!(storyEyebrowHtml || storyTitleHtml);
  // A blank entry inside the body is kept, since someone may have left one
  // there deliberately for spacing. Only an entirely empty body drops the row.
  const storyBodyHtml = hasText(flyer.bodyParagraphs)
    ? flyer.bodyParagraphs.map((p) => renderBodyParagraph(p)).join("<br><br>")
    : "";

  const story = `
  ${flyer.storySectionHidden ? "" : `
  ${storyHeadShown ? `
  <tr data-section="Story" data-deletefield="storySectionHidden">
    <td style="padding: 44px 36px 12px 36px;">
      ${storyEyebrowHtml ? `<p data-field="storyEyebrow" class="glm-nowrap" style="font-family: ${fontBody}; font-size: 15px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0 0 10px 0;">${storyEyebrowHtml}</p>` : ""}
      ${storyTitleHtml ? `<p data-field="storyScriptTitle" class="glm-nowrap" style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: 42px; color: ${brand.accent}; line-height: 1.1; margin: 0 0 10px 0;">${storyTitleHtml}</p>` : ""}
    </td>
  </tr>` : ""}
  ${storyBodyHtml ? `
  <tr data-section="Story" data-deletefield="storySectionHidden">
    <td style="padding: ${storyHeadShown ? "0" : "44px"} 36px 28px 36px;">
      <p data-field="bodyParagraphs" style="font-family: ${fontBody}; font-size: 19px; line-height: 1.65; color: #3A3A3A; margin: 0;">${storyBodyHtml}</p>
    </td>
  </tr>` : ""}`}
  ${(secondaryImg && !flyer.secondaryImageSectionHidden) ? `
  <tr data-section="Secondary Image" data-deletefield="secondaryImageSectionHidden">
    <td style="padding: 0 36px 28px 36px;">
      ${linkedImage(`<img src="${secondaryImg}" data-img-label="Secondary image" width="528" height="300" alt="${escapeHtml(flyer.secondaryImageAlt ?? "")}" style="display:block; width:528px; max-width:100%; height:auto; border:0;">`, flyer.secondaryImageLink, "secondaryImageLink")}
    </td>
  </tr>` : ""}
  `;


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
        ? escapeHtml(`A Look Around ${community.shortName}`)
        : hasText(flyer.galleryLabel)
          ? renderInlineField(flyer.galleryLabel)
          : "";

    return `
  ${galleryLabelHtml ? `
  <tr data-section="Photo Gallery" data-deletefield="gallerySectionHidden">
    <td style="padding: 44px 36px 12px 36px;" align="center">
      <p data-field="galleryLabel" style="font-family: ${fontBody}; font-size: 15px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0;">${galleryLabelHtml}</p>
    </td>
  </tr>` : ""}
  <tr data-section="Photo Gallery" data-deletefield="gallerySectionHidden">
    <td style="padding: ${galleryLabelHtml ? "16px" : "44px"} 36px 32px 36px;">
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

  const finalCta = flyer.finalCtaSectionHidden ? "" : `
  <tr data-section="Call to Action" data-deletefield="finalCtaSectionHidden">
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="glm-bg-finalcta" bgcolor="${finalCtaBg}" style="background:${finalCtaBg};" data-bgfield="finalCtaBgColor">
        <tr>
          <td style="padding: 40px 36px;" align="center">
            ${hasText(ctaRsvpLabel) ? `<p style="font-family: ${fontBody}; font-size: 18px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #FFFFFF; margin: 0 0 14px 0;">${renderInlineField(ctaRsvpLabel)}</p>` : ""}
            ${ctaDateLine ? dateTimeRow({
              dateHtml: renderInlineField(ctaDate ?? ""),
              dateField: "ctaEventDate",
              timeHtml: ctaTime ? renderInlineField(ctaTime) : "",
              timeField: "ctaEventTime",
              timeStartsWithSeparator: stripHtml(ctaTime ?? "").trim().startsWith("·"),
              fontFamily: fontHeadline,
              fontSize: CTA_DATE_SIZE,
              extraStyle: "line-height: 1.2;",
              marginBottom: 22,
            }) : ""}
            ${flyer.finalCtaButtonHidden ? "" : `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${finalCtaLabel.width}">
              <tr>
                <td width="${finalCtaLabel.width}" class="glm-bg-finalctabtn" bgcolor="${finalCtaButtonBg}" align="center" style="background:${finalCtaButtonBg};" data-bgfield="finalCtaButtonBgColor" data-deletefield="finalCtaButtonHidden">
                  <a href="${escapeHtml(ctaHref)}" style="display:block; padding:16px 36px; text-align:center; color:${buttonTextColor("#FFFFFF", finalCtaButtonBg)}; text-decoration:none; font-family:${fontBody}; font-size:${finalCtaLabel.fontSize}px; letter-spacing:${finalCtaLabel.letterSpacing}; text-transform:uppercase; font-weight:700; line-height:1.4;">${finalCtaLabel.displayHtml}</a>
                </td>
              </tr>
            </table>`}
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
  const secondarySenderEmails = (community.senders ?? [])
    .filter((s) => s !== primarySender && s.email?.trim())
    .map((s) => s.email.trim());

  const footer = `
  <tr data-section="Footer">
    <td class="glm-bg-footer" bgcolor="${footerBg}" style="padding: 40px 36px 32px 36px; background: ${footerBg};" align="center" data-bgfield="footerBgColor">
      ${(websiteHref && !flyer.footerButtonHidden) ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="220" style="margin-bottom:28px;">
        <tr>
          <td width="220" class="glm-bg-footerbtn" bgcolor="${footerButtonBg}" align="center" style="background:${footerButtonBg};" data-bgfield="footerButtonBgColor" data-deletefield="footerButtonHidden">
            <a href="${escapeHtml(websiteHref)}" data-field="footerButtonLabel" style="display:block; padding:13px 28px; color:${buttonTextColor("#FFFFFF", footerButtonBg)}; text-decoration:none; font-family:${fontBody}; font-size:17px; letter-spacing:2.5px; text-transform:uppercase; font-weight:700;">${flyer.footerButtonLabel ? renderInlineField(flyer.footerButtonLabel) : "Visit Our Website"}</a>
          </td>
        </tr>
      </table>` : ""}
      ${deletableLine(flyer.thankYouText, "Thank You!", (inner) => `<p data-field="thankYouText" style="font-family: ${fontHeadline}; font-size: 30px; color: ${brand.primary}; margin: 0 0 10px 0;">${inner}</p>`)}
      ${primarySender?.name ? deletableLine(flyer.footerSenderName, escapeHtml(primarySender.name), (inner) => `<p data-field="footerSenderName" style="font-family: ${fontBody}; font-size: 18px; color: #3A3A3A; margin: 0 0 2px 0;">${inner}</p>`) : ""}
      ${deletableLine(flyer.footerName, escapeHtml(community.displayName), (inner) => `<p data-field="footerName" style="font-family: ${fontBody}; font-size: 18px; color: #3A3A3A; margin: 0 0 4px 0;">${inner}</p>`)}
      ${primarySender?.email ? deletableLine(flyer.footerSenderEmail, escapeHtml(primarySender.email), (inner) => `<a href="mailto:${escapeHtml(primarySender.email)}" data-field="footerSenderEmail" style="font-family: ${fontBody}; font-size: 18px; color: ${senderEmailColor}; text-decoration: none;">${inner}</a>`) : ""}
      ${(flyer.additionalFooterEmails ?? secondarySenderEmails)
        .filter((e) => stripHtml(e ?? "").trim())
        .map((e) => `<div style="margin-top: 2px;"><a href="mailto:${escapeHtml(stripHtml(e).trim())}" style="font-family: ${fontBody}; font-size: 18px; color: ${senderEmailColor}; text-decoration: none;">${renderInlineField(e)}</a></div>`)
        .join("")}
    </td>
  </tr>`;

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
    The seven lines that must never wrap. Their size is fitted before sending so
    the text is known to fit; these rules stop a client breaking them anyway.
    The global break-word rule above has to be undone here, or a long single
    word would still split.
  */
  .glm-lock {
    /* Last line of defence: whatever happens inside, a section can never make
       the email wider than its column. */
    overflow: hidden !important;
    max-width: 100% !important;
  }

  /*
    The seven lines that should hold one line. Their size is fitted before
    sending so the text is known to fit the column.
    
    Deliberately NOT white-space:nowrap. Nowrap guarantees no wrap, but the
    moment a recipient s font is wider than predicted the text is pushed out of
    the frame instead — which is what put the hero section past the edge in both
    Gmail and Apple Mail. There is no way to know a recipient s exact font
    metrics, so that failure cannot be designed out. Sizing to fit does the work;
    if a client still surprises us the line wraps, which is contained and
    recoverable, rather than breaking the layout.
    
    The global break-word rule is still undone here, so a long word breaks at a
    space rather than being split down the middle.
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
</style>
</head>
<body class="glm-bg-outer" style="margin:0; padding:0; background:#f5f5f5;" bgcolor="#f5f5f5">
<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(flyer.previewText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="glm-bg-outer" bgcolor="#f5f5f5" style="background:#f5f5f5;">
  <tr><td align="center" style="padding:32px 0;">
    <!-- table-layout:fixed makes width:600px binding. Without it the table is
         auto-layout, so any single wide row (a long unwrapped date line, a
         fixed-width button) stretches the whole email past 600px while the
         images stay at their declared widths, leaving uneven background beside
         them. The email must never be wider than its images. -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="glm-bg-white" bgcolor="#ffffff" style="width:600px; table-layout:fixed; margin:0 auto; background:#ffffff;">
      ${header}
      ${hero}
      ${story}
      ${gallery}
      ${finalCta}
      ${footer}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
