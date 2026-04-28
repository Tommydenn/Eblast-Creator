// Extract embedded images from a PDF buffer.
//
// Uses pdfjs-dist's legacy Node-friendly build to walk each page's operator
// list, finds every image XObject, decodes the raw bitmap into RGBA, and
// re-encodes as PNG via pngjs.

import { PNG } from "pngjs";

export interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  area: number;
}

export interface ExtractionDiagnostic {
  pageCount: number;
  imageRefsFound: number;     // how many paintImage* ops we saw
  decoded: number;            // how many we successfully turned into a PNG
  skippedNoData: number;      // image objects that had no usable data
  skippedTooSmall: number;
  skippedUnknownKind: number;
  skippedDuplicate: number;
  errors: string[];
  // Per-image debug — useful for figuring out what kind of compression a tricky PDF uses.
  inspected: Array<{ width?: number; height?: number; kind?: number; hasData?: boolean; hasBitmap?: boolean }>;
}

const MIN_AREA = 5_000; // ~70×70 — cuts logos/icons but lets in most editorial photos
const MAX_OUTPUT_DIMENSION = 1200;

function fnv1aHash(buffer: Uint8Array | Uint8ClampedArray): string {
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

/**
 * Try both page.objs and page.commonObjs. Different pdfjs versions stash
 * image data in different places.
 */
async function fetchImageObject(page: any, objId: string): Promise<any | null> {
  const tryStore = (store: any): Promise<any | null> =>
    new Promise((resolve) => {
      try {
        store.get(objId, (img: any) => resolve(img ?? null));
      } catch {
        resolve(null);
      }
    });
  const fromObjs = await tryStore(page.objs);
  if (fromObjs) return fromObjs;
  if (page.commonObjs) {
    const fromCommon = await tryStore(page.commonObjs);
    if (fromCommon) return fromCommon;
  }
  return null;
}

export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
): Promise<{ images: ExtractedImage[]; diagnostic: ExtractionDiagnostic }> {
  const diagnostic: ExtractionDiagnostic = {
    pageCount: 0,
    imageRefsFound: 0,
    decoded: 0,
    skippedNoData: 0,
    skippedTooSmall: 0,
    skippedUnknownKind: 0,
    skippedDuplicate: 0,
    errors: [],
    inspected: [],
  };

  let pdfjs: any;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (e: any) {
    diagnostic.errors.push(`pdfjs import failed: ${e.message}`);
    return { images: [], diagnostic };
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
    diagnostic.errors.push(`pdfjs getDocument failed: ${e.message}`);
    return { images: [], diagnostic };
  }

  diagnostic.pageCount = doc.numPages;
  const seenHashes = new Set<string>();
  const out: ExtractedImage[] = [];

  const isImageOp = (fn: any): boolean =>
    fn === pdfjs.OPS.paintImageXObject ||
    fn === pdfjs.OPS.paintJpegXObject ||
    fn === pdfjs.OPS.paintImageXObjectRepeat ||
    fn === pdfjs.OPS.paintInlineImageXObject ||
    fn === pdfjs.OPS.paintInlineImageXObjectGroup;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    let page: any;
    try {
      page = await doc.getPage(pageNum);
    } catch (e: any) {
      diagnostic.errors.push(`page ${pageNum}: ${e.message}`);
      continue;
    }

    let ops: any;
    try {
      ops = await page.getOperatorList();
    } catch (e: any) {
      diagnostic.errors.push(`page ${pageNum} ops: ${e.message}`);
      continue;
    }

    for (let i = 0; i < ops.fnArray.length; i++) {
      if (!isImageOp(ops.fnArray[i])) continue;
      diagnostic.imageRefsFound++;
      const objId = ops.argsArray[i][0];
      if (typeof objId !== "string") continue;

      const img = await fetchImageObject(page, objId);
      if (!img) {
        diagnostic.skippedNoData++;
        diagnostic.inspected.push({ hasData: false, hasBitmap: false });
        continue;
      }

      diagnostic.inspected.push({
        width: img.width,
        height: img.height,
        kind: img.kind,
        hasData: !!img.data,
        hasBitmap: !!img.bitmap,
      });

      const width = img.width;
      const height = img.height;
      const data = img.data;
      const kind = img.kind;

      if (!width || !height) {
        diagnostic.skippedNoData++;
        continue;
      }
      if (width * height < MIN_AREA) {
        diagnostic.skippedTooSmall++;
        continue;
      }
      if (!data) {
        diagnostic.skippedNoData++;
        continue;
      }

      const hash = fnv1aHash(data);
      if (seenHashes.has(hash)) {
        diagnostic.skippedDuplicate++;
        continue;
      }
      seenHashes.add(hash);

      let rgba: Buffer;
      try {
        if (kind === 3) rgba = Buffer.from(data);
        else if (kind === 2) rgba = expandRgbToRgba(data, width, height);
        else if (kind === 1) rgba = expandGrayscale1Bpp(data, width, height);
        else {
          diagnostic.skippedUnknownKind++;
          continue;
        }
      } catch (e: any) {
        diagnostic.errors.push(`decode ${objId}: ${e.message}`);
        continue;
      }

      const scaled = downscaleNN(rgba, width, height, MAX_OUTPUT_DIMENSION);
      try {
        const png = new PNG({ width: scaled.width, height: scaled.height });
        png.data = scaled.rgba;
        const buffer = PNG.sync.write(png);
        const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;
        out.push({ dataUri, width: scaled.width, height: scaled.height, area: width * height });
        diagnostic.decoded++;
      } catch (e: any) {
        diagnostic.errors.push(`encode ${objId}: ${e.message}`);
      }
    }
  }

  return {
    images: out.sort((a, b) => b.area - a.area),
    diagnostic,
  };
}
