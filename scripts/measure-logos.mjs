// Records the pixel size of every logo file under public/logos as
// lib/logo-dimensions.json, keyed by the URL the community record uses.
//
// The email header sizes each logo to fit a box, and email clients need the
// width and height written on the <img> — Outlook shows the file at natural
// size otherwise, thousands of pixels wide. The renderer runs in the browser
// too, where it cannot read files, so the sizes are looked up from this map.
//
// Re-run after adding or replacing a logo:  node scripts/measure-logos.mjs
import sharp from "sharp";
import fs from "fs";
import path from "path";
const root = "public/logos";
const out = {};
for (const slug of fs.readdirSync(root).sort()) {
  const dir = path.join(root, slug);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
    const { width, height } = await sharp(path.join(dir, file)).metadata();
    out[`/logos/${slug}/${file}`] = { width, height };
  }
}
fs.writeFileSync("lib/logo-dimensions.json", JSON.stringify(out, null, 2) + "\n");
console.log(`measured ${Object.keys(out).length} logo files -> lib/logo-dimensions.json`);
