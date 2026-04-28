// Extract embedded JPEG images from a PDF, with proper ICC color management.
//
// Why this is more involved than "just grab the JPEG bytes": when an Adobe
// product (InDesign / Illustrator / Acrobat) places a CMYK photo into a PDF,
// the JPEG bytes themselves don't carry the source color profile. The
// profile lives in the image XObject's /ColorSpace [/ICCBased <ref>] entry,
// referencing a separate stream in the PDF.
//
// If we extract just the JPEG bytes and convert CMYK→sRGB, sharp/libvips
// uses a generic conversion that comes out flat and desaturated.
//
// The fix that Acrobat does and that we now do here:
//   1. Walk the PDF's image XObjects (via pdf-lib)
//   2. For each, extract both the JPEG bytes AND the ICC profile from
//      /ColorSpace
//   3. Inject the ICC profile into the JPEG as an APP2 marker so sharp's
//      pipeline picks it up
//   4. Let sharp handle the ICC-aware CMYK→sRGB conversion
//
// Result: photos come out with the same colors Acrobat would produce.

import { PDFDocument, PDFRawStream, PDFName, PDFDict, PDFArray, PDFNumber, PDFRef } from "pdf-lib";
import sharp from "sharp";
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
  iccProfileBytes?: number;
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
  iccProfilesFound: number;
  documentProfileFound: boolean;
  documentProfileBytes: number;
  sharpFailed: number;
  errors: string[];
  imageDetails: ImageDebugInfo[];
}

const MIN_AREA = 5_000;
const MAX_OUTPUT_DIMENSION = 1400;

// ---------- JPEG SOF parsing ----------------------------------------------

interface JpegInfo { width: number; height: number; components: number }

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

// ---------- ICC profile extraction from PDF ------------------------------

/**
 * Apply the leading filters of a PDF stream (typically just FlateDecode for
 * ICC streams) to recover the actual ICC profile bytes.
 */
function decompressStream(stream: PDFRawStream): Buffer | null {
  const filterField = stream.dict.get(PDFName.of("Filter"));
  let bytes = Buffer.from(stream.contents);

  const filters: string[] = [];
  if (filterField instanceof PDFName) filters.push(filterField.asString().replace(/^\//, ""));
  else if (filterField instanceof PDFArray) {
    for (let i = 0; i < filterField.size(); i++) {
      const f = filterField.get(i);
      if (f instanceof PDFName) filters.push(f.asString().replace(/^\//, ""));
    }
  }

  for (const f of filters) {
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

/**
 * If an image XObject's /ColorSpace is [/ICCBased <ref>], dereference and
 * return the raw ICC profile bytes.
 */
function extractIccProfile(imageDict: PDFDict, doc: PDFDocument): Buffer | null {
  const cs = imageDict.get(PDFName.of("ColorSpace"));
  if (!(cs instanceof PDFArray) || cs.size() < 2) return null;

  const head = cs.lookup(0);
  if (!(head instanceof PDFName) || head.asString() !== "/ICCBased") return null;

  const ref = cs.get(1);
  if (!(ref instanceof PDFRef)) return null;

  const stream = doc.context.lookup(ref);
  if (!(stream instanceof PDFRawStream)) return null;

  return decompressStream(stream);
}

/**
 * Look for a document-level CMYK profile in /OutputIntents (PDF/X) or
 * /DefaultCMYK on each page's /Resources/ColorSpace dictionary.
 *
 * Adobe-generated flyer PDFs almost always declare ONE OutputIntent profile
 * (typically "U.S. Web Coated (SWOP) v2") and every CMYK image inherits it.
 * Per-image /ColorSpace entries are usually just /DeviceCMYK in that case.
 */
function getDocumentCmykProfile(doc: PDFDocument): Buffer | null {
  // 1) /OutputIntents on the catalog
  try {
    const catalog: any = (doc as any).catalog;
    if (catalog) {
      const outputIntents =
        typeof catalog.lookup === "function"
          ? catalog.lookup(PDFName.of("OutputIntents"))
          : catalog.get?.(PDFName.of("OutputIntents"));
      if (outputIntents instanceof PDFArray) {
        for (let i = 0; i < outputIntents.size(); i++) {
          const intent = outputIntents.lookup(i);
          if (!(intent instanceof PDFDict)) continue;
          const profileEntry = intent.get(PDFName.of("DestOutputProfile"));
          let stream: any = null;
          if (profileEntry instanceof PDFRef) stream = doc.context.lookup(profileEntry);
          else if (profileEntry instanceof PDFRawStream) stream = profileEntry;
          if (stream instanceof PDFRawStream) {
            const bytes = decompressStream(stream);
            if (bytes && bytes.length > 0) return bytes;
          }
        }
      }
    }
  } catch {
    // fall through
  }

  // 2) Walk pages looking for /Resources/ColorSpace/DefaultCMYK
  try {
    for (const page of doc.getPages()) {
      const resources: any = (page.node as any).Resources?.();
      if (!(resources instanceof PDFDict)) continue;
      const csDict = resources.get(PDFName.of("ColorSpace"));
      if (!(csDict instanceof PDFDict)) continue;
      const defaultCmyk = csDict.get(PDFName.of("DefaultCMYK"));
      if (!(defaultCmyk instanceof PDFArray) || defaultCmyk.size() < 2) continue;
      const head = defaultCmyk.lookup(0);
      if (!(head instanceof PDFName) || head.asString() !== "/ICCBased") continue;
      const ref = defaultCmyk.get(1);
      if (!(ref instanceof PDFRef)) continue;
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const bytes = decompressStream(stream);
      if (bytes && bytes.length > 0) return bytes;
    }
  } catch {
    // fall through
  }

  return null;
}

// ---------- ICC injection into JPEG (APP2 marker) ------------------------

/**
 * Embed an ICC profile into a JPEG as APP2 markers (split into 64KB chunks
 * if needed). After this, sharp/libvips will detect and apply the profile
 * during colorspace conversion.
 */
function injectIccProfile(jpegBuf: Buffer, iccBytes: Buffer): Buffer {
  const ICC_IDENTIFIER = Buffer.from("ICC_PROFILE\0", "ascii"); // 12 bytes
  // APP2 segment length field is 2 bytes (max 65535). Subtract:
  //   2 for the length field itself
  //   12 for the ICC_PROFILE identifier
  //   2 for chunk-number / total-chunks
  const MAX_CHUNK = 65535 - 16;

  const totalChunks = Math.max(1, Math.ceil(iccBytes.length / MAX_CHUNK));
  if (totalChunks > 255) return jpegBuf; // ICC > 16MB; skip injection

  const segments: Buffer[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunk = iccBytes.subarray(i * MAX_CHUNK, Math.min((i + 1) * MAX_CHUNK, iccBytes.length));
    const segmentLength = 2 + ICC_IDENTIFIER.length + 2 + chunk.length;
    segments.push(
      Buffer.from([0xff, 0xe2, (segmentLength >> 8) & 0xff, segmentLength & 0xff]),
      ICC_IDENTIFIER,
      Buffer.from([i + 1, totalChunks]),
      chunk,
    );
  }

  // Insert APP2 markers right after the SOI (FF D8)
  return Buffer.concat([jpegBuf.subarray(0, 2), ...segments, jpegBuf.subarray(2)]);
}

// ---------- sharp pipeline -----------------------------------------------

async function processJpegToRgb(
  jpegBuf: Buffer,
  components: number,
): Promise<{ data: Buffer; width: number; height: number } | { error: string }> {
  try {
    const meta = await sharp(jpegBuf, { failOn: "none" }).metadata();

    let pipeline = sharp(jpegBuf, { failOn: "none" });

    // Adobe stores CMYK with inverted channel values. negate() flips them
    // back to the standard convention before colorspace conversion.
    if (components === 4) {
      pipeline = pipeline.negate({ alpha: false });
    }

    pipeline = pipeline.toColorspace("srgb");

    if (meta.width && meta.height) {
      if (meta.width > MAX_OUTPUT_DIMENSION || meta.height > MAX_OUTPUT_DIMENSION) {
        pipeline = pipeline.resize(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        });
      }
    }

    const out = await pipeline.jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

// ---------- filter-chain handling for image streams ----------------------

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
      if (f === "FlateDecode") bytes = zlib.inflateSync(bytes);
      else if (f === "ASCIIHexDecode") bytes = Buffer.from(bytes.toString("ascii").replace(/\s+/g, ""), "hex");
      else return null;
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
    iccProfilesFound: 0,
    documentProfileFound: false,
    documentProfileBytes: 0,
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

  // Document-level CMYK profile (used as fallback for images without their own)
  const documentCmykProfile = getDocumentCmykProfile(doc);
  if (documentCmykProfile) {
    diag.documentProfileFound = true;
    diag.documentProfileBytes = documentCmykProfile.length;
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

    if (!jpegBytes) { diag.imageDetails.push(debug); continue; }

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

    // Pull the ICC profile out of the PDF and bake it into the JPEG so
    // sharp will use it for proper color-managed conversion.
    //
    // Resolution order:
    //   1) Per-image /ColorSpace [/ICCBased <ref>]
    //   2) Document-level /OutputIntents profile (typical for Adobe PDF/X)
    //   3) Document-level /DefaultCMYK on a page's /Resources
    let jpegToProcess = jpegBytes;
    let iccBytes = extractIccProfile(dict, doc);
    if (iccBytes && iccBytes.length > 0) {
      diag.iccProfilesFound++;
    } else if (info.components === 4 && documentCmykProfile) {
      iccBytes = documentCmykProfile;
    }

    if (iccBytes && iccBytes.length > 0) {
      debug.iccProfileBytes = iccBytes.length;
      try {
        jpegToProcess = injectIccProfile(jpegBytes, iccBytes);
      } catch {
        jpegToProcess = jpegBytes;
      }
    }

    const processed = await processJpegToRgb(jpegToProcess, info.components);
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
