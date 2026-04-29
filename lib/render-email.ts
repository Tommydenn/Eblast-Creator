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

  // Component fragments — kept as inline HTML because email clients reward redundancy
  // and table-based layouts. CSS variables/classes don't survive Outlook.
  const header = `
  <tr>
    <td style="padding: 28px 36px 22px 36px;" align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="left" valign="middle">
            <span style="font-family: ${brand.fontHeadline}; font-size: 22px; color: ${brand.primary}; letter-spacing: 1px;">${escapeHtml(community.shortName)}</span>
            ${community.shortName !== community.displayName ? `<span style="font-family: ${brand.fontBody}; font-size: 10px; letter-spacing: 4px; color: ${brand.accent}; text-transform: uppercase; margin-left: 6px;">${escapeHtml(community.displayName.replace(community.shortName, "").trim())}</span>` : ""}
          </td>
          <td align="right" valign="middle" style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: #6B6B6B;">
            ${escapeHtml(community.type.replace(/_/g, " "))}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const hero = `
  <tr>
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
            <p style="font-family: ${brand.fontBody}; font-size: 13px; letter-spacing: 4px; color: #C8B98A; text-transform: uppercase; margin: 0 0 12px 0;">${escapeHtml(flyer.eyebrow)}</p>
            <p style="font-family: ${brand.fontHeadline}; font-size: 36px; line-height:1.1; color: #FFFFFF; letter-spacing: 0.5px; margin: 0 0 6px 0;">${escapeHtml(flyer.headline)}</p>
            ${flyer.scriptSubheadline ? `<p style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: 44px; color: #F0E2C0; line-height: 1; margin: 0 0 18px 0;">${escapeHtml(flyer.scriptSubheadline)}</p>` : ""}
            ${eventDateLine ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 6px auto 22px auto;">
              <tr>
                <td style="border-top: 1px solid rgba(255,255,255,0.3); border-bottom: 1px solid rgba(255,255,255,0.3); padding: 14px 26px;" align="center">
                  <p style="font-family: ${brand.fontHeadline}; font-size: 22px; color: #FFFFFF; letter-spacing: 1px; margin: 0;">${escapeHtml(flyer.eventDate ?? "")}</p>
                  ${flyer.eventTime ? `<p style="font-family: ${brand.fontBody}; font-size: 13px; letter-spacing: 4px; color: #E8DDC4; text-transform: uppercase; margin: 6px 0 0 0;">${escapeHtml(flyer.eventTime)}${flyer.eventLocation ? " · " + escapeHtml(flyer.eventLocation) : ""}</p>` : ""}
                </td>
              </tr>
            </table>` : ""}
            <p style="font-family: ${brand.fontHeadline}; font-style: italic; font-size: 16px; line-height: 1.55; color: #E8DDC4; max-width: 460px; margin: 0 auto 24px auto;">${escapeHtml(flyer.heroHook)}</p>
            <a href="${escapeHtml(flyer.ctaButtonHref)}" style="display:inline-block; background:${brand.accent}; color:#FFFFFF !important; text-decoration:none; font-family: ${brand.fontBody}; font-size: 14px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; padding: 16px 36px;">${escapeHtml(flyer.ctaButtonLabel)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const story = `
  <tr>
    <td style="padding: 44px 36px 12px 36px;">
      <p style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0 0 10px 0;">${escapeHtml(flyer.storyEyebrow)}</p>
      ${flyer.storyScriptTitle ? `<p style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-style: italic; font-size: 38px; color: ${brand.accent}; line-height: 1.1; margin: 0 0 10px 0;">${escapeHtml(flyer.storyScriptTitle)}</p>` : ""}
    </td>
  </tr>
  ${flyer.bodyParagraphs
    .map(
      (p, i) => `
  <tr>
    <td style="padding: 0 36px ${i === flyer.bodyParagraphs.length - 1 ? "28px" : "16px"} 36px;">
      <p style="font-family: ${brand.fontBody}; font-size: 15px; line-height: 1.65; color: #3A3A3A; margin: 0;">${escapeHtml(p)}</p>
    </td>
  </tr>`,
    )
    .join("")}
  ${secondaryImg ? `
  <tr>
    <td style="padding: 0 36px 28px 36px;">
      <img src="${secondaryImg}" width="528" height="300" alt="${escapeHtml(flyer.secondaryImageAlt ?? "")}" style="display:block; width:100%; max-width:528px; height:auto; border:0;">
    </td>
  </tr>` : ""}
  `;

  const pullQuote = flyer.pullQuote
    ? `
  <tr>
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${brand.primary};">
        <tr>
          <td style="padding: 40px 36px;" align="center">
            ${flyer.pullQuoteEyebrow ? `<p style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #C8B98A; margin: 0 0 14px 0;">${escapeHtml(flyer.pullQuoteEyebrow)}</p>` : ""}
            <p style="font-family: ${brand.fontHeadline}; font-style: italic; font-size: 26px; line-height: 1.4; color: ${brand.background}; margin: 0 auto; max-width: 460px;">${escapeHtml(flyer.pullQuote)}</p>
            ${flyer.pullQuoteAttribution ? `<p style="font-family: ${brand.fontBody}; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #C8B98A; margin: 20px 0 0 0;">${escapeHtml(flyer.pullQuoteAttribution)}</p>` : ""}
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
    const rows: string[][] = [];
    for (let i = 0; i < galleryImgs.length; i += cols) {
      rows.push(galleryImgs.slice(i, i + cols));
    }

    const eyebrow = flyer.eventLocation || community.displayName;

    return `
  <tr>
    <td style="padding: 44px 36px 12px 36px;" align="center">
      <p style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${brand.accent}; font-weight: 700; margin: 0;">A Look Around ${escapeHtml(community.shortName)}</p>
    </td>
  </tr>
  <tr>
    <td style="padding: 16px 36px 32px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: separate; border-spacing: 6px;">
        ${rows
          .map(
            (row) => `
        <tr>
          ${row
            .map(
              (src) => `
          <td valign="top" width="${cellWidth - 12}" style="padding: 0;">
            <img src="${src}" width="${cellWidth - 12}" alt="${escapeHtml(community.displayName)}" style="display:block; width:100%; max-width:${cellWidth - 12}px; height:auto; border:0;">
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
  <tr>
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${brand.accent};">
        <tr>
          <td style="padding: 40px 36px;" align="center">
            <p style="font-family: ${brand.fontBody}; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: #FBE2CD; margin: 0 0 12px 0;">${escapeHtml(flyer.ctaEyebrow)}</p>
            <p style="font-family: ${brand.fontHeadline}; font-size: 28px; color: #FFFFFF; line-height: 1.2; margin: 0 0 6px 0;">${escapeHtml(flyer.ctaHeadline)}</p>
            <p style="font-family: ${brand.fontBody}; font-size: 13px; letter-spacing: 3px; color: #FBE2CD; text-transform: uppercase; margin: 0 0 26px 0;">${escapeHtml(flyer.ctaSubline)}</p>
            <a href="${escapeHtml(flyer.ctaButtonHref)}" style="display:inline-block; background:${brand.background}; color:${brand.accent} !important; text-decoration:none; font-family: ${brand.fontBody}; font-size: 14px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; padding: 16px 36px;">${escapeHtml(flyer.ctaButtonLabel)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const footer = `
  <tr>
    <td style="padding: 36px 36px 28px 36px;" align="center">
      <p style="font-family: ${brand.fontHeadline}; font-size: 18px; color: ${brand.primary}; letter-spacing: 1px; margin: 0 0 4px 0;">${escapeHtml(community.displayName)}</p>
      <p style="font-family: ${brand.fontBody}; font-size: 13px; color: #6B6B6B; line-height: 1.7; margin: 0;">
        ${escapeHtml(community.address.street ?? "")} · ${escapeHtml(community.address.city ?? "")}, ${escapeHtml(community.address.state ?? "")} ${escapeHtml(community.address.zip ?? "")}<br>
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
<body style="margin:0; padding:0; background:#EDE5D2; font-family: ${brand.fontHeadline};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#EDE5D2; padding: 32px 0;">
  <tr><td align="center">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(flyer.previewText)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:100%; margin:0 auto; background:${brand.background};">
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
