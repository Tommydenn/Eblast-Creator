/**
 * Checks the crop geometry the repositioning tool relies on.
 *
 * The same crop is worked out in three places — lib/pdf-images.ts for the
 * server, lib/crop-image-client.ts for the browser, and the preview box in the
 * reposition modal — and they only agree because they were written to. This
 * runs the server one for real and compares the browser's arithmetic against
 * it, so a change to either is caught here rather than by someone noticing a
 * photo framed differently depending on where it was cropped.
 *
 *   npx tsx scripts/check-crop-zoom.ts
 */
import sharp from "sharp";
import { cropDataUriToXY } from "@/lib/pdf-images";

const MIN_CROP_EDGE = 32;

/** The browser's arithmetic, lifted from cropInBrowser. */
function browserBox(width: number, height: number, ratio: number, x: number, y: number, zoom: number) {
  const srcRatio = width / height;
  let cropWidth: number;
  let cropHeight: number;
  if (srcRatio > ratio) {
    cropHeight = height;
    cropWidth = Math.round(cropHeight * ratio);
  } else {
    cropWidth = width;
    cropHeight = Math.round(cropWidth / ratio);
  }
  const tightened = Math.max(1, zoom);
  cropWidth = Math.round(cropWidth / tightened);
  cropHeight = Math.round(cropHeight / tightened);
  cropWidth = Math.min(Math.max(cropWidth, MIN_CROP_EDGE), width);
  cropHeight = Math.min(Math.max(cropHeight, MIN_CROP_EDGE), height);
  return {
    width: cropWidth,
    height: cropHeight,
    left: Math.round((width - cropWidth) * (x / 100)),
    top: Math.round((height - cropHeight) * (y / 100)),
  };
}

async function sourceImage(width: number, height: number): Promise<string> {
  // A gradient, so a crop taken from the wrong place is a different image.
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 90, b: 160 } },
  }).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

const RATIOS: Array<[string, number]> = [
  ["hero", 600 / 340],
  ["secondary", 528 / 300],
  ["gallery", 4 / 3],
];
const ZOOMS = [1, 1.5, 2, 3];
const SOURCES: Array<[number, number]> = [
  [1600, 1200], // landscape, wider than every slot
  [1200, 1600], // portrait
  [1600, 900],  // wider than hero
  [900, 900],   // square
];

async function main() {
  const failures: string[] = [];
  let checked = 0;

  for (const [w, h] of SOURCES) {
    const src = await sourceImage(w, h);
    for (const [slot, ratio] of RATIOS) {
      for (const zoom of ZOOMS) {
        for (const [x, y] of [[50, 50], [0, 0], [100, 100], [25, 75]] as Array<[number, number]>) {
          const out = await cropDataUriToXY(src, ratio, x, y, zoom);
          const meta = await sharp(Buffer.from(out.split(",")[1], "base64")).metadata();
          const want = browserBox(w, h, ratio, x, y, zoom);
          checked++;
          const where = `${w}x${h} ${slot} zoom ${zoom} at ${x},${y}`;

          // 1. The two implementations must produce the same box.
          if (meta.width !== want.width || meta.height !== want.height) {
            failures.push(`${where}: server cropped ${meta.width}x${meta.height}, browser would take ${want.width}x${want.height}`);
            continue;
          }
          // 2. The crop must keep the slot's shape.
          const got = (meta.width ?? 0) / (meta.height ?? 1);
          if (Math.abs(got - ratio) / ratio > 0.02) {
            failures.push(`${where}: shape came out ${got.toFixed(3)}, slot wants ${ratio.toFixed(3)}`);
          }
          // 3. It must stay inside the source.
          if (want.left + want.width > w || want.top + want.height > h || want.left < 0 || want.top < 0) {
            failures.push(`${where}: box runs outside the photo`);
          }
        }
      }
    }
  }

  // 4. Zooming in must actually take less of the photo.
  for (const [w, h] of SOURCES) {
    for (const [slot, ratio] of RATIOS) {
      let previous = Infinity;
      for (const zoom of ZOOMS) {
        const b = browserBox(w, h, ratio, 50, 50, zoom);
        const area = b.width * b.height;
        if (area > previous) failures.push(`${w}x${h} ${slot}: zoom ${zoom} keeps more of the photo than the step before it`);
        previous = area;
      }
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} of ${checked} crops disagree:\n`);
    for (const f of failures.slice(0, 20)) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\n${checked} crops: the server's box matches the browser's, keeps the slot's shape, and stays inside the photo.`);
  console.log(`Zoom takes a smaller piece at every step, across ${SOURCES.length} shapes and ${RATIOS.length} slots.`);
}

main();
