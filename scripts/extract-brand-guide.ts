// CLI: extract a brand guide PDF and write the structured fields onto a
// community in Postgres.
//
// Usage: npx tsx scripts/extract-brand-guide.ts <community-slug> <path/to/brand-guide.pdf>
//
// Behavior:
//   - Reads the PDF from disk.
//   - Calls Claude with the brand-guide extractor.
//   - Updates the community's `brand` (palette + fonts), `voice`, `taglines`,
//     `amenities`, and stashes the full extraction in `brandGuideExtracted`
//     for forensics / re-processing later.
//   - Marks brand.paletteSource = "brand-guide-extracted" and
//     fontsSource = "brand-guide-extracted" so we know this isn't a placeholder.

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/index";
import { communities } from "../lib/db/schema";
import { getCommunity } from "../lib/db/queries";
import { extractBrandGuide } from "../lib/brand-guide-extractor";
import type { CommunityBrand, BrandGuideExtracted, CommunityVoice } from "../lib/db/schema";

async function main() {
  const [slug, pdfPath] = process.argv.slice(2);
  if (!slug || !pdfPath) {
    console.error("Usage: tsx scripts/extract-brand-guide.ts <community-slug> <path/to/pdf>");
    process.exit(1);
  }

  const community = await getCommunity(slug);
  if (!community) {
    console.error(`Community not found: ${slug}`);
    process.exit(1);
  }

  console.log(`Reading ${pdfPath}...`);
  const pdfBuffer = readFileSync(pdfPath);
  console.log(`PDF size: ${pdfBuffer.length} bytes`);

  console.log(`Extracting brand attributes via Claude (this takes ~20-60s)...`);
  const extraction = await extractBrandGuide({
    pdfBase64: pdfBuffer.toString("base64"),
    community,
  });

  console.log("\n=== Extraction result ===");
  console.log(JSON.stringify(extraction, null, 2));

  // Compose updated brand object — preserve any manual overrides where the
  // extraction is silent.
  const updatedBrand: CommunityBrand = {
    primary: extraction.palette.primary ?? community.brand.primary,
    accent: extraction.palette.accent ?? community.brand.accent,
    background: extraction.palette.background ?? community.brand.background,
    secondary: extraction.palette.secondary ?? community.brand.secondary,
    supporting: extraction.palette.supporting ?? community.brand.supporting,
    textOnPrimary: extraction.palette.textOnPrimary ?? community.brand.textOnPrimary,
    textOnAccent: extraction.palette.textOnAccent ?? community.brand.textOnAccent,
    fontHeadline: extraction.fonts.display
      ? `${extraction.fonts.display.name}${extraction.fonts.display.fallback ? ", " + extraction.fonts.display.fallback : ", serif"}`
      : community.brand.fontHeadline,
    fontBody: extraction.fonts.body
      ? `${extraction.fonts.body.name}${extraction.fonts.body.fallback ? ", " + extraction.fonts.body.fallback : ", sans-serif"}`
      : community.brand.fontBody,
    fonts: {
      display: extraction.fonts.display
        ? {
            name: extraction.fonts.display.name,
            fallback: extraction.fonts.display.fallback ?? "serif",
            weights: extraction.fonts.display.weights,
          }
        : community.brand.fonts?.display,
      body: extraction.fonts.body
        ? {
            name: extraction.fonts.body.name,
            fallback: extraction.fonts.body.fallback ?? "sans-serif",
            weights: extraction.fonts.body.weights,
          }
        : community.brand.fonts?.body,
      script: extraction.fonts.script
        ? {
            name: extraction.fonts.script.name,
            fallback: extraction.fonts.script.fallback ?? "cursive",
          }
        : community.brand.fonts?.script,
    },
    paletteSource: "brand-guide-extracted",
    fontsSource: "brand-guide-extracted",
  };

  // Build/merge voice. Prefer extraction values; merge approvedClaims unioned
  // with anything already manually set.
  const updatedVoice: CommunityVoice = {
    tone: extraction.voice.tone ?? community.voice?.tone,
    dos: extraction.voice.dos ?? community.voice?.dos,
    donts: extraction.voice.donts ?? community.voice?.donts,
    prohibited: extraction.voice.prohibited ?? community.voice?.prohibited,
    approvedClaims: extraction.voice.approvedClaims ?? community.voice?.approvedClaims,
    photoStyleNotes: extraction.voice.photoStyleNotes ?? community.voice?.photoStyleNotes,
  };

  // Forensics blob — full extraction snapshot.
  const brandGuideExtracted: BrandGuideExtracted = {
    extractedAt: new Date().toISOString(),
    palette: extraction.palette,
    fonts: updatedBrand.fonts,
    voice: updatedVoice,
    notes: extraction.applicationNotes,
    raw: extraction,
  };

  const updatedTaglines = extraction.taglines.length > 0 ? extraction.taglines : community.taglines;
  const updatedAmenities = extraction.amenities.length > 0 ? extraction.amenities : community.amenities;

  await db
    .update(communities)
    .set({
      brand: updatedBrand,
      voice: updatedVoice,
      taglines: updatedTaglines,
      amenities: updatedAmenities,
      brandGuideExtracted,
      updatedAt: new Date(),
    })
    .where(eq(communities.id, community.id));

  console.log(`\n  Updated ${slug}.`);
  console.log(`    palette source: brand-guide-extracted`);
  console.log(`    primary:    ${updatedBrand.primary}`);
  console.log(`    accent:     ${updatedBrand.accent}`);
  console.log(`    background: ${updatedBrand.background}`);
  console.log(`    headline font: ${updatedBrand.fontHeadline}`);
  console.log(`    body font:     ${updatedBrand.fontBody}`);
  console.log(`    voice tone:    ${(updatedVoice.tone ?? []).join(", ") || "(none)"}`);
  console.log(`    voice dos:     ${(updatedVoice.dos ?? []).length} entries`);
  console.log(`    voice donts:   ${(updatedVoice.donts ?? []).length} entries`);
  console.log(`    prohibited:    ${(updatedVoice.prohibited ?? []).length} entries`);
  console.log(`    approved claims: ${(updatedVoice.approvedClaims ?? []).length} entries`);
  console.log(`    taglines:      ${(updatedTaglines ?? []).length}`);
  console.log(`    amenities:     ${(updatedAmenities ?? []).length}`);
  console.log(`    logo variants noted: ${extraction.logoVariants.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Brand-guide extraction failed:", e);
    process.exit(1);
  });
