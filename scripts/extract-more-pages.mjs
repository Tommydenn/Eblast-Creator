// Renders specific page ranges from brand guides that need deeper extraction
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = "C:/Users/JonWalls/Desktop/Branding for GLM Communities";
const OUT = "C:/Users/JonWalls/Projects/Eblast-Creator/scripts/brand-pages";

const TARGETS = [
  // Amira: color palette is on page 19, typography ~27. Render pages 13-28.
  {
    name: "Amira_Choice",
    path: `${BASE}/Amira Choice Arvada/Logos & Branding/Amira Choice - Branding/Amira_BrandGuidelines_Updated_July2025_11x8.5_Final_Email.pdf`,
    startPage: 13,
    endPage: 28,
    scale: 1.5,
  },
  // Pillars: color page likely on page 7-10
  {
    name: "Pillars",
    path: `${BASE}/Pillars - Grand Rapids/Logos & Branding/POGR_Styleguide_2023.pdf`,
    startPage: 7,
    endPage: 12,
    scale: 1.5,
  },
  // Global Pointe: only 1 page - re-render at 3x for readability
  {
    name: "Global_Pointe_HiRes",
    path: `${BASE}/Global Pointe/Logos & Branding/Global Pointe Branding.pdf`,
    startPage: 1,
    endPage: 1,
    scale: 3.0,
  },
];

const mupdfModule = await import("mupdf");
const mupdf = mupdfModule.default ?? mupdfModule;

for (const target of TARGETS) {
  try {
    const buf = readFileSync(target.path);
    const doc = mupdf.Document.openDocument(buf, "application/pdf");
    const pageCount = doc.countPages();
    console.log(`${target.name}: ${pageCount} total pages`);

    const start = Math.min(target.startPage, pageCount) - 1; // 0-indexed
    const end = Math.min(target.endPage, pageCount) - 1;

    for (let i = start; i <= end; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(target.scale, target.scale),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true
      );
      const png = pixmap.asPNG();
      const outPath = join(OUT, `${target.name}_p${i + 1}.png`);
      writeFileSync(outPath, png);
      pixmap.destroy();
      page.destroy();
      console.log(`  saved p${i + 1}`);
    }
    doc.destroy();
  } catch (e) {
    console.error(`ERROR ${target.name}: ${e.message}`);
  }
}

console.log("Done.");
