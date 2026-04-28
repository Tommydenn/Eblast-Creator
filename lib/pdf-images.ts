// Extract embedded JPEG images from a PDF — properly, via PDF object parsing.
//
// Approach: parse the PDF with pdf-lib, walk every indirect object, find
// image XObjects whose filter chain ends in /DCTDecode (i.e. JPEG). Apply
// any leading filters (typically /FlateDecode for Flate-wrapped JPEGs) to
// get the actual JPEG file bytes.
//
// Color handling: 4-component (CMYK) JPEGs are decoded with jpeg-js and
// converted to RGB PNG. 3-component (RGB/YCbCr) JPEGs pass through as-is.

import { PDFDocument, PDFRawStream, PDFName, PDFDict, PDFArray, PDFNumber } from "pdf-lib";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import * as zlib from "node:zlib";
import { createHash } from "node:crypto";

export interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  area: number;
  colorSource: "rgb" | "cmyk";
}

interface ImageDebugInfo {
  pdfDictWidth: number;
  pdfDictHeight: number;
  jpegSofWidth?: number;
  jpegSofHeight?: number;
  components?: number;
  filterChain: string[];
  rawBytes: number;
  jpegBytes: number;
  firstBytesHex: string;
  status: "rgb" | "cmyk-converted" | "cmyk-failed" | "skipped-too-small" | "skipped-duplicate" | "skipped-bad-decompression" | "skipped-no-jpeg-marker";
}

export interface ExtractionDiagnostic {
  method: "pdf-lib" | "none";
  totalStreams: number;
  imageStreams: number;
  jpegStreams: number;
  passedFilters: number;
  cmykConverted: number;
  cmykFailed: number;
  errors: string[];
  imageDetails: ImageDebugInfo[];
}

const MIN_AREA = 5_000;

// ---------- JPEG SOF parsing --------------------------------------------

interface JpegInfo {
  width: number;
  height: number;
  components: number;
}

function readJpegInfo(jpegBuf: Buffer): JpegInfo | null {
  if (jpegBuf.length < 4 || jpegBuf[0] !== 0xff || jpegBuf[1] !== 0xd8) return null;
  let i = 2;
  while (i < jpegBuf.length - 8) {
    if (jpegBuf[i] !== 0xff) { i++; continue; }
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
  if (data.length < width * height * 4) return null;

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

// ---------- Filter chain handling ----------------------------------------

function parseFilterChain(filter: any): string[] {
  if (!filter) return [];
  if (filter instanceof PDFName) return [filter.asString().replace(/^\//, "")];
  if (filter instanceof PDFArray) {
    const out: string[] = [];
    for (let i = 0; i < filter.size(); i++) {
      const f = filter.get(i);
      if (f instanceof PDFName) out.push(f.asString().replace(/^\//, ""));
    }
    return out;
  }
  return [];
}

/**
 * Take a PDF raw stream and apply all leading filters (everything except the
 * final DCTDecode) to recover the embedded JPEG bytes.
 *
 * The final filter is expected to be DCTDecode — we DON'T apply it because
 * we want the JPEG bytes themselves, not the decoded pixels.
 */
function unwrapToJpeg(rawBytes: Buffer, filterChain: string[]): Buffer | null {
  if (filterChain.length === 0) return null;
  if (filterChain[filterChain.length - 1] !== "DCTDecode") return null;

  let bytes = rawBytes;
  for (let i = 0; i < filterChain.length - 1; i++) {
    const f = filterChain[i];
    try {
      if (f === "FlateDecode") {
        bytes = zlib.inflateSync(bytes);
      } else if (f === "ASCIIHexDecode") {
        bytes = Buffer.from(bytes.toString("ascii").replace(/\s+/g, ""), "hex");
      } else {
        // Unknown intermediate filter — bail
        return null;
      }
    } catch {
      return null;
    }
  }
  return bytes;
}

// ---------- public API ---------------------------------------------------

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
    imageDetails: [],
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
  const seenHashes = new Set<string>();

  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    diag.totalStreams++;

    const dict = obj.dict;
    const subtype = dict.get(PDFName.of("Subtype"));
    if (!(subtype instanceof PDFName) || subtype.asString() !== "/Image") continue;
    diag.imageStreams++;

    const filterChain = parseFilterChain(dict.get(PDFName.of("Filter")));
    if (filterChain[filterChain.length - 1] !== "DCTDecode") continue;
    diag.jpegStreams++;

    const pdfDictWidth = dictNumber(dict, "Width");
    const pdfDictHeight = dictNumber(dict, "Height");
    const rawBytes = Buffer.from(obj.contents);

    const jpegBytes = unwrapToJpeg(rawBytes, filterChain);
    const debug: ImageDebugInfo = {
      pdfDictWidth,
      pdfDictHeight,
      filterChain,
      rawBytes: rawBytes.length,
      jpegBytes: jpegBytes?.length ?? 0,
      firstBytesHex: jpegBytes ? jpegBytes.subarray(0, 8).toString("hex") : rawBytes.subarray(0, 8).toString("hex"),
      status: "skipped-bad-decompression",
    };

    if (!jpegBytes) {
      diag.imageDetails.push(debug);
      continue;
    }

    const info = readJpegInfo(jpegBytes);
    if (!info) {
      debug.status = "skipped-no-jpeg-marker";
      diag.imageDetails.push(debug);
      continue;
    }
    debug.jpegSofWidth = info.width;
    debug.jpegSofHeight = info.height;
    debug.components = info.components;

    if (info.width * info.height < MIN_AREA) {
      debug.status = "skipped-too-small";
      diag.imageDetails.push(debug);
      continue;
    }

    const hash = createHash("md5").update(jpegBytes).digest("hex");
    if (seenHashes.has(hash)) {
      debug.status = "skipped-duplicate";
      diag.imageDetails.push(debug);
      continue;
    }
    seenHashes.add(hash);
    diag.passedFilters++;

    if (info.components === 4) {
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
        debug.status = "cmyk-converted";
      } else {
        diag.cmykFailed++;
        debug.status = "cmyk-failed";
        diag.errors.push(`CMYK conversion failed for ${info.width}x${info.height}`);
      }
    } else {
      out.push({
        dataUri: `data:image/jpeg;base64,${jpegBytes.toString("base64")}`,
        width: info.width,
        height: info.height,
        area: info.width * info.height,
        colorSource: "rgb",
      });
      debug.status = "rgb";
    }

    diag.imageDetails.push(debug);
  }

  return { images: out.sort((a, b) => b.area - a.area), diagnostic: diag };
}
