// Renders each brand guide PDF to PNG images so we can visually read the colors.
// Usage: node scripts/extract-brand-colors.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const BASE = "C:/Users/JonWalls/Desktop/Branding for GLM Communities";

const GUIDES = [
  { name: "Global Pointe",   path: `${BASE}/Global Pointe/Logos & Branding/Global Pointe Branding.pdf` },
  { name: "Seven Hills",     path: `${BASE}/Seven Hills/Logos & Branding/SHSL_Brand-Identity.pdf` },
  { name: "Pillars",         path: `${BASE}/Pillars - Grand Rapids/Logos & Branding/POGR_Styleguide_2023.pdf` },
  { name: "Hayden Grove",    path: `${BASE}/Hayden Grove Bloomington/Logos and Branding/Hayden-Grove_brand-guide_012020.pdf` },
  { name: "The Glenn",       path: `${BASE}/The Glenn - West St. Paul/Marketing/The Glenn - All Locations - Brand Guide - v3.pdf` },
  { name: "Amira Choice",    path: `${BASE}/Amira Choice Arvada/Logos & Branding/Amira Choice - Branding/Amira_BrandGuidelines_Updated_July2025_11x8.5_Final_Email.pdf` },
  { name: "Talamore",        path: `${BASE}/Talamore St Cloud/Logos & Branding/Talamore 2026.pdf` },
  { name: "Caretta",         path: `${BASE}/Caretta Bellevue/Logos & Branding/Caretta Branding & Guidelines/Caretta_BrandGuide_FINAL.pdf` },
  { name: "Orchards",        path: `${BASE}/Orchards Minnetonka/Logos & Branding/Logos/Orchards of MNTKA Horiz Logo.pdf` },
];

const OUT = "C:/Users/JonWalls/Projects/Eblast-Creator/scripts/brand-pages";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const mupdfModule = await import("mupdf");
const mupdf = mupdfModule.default ?? mupdfModule;

for (const guide of GUIDES) {
  try {
    const buf = readFileSync(guide.path);
    const doc = mupdf.Document.openDocument(buf, "application/pdf");
    const pageCount = doc.countPages();
    console.log(`${guide.name}: ${pageCount} pages`);

    // Render up to 6 pages (color pages are usually in the first few)
    const limit = Math.min(pageCount, 6);
    for (let i = 0; i < limit; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = pixmap.asPNG();
      const outPath = join(OUT, `${guide.name.replace(/\s+/g, "_")}_p${i + 1}.png`);
      writeFileSync(outPath, png);
      pixmap.destroy();
      page.destroy();
    }
    doc.destroy();
    console.log(`  → saved ${limit} pages to ${OUT}`);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
  }
}

console.log("\nDone.");
