import { readFileSync } from "fs";
const sharp = (await import("sharp")).default;

const src = "C:/Users/JonWalls/Desktop/Branding for GLM Communities/Global Pointe/Logos & Branding/Logos/Global Pointe Logo.png";
const img = sharp(readFileSync(src));

// Keep near-native size so dot colors aren't blurred out
const { data } = await img
  .resize(600, 337, { fit: "fill" })
  .flatten({ background: "#FFFFFF" })
  .raw()
  .toBuffer({ resolveWithObject: true });

// Bucket into 12-bit color groups to cluster similar shades
const buckets = new Map();
for (let i = 0; i < data.length; i += 3) {
  const r = data[i], g = data[i+1], b = data[i+2];
  if (r > 230 && g > 230 && b > 230) continue; // skip near-white
  // Round to nearest 16 to group similar colors
  const rr = Math.round(r/16)*16, gg = Math.round(g/16)*16, bb = Math.round(b/16)*16;
  const key = `${rr},${gg},${bb}`;
  if (!buckets.has(key)) buckets.set(key, { r: 0, g: 0, b: 0, n: 0 });
  const e = buckets.get(key);
  e.r += r; e.g += g; e.b += b; e.n++;
}

// Average each bucket and sort by frequency
const sorted = [...buckets.values()]
  .sort((a, b) => b.n - a.n)
  .slice(0, 12)
  .map(e => {
    const r = Math.round(e.r/e.n), g = Math.round(e.g/e.n), b = Math.round(e.b/e.n);
    return { hex: `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`.toUpperCase(), n: e.n, r, g, b };
  });

console.log("Dominant color clusters (non-white):");
for (const c of sorted) {
  console.log(`  ${c.hex}  pixels=${c.n}  rgb(${c.r},${c.g},${c.b})`);
}
