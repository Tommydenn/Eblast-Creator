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

// Inline field: sanitize rich HTML from single-line contentEditable fields.
// Strips div wrappers, dangerous elements, and event handlers — preserves
// inline formatting (bold, italic, color spans, font spans).
function renderInlineField(s: string): string {
  if (!s) return "";
  return s
    .replace(/^<div>([\s\S]*)<\/div>$/i, "$1")
    .replace(/<br\s*\/?>$/i, "")
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
  const headerBg = isDarkHeader
    ? brand.background // genuinely dark brand surface -> dark header
    : surfaceIsGray
      ? "#ffffff" // gray surface -> force white (never a gray header)
      : brand.background; // warm/beige light surface -> keep it
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
  const textFallback = `<span style="font-family: ${brand.fontHeadline}; font-size: 24px; color: ${isDarkHeader ? "#ffffff" : brand.primary}; letter-spacing: 1px; display:block;">${escapeHtml(community.shortName)}</span>${locationSuffix ? `<span style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 3px; color: ${isDarkHeader ? "#cccccc" : brand.accent}; text-transform: uppercase; display:block; margin-top:5px;">${escapeHtml(locationSuffix)}</span>` : ""}`;

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
  const rawLabelHtml = flyer.ctaButtonLabel && flyer.ctaButtonLabel.trim()
    ? flyer.ctaButtonLabel
    : (formattedTracking ? `Call ${formattedTracking}` : "Call Us");
  const reconciledLabelHtml = formattedTracking
    ? (PHONE_RE.test(stripHtml(rawLabelHtml))
        ? rawLabelHtml.replace(PHONE_RE, formattedTracking)
        : `${rawLabelHtml} ${formattedTracking}`)
    : rawLabelHtml;
  const ctaDisplayText = stripHtml(reconciledLabelHtml);
  const ctaDisplayHtml = renderInlineField(reconciledLabelHtml);

  // Two font sizes only. Long labels wrap to a second line rather than shrinking.
  const ctaBtnFontSize = ctaDisplayText.length <= 32 ? 14 : 13;
  const ctaBtnLetterSpacing = ctaBtnFontSize >= 14 ? "2.5px" : "2px";
  // Explicit pixel width for CTA button tables. Outlook/Word auto-sizes tables with
  // no width attribute, and white-space:nowrap causes the cell to grow wider on
  // each forward/reply cycle. A fixed width prevents this accumulation.
  const ctaBtnWidth = ctaDisplayText.length <= 24 ? 240 : ctaDisplayText.length <= 36 ? 300 : 340;

  // Component fragments — kept as inline HTML because email clients reward
  // redundancy and table-based layouts. CSS variables/classes don't survive Outlook.
  // data-section and data-field attributes are used by the preview's interactive
  // script for hover labels and inline text editing; email clients ignore them.

  const header = `
  <tr data-section="Header">
    <td style="padding: 22px 36px; background:${headerBg}; border-top: 4px solid ${headerStripe}; text-align:center;" align="center">
      ${logoContent}
    </td>
  </tr>`;

  const hero = `
  <tr data-section="Hero">
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${heroImg ? `
        <tr>
          <td style="padding: 0; line-height: 0; font-size: 0; overflow: hidden;">
            <img src="${heroImg}" data-img-label="Hero image" width="600" alt="${escapeHtml(flyer.heroImageAlt)}" style="display:block; width:600px; max-width:100%; height:auto; border:0;">
          </td>
        </tr>` : ""}
        <tr>
          <td style="background:${brand.primary}; padding: ${heroImg ? "36px" : "60px"} 36px 40px 36px;" align="center">
            ${rsvpLabel ? `<p data-field="rsvpLabel" style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 4px; color: #C8B98A; text-transform: uppercase; margin: 0 0 14px 0;">${renderInlineField(rsvpLabel)}</p>` : ""}
            <p data-field="headline" style="font-family: ${brand.fontHeadline}; font-size: 36px; line-height:1.1; color: #FFFFFF; letter-spacing: 0.5px; margin: 0 0 6px 0;">${renderInlineField(flyer.headline)}</p>
            ${flyer.scriptSubheadline ? (() => {
              const plainLen = stripHtml(flyer.scriptSubheadline).length;
              const fontSize = plainLen <= 18 ? 44 : plainLen <= 28 ? 36 : plainLen <= 38 ? 28 : 22;
              return `<p data-field="scriptSubheadline" style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: ${fontSize}px; color: #F0E2C0; line-height: 1.1; margin: 0 auto 18px auto;">${renderInlineField(flyer.scriptSubheadline)}</p>`;
            })() : ""}
            ${eventDateLine ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 12px auto 22px auto;">
              <tr>
                <td style="border-top: 1px solid #ffffff; border-bottom: 1px solid #ffffff; padding: 14px 26px;" align="center">
                  <p style="font-family: ${brand.fontHeadline}; font-size: 22px; color: #FFFFFF; letter-spacing: 1px; margin: 0 0 8px 0; white-space: nowrap;"><span data-field="eventDate">${renderInlineField(flyer.eventDate ?? "")}</span>${flyer.eventTime ? ` · <span data-field="eventTime">${renderInlineField(flyer.eventTime)}</span>` : ""}</p>
                  ${addressLine ? `<p data-field="heroAddress" style="font-family: ${brand.fontBody}; font-size: 12px; letter-spacing: 1px; color: #E8DDC4; margin: 0;">${flyer.heroAddress ? renderInlineField(flyer.heroAddress) : escapeHtml(addressLine)}</p>` : ""}
                </td>
              </tr>
            </table>` : ""}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${ctaBtnWidth}">
              <tr>
                <td width="${ctaBtnWidth}" align="center" style="background:${brand.accent};">
                  <a href="${escapeHtml(ctaHref)}" style="display:block; padding:16px 36px; text-align:center; color:${buttonTextColor("#FFFFFF", brand.accent)}; text-decoration:none; font-family:${brand.fontBody}; font-size:${ctaBtnFontSize}px; letter-spacing:${ctaBtnLetterSpacing}; text-transform:uppercase; font-weight:700; line-height:1.4;">${ctaDisplayHtml}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const story = `
  <tr data-section="Story">
    <td style="padding: 44px 36px 12px 36px;">
      <p data-field="storyEyebrow" style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0 0 10px 0;">${renderInlineField(flyer.storyEyebrow)}</p>
      ${flyer.storyScriptTitle ? `<p data-field="storyScriptTitle" style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: 38px; color: ${brand.accent}; line-height: 1.1; margin: 0 0 10px 0;">${renderInlineField(flyer.storyScriptTitle)}</p>` : ""}
    </td>
  </tr>
  <tr data-section="Story">
    <td style="padding: 0 36px 28px 36px;">
      <p data-field="bodyParagraphs" style="font-family: ${brand.fontBody}; font-size: 15px; line-height: 1.65; color: #3A3A3A; margin: 0;">${flyer.bodyParagraphs.map(p => renderBodyParagraph(p)).join("<br><br>")}</p>
    </td>
  </tr>
  ${secondaryImg ? `
  <tr data-section="Secondary Image">
    <td style="padding: 0 36px 28px 36px;">
      <img src="${secondaryImg}" data-img-label="Secondary image" width="528" height="300" alt="${escapeHtml(flyer.secondaryImageAlt ?? "")}" style="display:block; width:528px; max-width:100%; height:auto; border:0;">
    </td>
  </tr>` : ""}
  `;


  // Gallery: 2- or 4-up grid of additional photos extracted from the flyer.
  // Sits between the story and the final CTA.
  // Requires at least 2 images — a single orphaned photo looks unfinished.
  const gallery = (() => {
    if (galleryImgs.length === 0) return "";

    // 1 image → full-width; 2 images → 2-up; 3 → 3-up; 4+ → 2×2 grid.
    const cols = galleryImgs.length === 1 ? 1 : galleryImgs.length === 3 ? 3 : 2;
    const tileW = cols === 1 ? 528 : Math.floor(528 / cols) - 12;
    const tileH = Math.round(tileW * 3 / 4); // 4:3 aspect ratio throughout
    // Each tile carries a stable 1-based name ("Gallery image N") that matches
    // the hover label in the preview and the refine manifest, so users can call
    // out a specific gallery photo by name.
    const tiles = galleryImgs.map((src, i) => ({ src, label: `Gallery image ${i + 1}` }));
    const rows: Array<Array<{ src: string; label: string }>> = [];
    for (let i = 0; i < tiles.length; i += cols) {
      rows.push(tiles.slice(i, i + cols));
    }

    return `
  <tr data-section="Photo Gallery">
    <td style="padding: 44px 36px 12px 36px;" align="center">
      <p data-field="galleryLabel" style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0;">${flyer.galleryLabel ? renderInlineField(flyer.galleryLabel) : escapeHtml(`A Look Around ${community.shortName}`)}</p>
    </td>
  </tr>
  <tr data-section="Photo Gallery">
    <td style="padding: 16px 36px 32px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="6" border="0" width="100%" style="border-collapse:separate; border-spacing:6px;">
        ${rows
          .map(
            (row) => `
        <tr>
          ${row
            .map(
              (tile) => `
          <td valign="top" width="${tileW}" style="padding:0; overflow:hidden;">
            <img src="${tile.src}" data-img-label="${tile.label}" width="${tileW}" height="${tileH}" alt="${escapeHtml(community.displayName)}" style="display:block; width:${tileW}px; height:${tileH}px; border:0;">
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

  const finalCta = `
  <tr data-section="Call to Action">
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${brand.accent};">
        <tr>
          <td style="padding: 40px 36px;" align="center">
            ${ctaRsvpLabel ? `<p style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #FBE2CD; margin: 0 0 14px 0;">${renderInlineField(ctaRsvpLabel)}</p>` : ""}
            ${ctaDateLine ? `<p style="font-family: ${brand.fontHeadline}; font-size: 28px; color: #FFFFFF; line-height: 1.2; margin: 0 0 22px 0; white-space: nowrap;"><span data-field="ctaEventDate">${renderInlineField(ctaDate ?? "")}</span>${ctaTime ? ` · <span data-field="ctaEventTime">${renderInlineField(ctaTime)}</span>` : ""}</p>` : ""}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${ctaBtnWidth}">
              <tr>
                <td width="${ctaBtnWidth}" align="center" style="background:${brand.primary};">
                  <a href="${escapeHtml(ctaHref)}" style="display:block; padding:16px 36px; text-align:center; color:${buttonTextColor("#FFFFFF", brand.primary)}; text-decoration:none; font-family:${brand.fontBody}; font-size:${ctaBtnFontSize}px; letter-spacing:${ctaBtnLetterSpacing}; text-transform:uppercase; font-weight:700; line-height:1.4;">${ctaDisplayHtml}</a>
                </td>
              </tr>
            </table>
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

  const footer = `
  <tr data-section="Footer">
    <td style="padding: 40px 36px 32px 36px; background: #FFFFFF;" align="center">
      ${websiteHref ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="220" style="margin-bottom:28px;">
        <tr>
          <td width="220" align="center" style="background:${brand.primary};">
            <a href="${escapeHtml(websiteHref)}" style="display:block; padding:13px 28px; color:${buttonTextColor("#FFFFFF", brand.primary)}; text-decoration:none; font-family:${brand.fontBody}; font-size:13px; letter-spacing:2.5px; text-transform:uppercase; font-weight:700;">VISIT WEBSITE</a>
          </td>
        </tr>
      </table>` : ""}
      <p data-field="thankYouText" style="font-family: ${brand.fontHeadline}; font-size: 26px; color: ${brand.primary}; margin: 0 0 10px 0;">${flyer.thankYouText ? renderInlineField(flyer.thankYouText) : "Thank You!"}</p>
      ${primarySender?.name ? `<p style="font-family: ${brand.fontBody}; font-size: 14px; color: #3A3A3A; margin: 0 0 2px 0;">${escapeHtml(primarySender.name)}</p>` : ""}
      <p data-field="footerName" style="font-family: ${brand.fontBody}; font-size: 14px; color: #3A3A3A; margin: 0 0 4px 0;">${renderInlineField(flyer.footerName ?? community.displayName)}</p>
      ${primarySender?.email ? `<a href="mailto:${escapeHtml(primarySender.email)}" style="font-family: ${brand.fontBody}; font-size: 13px; color: ${brand.accent}; text-decoration: none;">${escapeHtml(primarySender.email)}</a>` : ""}
    </td>
  </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(flyer.subject)}</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f5;">
<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(flyer.previewText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f5;">
  <tr><td align="center" style="padding:32px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:100%; margin:0 auto; background:#ffffff;">
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
