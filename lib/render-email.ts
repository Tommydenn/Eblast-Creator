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

// Text color for a button: keep it consistent with the surrounding section's
// text color so the button reads as part of that section — but only when that
// color stays legible on the button's own background. If the section text would
// be too close to the button fill (low contrast), fall back to a safe choice.
function buttonTextColor(sectionTextHex: string, buttonBgHex: string): string {
  return contrastRatio(sectionTextHex, buttonBgHex) >= 1.8
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

  // Determine if brand.background is light or dark so we can pick the logo
  // variant designed for that background. The header is ALWAYS brand.background.
  const bgLum = (() => {
    const h = brand.background.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  })();
  const bgIsLight = bgLum > 0.4;

  const chosenLogo = bgIsLight
    ? (community.logos.find(l => (l.onColor === "light" || l.onColor === "any") && l.variant === "primary") ??
       community.logos.find(l => l.onColor === "light" || l.onColor === "any") ??
       community.logos[0])
    : (community.logos.find(l => l.onColor === "dark" && l.variant === "primary") ??
       community.logos.find(l => l.onColor === "dark") ??
       community.logos[0]);

  const headerBg = brand.background;
  const headerStripe = brand.accent;
  const isDarkHeader = !bgIsLight;

  // Text fallback when no logo asset is available.
  const locationSuffix = community.displayName.replace(community.shortName, "").trim();
  const textFallback = `<span style="font-family: ${brand.fontHeadline}; font-size: 24px; color: ${isDarkHeader ? "#ffffff" : brand.primary}; letter-spacing: 1px; display:block;">${escapeHtml(community.shortName)}</span>${locationSuffix ? `<span style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 3px; color: ${isDarkHeader ? "rgba(255,255,255,0.7)" : brand.accent}; text-transform: uppercase; display:block; margin-top:5px;">${escapeHtml(locationSuffix)}</span>` : ""}`;

  const logoContent = chosenLogo
    ? `<img src="${chosenLogo.url}" alt="${escapeHtml(community.displayName)}" height="88" style="display:block; height:88px; width:auto; max-width:300px; border:0; margin:0 auto;">`
    : textFallback;

  // Always use the community's CallRail tracking number for the CTA phone.
  const ctaPhone = community.trackingPhone;
  const ctaHref = ctaPhone
    ? `tel:+1${ctaPhone.replace(/\D/g, "")}`
    : flyer.ctaButtonHref;
  // Format as (XXX) XXX-XXXX for display in the button text.
  const formattedPhone = ctaPhone
    ? ctaPhone.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")
    : null;
  const ctaDisplayText = formattedPhone ? `Call ${formattedPhone} to RSVP!` : flyer.ctaButtonLabel;

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
          <td style="background:${brand.primary}; padding: 0;" align="center">
            <img src="${heroImg}" width="600" height="340" alt="${escapeHtml(flyer.heroImageAlt)}" style="display:block; width:100%; max-width:600px; height:auto; border:0;">
          </td>
        </tr>` : ""}
        <tr>
          <td style="background:${brand.primary}; padding: ${heroImg ? "36px" : "60px"} 36px 40px 36px;" align="center">
            <p data-field="eyebrow" style="font-family: ${brand.fontBody}; font-size: 13px; letter-spacing: 4px; color: #C8B98A; text-transform: uppercase; margin: 0 0 12px 0;">${escapeHtml(flyer.eyebrow)}</p>
            <p data-field="headline" style="font-family: ${brand.fontHeadline}; font-size: 36px; line-height:1.1; color: #FFFFFF; letter-spacing: 0.5px; margin: 0 0 6px 0;">${escapeHtml(flyer.headline)}</p>
            ${flyer.scriptSubheadline ? `<p data-field="scriptSubheadline" style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: 44px; color: #F0E2C0; line-height: 1; margin: 0 0 18px 0;">${escapeHtml(flyer.scriptSubheadline)}</p>` : ""}
            ${eventDateLine ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 6px auto 22px auto;">
              <tr>
                <td style="border-top: 1px solid rgba(255,255,255,0.3); border-bottom: 1px solid rgba(255,255,255,0.3); padding: 14px 26px;" align="center">
                  <p style="font-family: ${brand.fontHeadline}; font-size: 22px; color: #FFFFFF; letter-spacing: 1px; margin: 0;"><span data-field="eventDate">${escapeHtml(flyer.eventDate ?? "")}</span>${flyer.eventTime ? ` · <span data-field="eventTime">${escapeHtml(flyer.eventTime)}</span>` : ""}</p>
                  ${flyer.eventLocation ? `<p data-field="eventLocation" style="font-family: ${brand.fontBody}; font-size: 13px; letter-spacing: 4px; color: #E8DDC4; text-transform: uppercase; margin: 6px 0 0 0;">${escapeHtml(flyer.eventLocation)}</p>` : ""}
                </td>
              </tr>
            </table>` : ""}
            <p data-field="heroHook" style="font-family: ${brand.fontHeadline}; font-style: italic; font-size: 16px; line-height: 1.55; color: #E8DDC4; max-width: 460px; margin: 0 auto 24px auto;">${escapeHtml(flyer.heroHook)}</p>
            <a href="${escapeHtml(ctaHref)}" style="display:inline-block; background:${brand.accent}; color:${buttonTextColor("#FFFFFF", brand.accent)} !important; text-decoration:none; font-family: ${brand.fontBody}; font-size: 14px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; padding: 16px 36px;">${escapeHtml(ctaDisplayText)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const story = `
  <tr data-section="Story">
    <td style="padding: 44px 36px 12px 36px;">
      <p data-field="storyEyebrow" style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0 0 10px 0;">${escapeHtml(flyer.storyEyebrow)}</p>
      ${flyer.storyScriptTitle ? `<p data-field="storyScriptTitle" style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: 38px; color: ${brand.accent}; line-height: 1.1; margin: 0 0 10px 0;">${escapeHtml(flyer.storyScriptTitle)}</p>` : ""}
    </td>
  </tr>
  ${flyer.bodyParagraphs
    .map(
      (p, i) => `
  <tr data-section="Story">
    <td style="padding: 0 36px ${i === flyer.bodyParagraphs.length - 1 ? "28px" : "16px"} 36px;">
      <p data-field="bodyParagraphs.${i}" style="font-family: ${brand.fontBody}; font-size: 15px; line-height: 1.65; color: #3A3A3A; margin: 0;">${escapeHtml(p)}</p>
    </td>
  </tr>`,
    )
    .join("")}
  ${secondaryImg ? `
  <tr data-section="Secondary Image">
    <td style="padding: 0 36px 28px 36px;">
      <img src="${secondaryImg}" width="528" height="300" alt="${escapeHtml(flyer.secondaryImageAlt ?? "")}" style="display:block; width:100%; max-width:528px; height:auto; border:0;">
    </td>
  </tr>` : ""}
  `;

  const pullQuote = flyer.pullQuote
    ? `
  <tr data-section="Pull Quote">
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${brand.primary};">
        <tr>
          <td style="padding: 40px 36px;" align="center">
            ${flyer.pullQuoteEyebrow ? `<p data-field="pullQuoteEyebrow" style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #C8B98A; margin: 0 0 14px 0;">${escapeHtml(flyer.pullQuoteEyebrow)}</p>` : ""}
            <p data-field="pullQuote" style="font-family: ${brand.fontHeadline}; font-style: italic; font-size: 26px; line-height: 1.4; color: ${pickTextColor(brand.primary)}; margin: 0 auto; max-width: 460px;">${escapeHtml(flyer.pullQuote)}</p>
            ${flyer.pullQuoteAttribution ? `<p data-field="pullQuoteAttribution" style="font-family: ${brand.fontBody}; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #C8B98A; margin: 20px 0 0 0;">${escapeHtml(flyer.pullQuoteAttribution)}</p>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>`
    : "";

  // Gallery: 2- or 4-up grid of additional photos extracted from the flyer.
  // Sits between the pull-quote and the final CTA.
  const gallery = (() => {
    if (galleryImgs.length === 0) return "";

    // 1 image → single full-width row, 2 images → 2-up, 3 images → 3-up,
    // 4+ images → 2×2 grid for visual symmetry.
    const cols = galleryImgs.length === 3 ? 3 : galleryImgs.length === 1 ? 1 : 2;
    const cellWidth = Math.floor(528 / cols);
    // Tile dimensions: 4:3 for multi-col grids (images are pre-cropped server-side);
    // 16:9 for a single full-width image so it isn't too tall.
    const tileW = cellWidth - (cols > 1 ? 12 : 0);
    const tileH = cols === 1 ? Math.round(tileW * 9 / 16) : Math.round(tileW * 3 / 4);
    const rows: string[][] = [];
    for (let i = 0; i < galleryImgs.length; i += cols) {
      rows.push(galleryImgs.slice(i, i + cols));
    }

    return `
  <tr data-section="Photo Gallery">
    <td style="padding: 44px 36px 12px 36px;" align="center">
      <p data-field="galleryLabel" style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0;">${escapeHtml(flyer.galleryLabel ?? `A Look Around ${community.shortName}`)}</p>
    </td>
  </tr>
  <tr data-section="Photo Gallery">
    <td style="padding: 16px 36px 32px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: separate; border-spacing: 6px;">
        ${rows
          .map(
            (row) => `
        <tr>
          ${row
            .map(
              (src) => `
          <td valign="top" width="${tileW}" height="${tileH}" style="padding: 0; overflow:hidden; width:${tileW}px; height:${tileH}px; max-height:${tileH}px;">
            <img src="${src}" width="${tileW}" height="${tileH}" alt="${escapeHtml(community.displayName)}" style="display:block; width:${tileW}px; height:${tileH}px; object-fit:cover; border:0;">
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
            <p data-field="ctaEyebrow" style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #FBE2CD; margin: 0 0 12px 0;">${escapeHtml(flyer.ctaEyebrow)}</p>
            <p data-field="ctaHeadline" style="font-family: ${brand.fontHeadline}; font-size: 28px; color: #FFFFFF; line-height: 1.2; margin: 0 0 6px 0;">${escapeHtml(flyer.ctaHeadline)}</p>
            <p data-field="ctaSubline" style="font-family: ${brand.fontBody}; font-size: 13px; letter-spacing: 3px; color: #FBE2CD; text-transform: uppercase; margin: 0 0 26px 0;">${escapeHtml(flyer.ctaSubline)}</p>
            <a href="${escapeHtml(ctaHref)}" style="display:inline-block; background:${brand.primary}; color:${buttonTextColor("#FFFFFF", brand.primary)} !important; text-decoration:none; font-family: ${brand.fontBody}; font-size: 14px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; padding: 16px 36px;">${escapeHtml(ctaDisplayText)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const footerAddressDefault = `${community.address.street ?? ""} · ${community.address.city ?? ""}, ${community.address.state ?? ""} ${community.address.zip ?? ""}`;
  const footer = `
  <tr data-section="Footer">
    <td style="padding: 36px 36px 28px 36px;" align="center">
      <p data-field="footerName" style="font-family: ${brand.fontHeadline}; font-size: 18px; color: ${brand.primary}; letter-spacing: 1px; margin: 0 0 4px 0;">${escapeHtml(flyer.footerName ?? community.displayName)}</p>
      <p style="font-family: ${brand.fontBody}; font-size: 13px; color: #6B6B6B; line-height: 1.7; margin: 0;">
        <span data-field="footerAddress">${escapeHtml(flyer.footerAddress ?? footerAddressDefault)}</span><br>
        ${community.websiteUrl ? `<a href="${community.websiteUrl}" style="color: ${brand.accent}; text-decoration: none;">${escapeHtml(community.websiteUrl.replace(/^https?:\/\//, ""))}</a>` : ""}
        ${community.websiteUrl && community.email ? " · " : ""}
        ${community.email ? `<a href="mailto:${community.email}" style="color: ${brand.accent}; text-decoration: none;">${escapeHtml(community.email)}</a>` : ""}
      </p>
    </td>
  </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(flyer.subject)}</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: ${brand.fontHeadline};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f5; padding: 32px 0;">
  <tr><td align="center">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(flyer.previewText)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:100%; margin:0 auto; background:#ffffff;">
      ${header}
      ${hero}
      ${story}
      ${pullQuote}
      ${gallery}
      ${finalCta}
      ${footer}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
