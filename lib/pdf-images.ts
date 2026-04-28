// Extract embedded JPEG images directly from a PDF buffer.
//
// Most flyer PDFs (Adobe InDesign / Illustrator / Acrobat exports) embed
// photographs with the /DCTDecode filter — meaning the raw JPEG bytes sit
// in the PDF stream uncompressed. We can just scan for JPEG signatures
// (FF D8 FF ... FF D9), validate by walking JPEG markers, and pull out the
// bytes. No decoder, no canvas, no native deps. Works on Vercel.
//
// Fallback: if no JPEGs are found this way, we try pdfjs-dist's operator
// list extraction for non-JPEG image kinds.

import { PNG } from "pngjs";
import jpeg from "jpeg-js";

export interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  area: number;
  /** "rgb" if the source was a 3-component JPEG, "cmyk" if it was 4-component (re-encoded). */
  colorSource: "rgb" | "cmyk";
}

export interface ExtractionDiagnostic {
  method: "jpeg-scan" | "pdfjs-fallback" | "none";
  scannedJpegs: number;
  validJpegs: number;
  cmykConverted: number;
  cmykFailed: number;
  pdfjsImageRefs: number;
  pdfjsDecoded: number;
  errors: string[];
  inspected: Array<{ width?: number; height?: number; kind?: number; hasData?: boolean; hasBitmap?: boolean }>;
}

const MIN_AREA = 5_000;

// ---------- JPEG scanner -------------------------------------------------

interface JpegInfo {
  width: number;
  height: number;
  /** 1=grayscale, 3=YCbCr/RGB, 4=CMYK/YCCK */
  components: number;
}

function readJpegInfo(jpegBuf: Buffer): JpegInfo | null {
  let i = 2; // skip SOI (FF D8)
  while (i < jpegBuf.length - 8) {
    if (jpegBuf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = jpegBuf[i + 1];

    // Skip 0xFF padding
    if (marker === 0xff) {
      i++;
      continue;
    }
    // SOI/EOI/RST/standalone markers — no length
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }

    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof) {
      // SOF segment: marker(2) length(2) precision(1) height(2) width(2) components(1)
      const height = (jpegBuf[i + 5] << 8) | jpegBuf[i + 6];
      const width = (jpegBuf[i + 7] << 8) | jpegBuf[i + 8];
      const components = jpegBuf[i + 9];
      if (width > 0 && height > 0) return { width, height, components };
      return null;
    }

    if (i + 4 > jpegBuf.length) return null;
    const len = (jpegBuf[i + 2] << 8) | jpegBuf[i + 3];
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

// Backwards compat for the rest of this file.
function readJpegDimensions(jpegBuf: Buffer): { width: number; height: number } | null {
  const info = readJpegInfo(jpegBuf);
  return info ? { width: info.width, height: info.height } : null;
}

/**
 * Convert a CMYK (4-component) JPEG to an RGB PNG data URI.
 *
 * PDFs from Adobe InDesign / Illustrator store CMYK photos in YCCK or
 * Adobe-inverted CMYK. jpeg-js with `formatAsRGBA: false` already applies
 * the YCCK→CMYK transform (when needed) and outputs `255 - channel` for
 * each component, giving us straight CMYK values. We then run the standard
 * subtractive CMYK→RGB formula.
 */
function cmykJpegToRgbPng(jpegBuf: Buffer): { dataUri: string; width: number; height: number } | null {
  let decoded: any;
  try {
    // formatAsRGBA: false → jpeg-js outputs (255-C, 255-M, 255-Y, 255-K),
    // which after its own inversion equals the actual CMYK values.
    decoded = jpeg.decode(jpegBuf, { useTArray: true, formatAsRGBA: false } as any);
  } catch {
    return null;
  }
  const { width, height, data } = decoded;
  if (!width || !height || !data) return null;

  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const c = data[p * 4];
    const m = data[p * 4 + 1];
    const y = data[p * 4 + 2];
    const k = data[p * 4 + 3];

    // Standard subtractive CMYK → RGB
    rgba[p * 4] = Math.round(((255 - c) * (255 - k)) / 255);
    rgba[p * 4 + 1] = Math.round(((255 - m) * (255 - k)) / 255);
    rgba[p * 4 + 2] = Math.round(((255 - y) * (255 - k)) / 255);
    rgba[p * 4 + 3] = 255;
  }

  try {
    const png = new PNG({ width, height });
    png.data = rgba;
    const out = PNG.sync.write(png);
    return { dataUri: `data:image/png;base64,${out.toString("base64")}`, width, height };
  } catch {
    return null;
  }
}

/**
 * Walk the PDF buffer looking for valid JPEG SOI markers, then walk JPEG
 * markers from there to find the matching EOI. Returns each candidate
 * JPEG with its dimensions parsed from the SOF segment.
 */
function findJpegStreams(buf: Buffer): Array<{ data: Buffer; width: number; height: number }> {
  const results: Array<{ data: Buffer; width: number; height: number }> = [];
  const seenStarts = new Set<number>();
  let i = 0;

  while (i < buf.length - 4) {
    // Look for SOI (FF D8) followed by another marker (FF Xn)
    if (buf[i] !== 0xff || buf[i + 1] !== 0xd8 || buf[i + 2] !== 0xff) {
      i++;
      continue;
    }

    const startMarker = buf[i + 3];
    // Plausible "next-after-SOI" markers: APPn (E0-EF), DQT (DB), SOFx (C0/C2),
    // DHT (C4), COM (FE). This filters out random FF D8 FF byte sequences in
    // compressed streams that aren't real JPEGs.
    const looksLikeJpeg =
      (startMarker >= 0xe0 && startMarker <= 0xef) ||
      startMarker === 0xdb ||
      startMarker === 0xc0 ||
      startMarker === 0xc2 ||
      startMarker === 0xc4 ||
      startMarker === 0xfe;

    if (!looksLikeJpeg || seenStarts.has(i)) {
      i++;
      continue;
    }
    seenStarts.add(i);

    // Walk markers to find EOI
    let j = i + 2;
    let foundEnd = -1;
    while (j < buf.length - 1) {
      if (buf[j] !== 0xff) {
        j++;
        continue;
      }
      // Skip 0xFF padding bytes
      let k = j + 1;
      while (k < buf.length && buf[k] === 0xff) k++;
      const m = buf[k];
      if (m === undefined) break;

      if (m === 0xd9) {
        foundEnd = k;
        break;
      }
      // Standalone markers: 0x00 (stuffed), RST D0-D7
      if (m === 0x00 || (m >= 0xd0 && m <= 0xd7)) {
        j = k + 1;
        continue;
      }
      // SOS (DA) — the entropy-coded image data follows. Walk byte-by-byte
      // looking for the next marker (0xFF followed by non-stuffed, non-zero).
      if (m === 0xda) {
        // length-prefixed SOS header
        if (k + 3 > buf.length) break;
        const sosLen = (buf[k + 1] << 8) | buf[k + 2];
        let p = k + 1 + sosLen;
        while (p < buf.length - 1) {
          if (buf[p] === 0xff && buf[p + 1] !== 0x00 && buf[p + 1] < 0xd0) {
            // restart markers (D0-D7) are inside the entropy stream — skip
            j = p;
            break;
          }
          if (buf[p] === 0xff && buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7) {
            p += 2;
            continue;
          }
          if (buf[p] === 0xff && buf[p + 1] === 0xd9) {
            foundEnd = p + 1;
            j = p;
            break;
          }
          p++;
        }
        if (foundEnd >= 0) break;
        if (p >= buf.length - 1) break;
        continue;
      }
      // Length-prefixed segments
      if (k + 3 > buf.length) break;
      const len = (buf[k + 1] << 8) | buf[k + 2];
      if (len < 2) break;
      j = k + 1 + len;
    }

    if (foundEnd > i) {
      const jpegSlice = buf.subarray(i, foundEnd + 1);
      const dims = readJpegDimensions(jpegSlice);
      if (dims && dims.width * dims.height >= MIN_AREA) {
        results.push({ data: Buffer.from(jpegSlice), width: dims.width, height: dims.height });
      }
      i = foundEnd + 1;
    } else {
      i++;
    }
  }

  return results;
}

function dedupeBySize(images: Array<{ data: Buffer; width: number; height: number }>): typeof images {
  const seen = new Set<number>();
  return images.filter((img) => {
    if (seen.has(img.data.length)) return false;
    seen.add(img.data.length);
    return true;
  });
}

// ---------- pdfjs fallback (non-JPEG only) -------------------------------

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

async function extractViaPdfjs(
  pdfBuffer: Buffer,
  diag: ExtractionDiagnostic,
): Promise<ExtractedImage[]> {
  let pdfjs: any;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (e: any) {
    diag.errors.push(`pdfjs import failed: ${e.message}`);
    return [];
  }

  let doc: any;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;
  } catch (e: any) {
    diag.errors.push(`pdfjs getDocument: ${e.message}`);
    return [];
  }

  const out: ExtractedImage[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum).catch(() => null);
    if (!page) continue;
    const ops = await page.getOperatorList().catch(() => null);
    if (!ops) continue;

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintJpegXObject) continue;
      diag.pdfjsImageRefs++;

      const objId = ops.argsArray[i][0];
      const img: any = await new Promise((resolve) => {
        try {
          page.objs.get(objId, (i: any) => resolve(i ?? null));
        } catch {
          resolve(null);
        }
      });
      if (!img) continue;

      diag.inspected.push({
        width: img.width,
        height: img.height,
        kind: img.kind,
        hasData: !!img.data,
        hasBitmap: !!img.bitmap,
      });

      if (!img.data || !img.width || !img.height) continue;
      if (img.width * img.height < MIN_AREA) continue;

      let rgba: Buffer;
      try {
        if (img.kind === 3) rgba = Buffer.from(img.data);
        else if (img.kind === 2) rgba = expandRgbToRgba(img.data, img.width, img.height);
        else continue;
      } catch {
        continue;
      }

      try {
        const png = new PNG({ width: img.width, height: img.height });
        png.data = rgba;
        const buffer = PNG.sync.write(png);
        out.push({
          dataUri: `data:image/png;base64,${buffer.toString("base64")}`,
          width: img.width,
          height: img.height,
          area: img.width * img.height,
          colorSource: "rgb",
        });
        diag.pdfjsDecoded++;
      } catch (e: any) {
        diag.errors.push(`pdfjs encode: ${e.message}`);
      }
    }
  }
  return out;
}

// ---------- public entry point -------------------------------------------

export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
): Promise<{ images: ExtractedImage[]; diagnostic: ExtractionDiagnostic }> {
  const diag: ExtractionDiagnostic = {
    method: "none",
    scannedJpegs: 0,
    validJpegs: 0,
    cmykConverted: 0,
    cmykFailed: 0,
    pdfjsImageRefs: 0,
    pdfjsDecoded: 0,
    errors: [],
    inspected: [],
  };

  // Primary: scan for embedded JPEGs.
  let rawJpegs: Array<{ data: Buffer; width: number; height: number }> = [];
  try {
    rawJpegs = findJpegStreams(pdfBuffer);
    diag.scannedJpegs = rawJpegs.length;
    rawJpegs = dedupeBySize(rawJpegs);
    diag.validJpegs = rawJpegs.length;
  } catch (e: any) {
    diag.errors.push(`jpeg-scan: ${e.message}`);
  }

  if (rawJpegs.length > 0) {
    diag.method = "jpeg-scan";
    const images: ExtractedImage[] = [];
    for (const j of rawJpegs) {
      const info = readJpegInfo(j.data);
      if (info && info.components === 4) {
        // CMYK / YCCK — decode and convert to RGB PNG
        const converted = cmykJpegToRgbPng(j.data);
        if (converted) {
          images.push({
            dataUri: converted.dataUri,
            width: converted.width,
            height: converted.height,
            area: converted.width * converted.height,
            colorSource: "cmyk",
          });
          diag.cmykConverted++;
        } else {
          diag.cmykFailed++;
          diag.errors.push(`CMYK conversion failed for ${j.width}x${j.height} JPEG`);
        }
      } else {
        // 3-component RGB JPEG — pass through as-is
        images.push({
          dataUri: `data:image/jpeg;base64,${j.data.toString("base64")}`,
          width: j.width,
          height: j.height,
          area: j.width * j.height,
          colorSource: "rgb",
        });
      }
    }
    images.sort((a, b) => b.area - a.area);
    return { images, diagnostic: diag };
  }

  // Fallback: pdfjs operator-list extraction (catches PNG / non-JPEG images).
  const fromPdfjs = await extractViaPdfjs(pdfBuffer, diag);
  if (fromPdfjs.length > 0) {
    diag.method = "pdfjs-fallback";
    return { images: fromPdfjs.sort((a, b) => b.area - a.area), diagnostic: diag };
  }

  return { images: [], diagnostic: diag };
}
