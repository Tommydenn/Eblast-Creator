// Extract embedded JPEG images from a PDF.
//
// Pipeline:
//   1. Parse the PDF with pdf-lib, walk every indirect object.
//   2. Filter to image XObjects whose filter chain ends in /DCTDecode.
//   3. Apply any leading filters (FlateDecode etc.) to recover JPEG bytes.
//   4. Hand each JPEG to sharp, which handles CMYK/YCCK/Adobe-inverted
//      color spaces uniformly and outputs clean RGB JPEG. sharp uses libvips
//      under the hood — Vercel ships precompiled binaries so it works in
//      serverless functions out of the box.

import { PDFDocument, PDFRawStream, PDFName, PDFDict, PDFArray, PDFNumber } from "pdf-lib";
import sharp from "sharp";
import * as zlib from "node:zlib";
import { createHash } from "node:crypto";

export interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  area: number;
  /** Original color space before sharp normalized it. */
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
  outputBytes?: number;
  outputWidth?: number;
  outputHeight?: number;
  firstBytesHex: string;
  status:
    | "ok-rgb"
    | "ok-cmyk"
    | "skipped-too-small"
    | "skipped-duplicate"
    | "skipped-bad-decompression"
    | "skipped-no-jpeg-marker"
    | "skipped-sharp-failed";
  error?: string;
}

export interface ExtractionDiagnostic {
  method: "pdf-lib" | "none";
  totalStreams: number;
  imageStreams: number;
  jpegStreams: number;
  passedFilters: number;
  rgbConverted: number;
  cmykConverted: number;
  sharpFailed: number;
  errors: string[];
  imageDetails: ImageDebugInfo[];
}

const MIN_AREA = 5_000;
const MAX_OUTPUT_DIMENSION = 1400; // downscale anything larger than this for email size budget

// ---------- JPEG SOF parsing (just for debugging info) -------------------

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

// ---------- sharp-based JPEG normalization -------------------------------

async function processJpegToRgb(jpegBuf: Buffer): Promise<
  { data: Buffer; width: number; height: number } | { error: string }
> {
  try {
    let pipeline = sharp(jpegBuf, { failOn: "none" }).toColorspace("srgb");

    const meta = await sharp(jpegBuf, { failOn: "none" }).metadata();
    if (meta.width && meta.height) {
      if (meta.width > MAX_OUTPUT_DIMENSION || meta.height > MAX_OUTPUT_DIMENSION) {
        pipeline = pipeline.resize(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        });
      }
    }

    const out = await pipeline.jpeg({ quality: 85, mozjpeg: false }).toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
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
        return null;
      }
    } catch {
      return null;
    }
  }
  return bytes;
}

function dictNumber(dict: PDFDict, key: string): number {
  const v = dict.get(PDFName.of(key));
  if (v instanceof PDFNumber) return v.asNumber();
  return 0;
}

// ---------- public API ---------------------------------------------------

export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
): Promise<{ images: ExtractedImage[]; diagnostic: ExtractionDiagnostic }> {
  const diag: ExtractionDiagnostic = {
    method: "none",
    totalStreams: 0,
    imageStreams: 0,
    jpegStreams: 0,
    passedFilters: 0,
    rgbConverted: 0,
    cmykConverted: 0,
    sharpFailed: 0,
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

    const processed = await processJpegToRgb(jpegBytes);
    if ("error" in processed) {
      debug.status = "skipped-sharp-failed";
      debug.error = processed.error;
      diag.sharpFailed++;
      diag.errors.push(`sharp failed for ${info.width}x${info.height}: ${processed.error}`);
      diag.imageDetails.push(debug);
      continue;
    }

    const colorSource: "rgb" | "cmyk" = info.components === 4 ? "cmyk" : "rgb";
    out.push({
      dataUri: `data:image/jpeg;base64,${processed.data.toString("base64")}`,
      width: processed.width,
      height: processed.height,
      area: processed.width * processed.height,
      colorSource,
    });
    if (colorSource === "cmyk") diag.cmykConverted++;
    else diag.rgbConverted++;

    debug.status = colorSource === "cmyk" ? "ok-cmyk" : "ok-rgb";
    debug.outputBytes = processed.data.length;
    debug.outputWidth = processed.width;
    debug.outputHeight = processed.height;
    diag.imageDetails.push(debug);
  }

  return { images: out.sort((a, b) => b.area - a.area), diagnostic: diag };
}
