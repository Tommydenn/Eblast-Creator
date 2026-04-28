// Extract embedded images from a PDF buffer.
//
// Uses pdfjs-dist's legacy Node-friendly build to walk each page's operator
// list, finds every image XObject, decodes the raw bitmap into RGBA, and
// re-encodes as PNG via pngjs. Returns sorted by area, largest first.
//
// Heuristic: we treat the largest image as the hero, second-largest as the
// inline. Tiny images (logos, icons) are filtered by a minimum-area threshold
// so they don't accidentally become the hero.

import { PNG } from "pngjs";

export interface ExtractedImage {
  /** data: URI suitable for embedding directly in email HTML. */
  dataUri: string;
  width: number;
  height: number;
  /** Pixel area — width × height. Used for ranking. */
  area: number;
}

const MIN_AREA = 40_000; // ~200×200 — discards logos and small icons
const MAX_OUTPUT_DIMENSION = 1200; // downscale anything wider/taller than this

function fnv1aHash(buffer: Uint8Array | Uint8ClampedArray): string {
  // Fast non-cryptographic hash so we can dedupe images that appear on
  // multiple pages. Walks at most the first 8KB to keep it cheap.
  let h = 0x811c9dc5;
  const len = Math.min(buffer.length, 8192);
  for (let i = 0; i < len; i++) {
    h ^= buffer[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function expandRgbToRgba(rgb: Uint8Array | Uint8ClampedArray, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    out[p * 4] = rgb[p * 3];
    out[p * 4 + 1] = rgb[p * 3 + 1];
    out[p * 4 + 2] = rgb[p * 3 + 2];
    out[p * 4 + 3] = 255;
  }
  return out;
}

function expandGrayscale1Bpp(data: Uint8Array | Uint8ClampedArray, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const byte = data[Math.floor(p / 8)];
    const bit = (byte >> (7 - (p % 8))) & 1;
    const v = bit ? 255 : 0;
    out[p * 4] = v;
    out[p * 4 + 1] = v;
    out[p * 4 + 2] = v;
    out[p * 4 + 3] = 255;
  }
  return out;
}

function downscaleNN(rgba: Buffer, width: number, height: number, maxDim: number): { rgba: Buffer; width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { rgba, width, height };
  const scale = Math.min(maxDim / width, maxDim / height);
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);
  const out = Buffer.alloc(newW * newH * 4);
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * newW + x) * 4;
      out[dstIdx] = rgba[srcIdx];
      out[dstIdx + 1] = rgba[srcIdx + 1];
      out[dstIdx + 2] = rgba[srcIdx + 2];
      out[dstIdx + 3] = rgba[srcIdx + 3];
    }
  }
  return { rgba: out, width: newW, height: newH };
}

export async function extractImagesFromPdf(pdfBuffer: Buffer): Promise<ExtractedImage[]> {
  // Dynamic import because pdfjs-dist v4 is ESM and we want it kept out of the
  // bundle when the route isn't called.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const seenHashes = new Set<string>();
  const out: ExtractedImage[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const ops = await page.getOperatorList();

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const isImageOp = fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintJpegXObject;
      if (!isImageOp) continue;

      const objId = ops.argsArray[i][0];

      let img: any;
      try {
        img = await new Promise((resolve, reject) => {
          page.objs.get(objId, (resolved: any) => {
            if (resolved) resolve(resolved);
            else reject(new Error("no image data"));
          });
        });
      } catch {
        continue;
      }

      if (!img || !img.data || !img.width || !img.height) continue;
      const { width, height, data, kind } = img;
      const area = width * height;
      if (area < MIN_AREA) continue;

      const hash = fnv1aHash(data);
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      // pdfjs ImageKind: 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP
      let rgba: Buffer;
      try {
        if (kind === 3) rgba = Buffer.from(data);
        else if (kind === 2) rgba = expandRgbToRgba(data, width, height);
        else if (kind === 1) rgba = expandGrayscale1Bpp(data, width, height);
        else continue;
      } catch {
        continue;
      }

      const scaled = downscaleNN(rgba, width, height, MAX_OUTPUT_DIMENSION);
      try {
        const png = new PNG({ width: scaled.width, height: scaled.height });
        png.data = scaled.rgba;
        const buffer = PNG.sync.write(png);
        const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;
        out.push({ dataUri, width: scaled.width, height: scaled.height, area });
      } catch {
        // skip if PNG encoding fails
      }
    }
  }

  return out.sort((a, b) => b.area - a.area);
}
