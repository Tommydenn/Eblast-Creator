// Extract embedded JPEG images from a PDF — properly, via PDF object parsing.
//
// Approach: parse the PDF with pdf-lib, walk every indirect object, and pull
// the ones that are image XObjects with /Filter /DCTDecode (i.e. JPEG). The
// stream content of those objects IS the raw JPEG file bytes — no scanning,
// no false positives, no truncation.
//
// Color handling: a 4-component JPEG (CMYK) gets decoded with jpeg-js and
// converted to RGB PNG. A 3-component JPEG (RGB/YCbCr) passes through
// unchanged because every modern email client renders it correctly.

import { PDFDocument, PDFRawStream, PDFName, PDFDict, PDFArray, PDFNumber } from "pdf-lib";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

export interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  area: number;
  /** "rgb" if we passed the JPEG through as-is, "cmyk" if we converted from a 4-component JPEG. */
  colorSource: "rgb" | "cmyk";
}

export interface ExtractionDiagnostic {
  method: "pdf-lib" | "none";
  totalStreams: number;     // total indirect-object streams in the PDF
  imageStreams: number;     // streams whose Subtype is /Image
  jpegStreams: number;      // image streams whose filter chain ends in /DCTDecode
  passedFilters: number;    // jpeg streams that survived the size threshold
  cmykConverted: number;
  cmykFailed: number;
  errors: string[];
}

const MIN_AREA = 5_000;

// ---------- JPEG SOF parsing (just to count color components) ------------

interface JpegInfo {
  width: number;
  height: number;
  components: number; // 1, 3, or 4
}

function readJpegInfo(jpegBuf: Buffer): JpegInfo | null {
  let i = 2;
  while (i < jpegBuf.length - 8) {
    if (jpegBuf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = jpegBuf[i + 1];
    if (marker === 0xff) { i++; continue; }
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

// ---------- CMYK → RGB ---------------------------------------------------

function cmykJpegToRgbPng(jpegBuf: Buffer): { dataUri: string; width: number; height: number } | null {
  let decoded: any;
  try {
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

// ---------- pdf-lib image-stream extraction -------------------------------

function filterChainEndsInDCT(filter: any): boolean {
  if (!filter) return false;
  if (filter instanceof PDFName) return filter.asString() === "/DCTDecode";
  if (filter instanceof PDFArray) {
    for (let i = 0; i < filter.size(); i++) {
      const f = filter.get(i);
      if (f instanceof PDFName && f.asString() === "/DCTDecode") return true;
    }
  }
  return false;
}

function dictNumber(dict: PDFDict, key: string): number {
  const v = dict.get(PDFName.of(key));
  if (v instanceof PDFNumber) return v.asNumber();
  return 0;
}

export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
): Promise<{ images: ExtractedImage[]; diagnostic: ExtractionDiagnostic }> {
  const diag: ExtractionDiagnostic = {
    method: "none",
    totalStreams: 0,
    imageStreams: 0,
    jpegStreams: 0,
    passedFilters: 0,
    cmykConverted: 0,
    cmykFailed: 0,
    errors: [],
  };

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    diag.method = "pdf-lib";
  } catch (e: any) {
    diag.errors.push(`pdf-lib load: ${e?.message ?? String(e)}`);
    return { images: [], diagnostic: diag };
  }

  const out: ExtractedImage[] = [];
  const seenSizes = new Set<number>(); // crude dedupe for repeated images

  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    diag.totalStreams++;

    const dict = obj.dict;
    const subtype = dict.get(PDFName.of("Subtype"));
    if (!(subtype instanceof PDFName) || subtype.asString() !== "/Image") continue;
    diag.imageStreams++;

    const filter = dict.get(PDFName.of("Filter"));
    if (!filterChainEndsInDCT(filter)) continue;
    diag.jpegStreams++;

    const width = dictNumber(dict, "Width");
    const height = dictNumber(dict, "Height");
    if (!width || !height || width * height < MIN_AREA) continue;

    const jpegBytes = Buffer.from(obj.contents);
    if (seenSizes.has(jpegBytes.length)) continue;
    seenSizes.add(jpegBytes.length);
    diag.passedFilters++;

    const info = readJpegInfo(jpegBytes);
    const components = info?.components ?? 0;

    if (components === 4) {
      const converted = cmykJpegToRgbPng(jpegBytes);
      if (converted) {
        out.push({
          dataUri: converted.dataUri,
          width: converted.width,
          height: converted.height,
          area: converted.width * converted.height,
          colorSource: "cmyk",
        });
        diag.cmykConverted++;
      } else {
        diag.cmykFailed++;
        diag.errors.push(`CMYK conversion failed for ${width}x${height}`);
      }
    } else {
      out.push({
        dataUri: `data:image/jpeg;base64,${jpegBytes.toString("base64")}`,
        width,
        height,
        area: width * height,
        colorSource: "rgb",
      });
    }
  }

  return { images: out.sort((a, b) => b.area - a.area), diagnostic: diag };
}
