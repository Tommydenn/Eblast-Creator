// True embedded image object extraction.
//
// Same idea as Poppler's `pdfimages -all` or PyMuPDF's
//   `page.get_images(full=True)` + `doc.extract_image(xref)`:
//
// We walk the PDF's indirect-object table, find every image XObject
// (`Subtype == Image`), apply only the *leading* filters (Flate / ASCIIHex)
// to recover the bytes that the final filter expects, and write those bytes
// out as-is. For a `/DCTDecode` final filter the recovered bytes ARE the
// original JPEG file the designer placed into the PDF — the same bytes
// Acrobat's "Save Image As" would write to disk.
//
// We don't render the page. We don't crop from page screenshots. We don't
// re-encode through sharp. Overlays, text, and other page-level decoration
// stay where they belong: on the page, not in our extracted images.

import { PDFDocument, PDFRawStream, PDFName, PDFDict, PDFArray, PDFNumber } from "pdf-lib";
import * as zlib from "node:zlib";
import { createHash } from "node:crypto";

export interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  area: number;
  colorSource: "rgb" | "cmyk" | "rendered";
}

export interface ExtractionDiagnostic {
  method: "embedded-image-extraction" | "none";
  totalStreams: number;
  imageStreams: number;
  imagesExtracted: number;
  imagesSkipped: number;
  imagesByFormat: { jpeg: number; jpeg2000: number; flate: number; ccitt: number; other: number };
  errors: string[];
  imageDetails: Array<{
    width: number;
    height: number;
    bitsPerComponent?: number;
    filterChain: string[];
    colorSpace?: string;
    format: string;
    byteLength: number;
  }>;
}

const MIN_AREA = 10_000;

// ---------- helpers -------------------------------------------------------

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
 * Apply every filter in the chain UP TO BUT NOT INCLUDING `untilFilter`.
 * For an image whose chain ends in DCTDecode, the result is the JPEG bytes;
 * for JPXDecode the result is the JPEG-2000 bytes, etc.
 */
function applyLeadingFilters(rawBytes: Buffer, chain: string[], untilFilter: string): Buffer | null {
  let bytes = rawBytes;
  for (const f of chain) {
    if (f === untilFilter) return bytes;
    try {
      if (f === "FlateDecode") bytes = zlib.inflateSync(bytes);
      else if (f === "ASCIIHexDecode") bytes = Buffer.from(bytes.toString("ascii").replace(/\s+/g, ""), "hex");
      else return null; // unsupported leading filter
    } catch {
      return null;
    }
  }
  return null;
}

function dictNumber(dict: PDFDict, key: string): number {
  const v = dict.get(PDFName.of(key));
  if (v instanceof PDFNumber) return v.asNumber();
  return 0;
}

function readColorSpaceName(dict: PDFDict): string | undefined {
  const cs = dict.get(PDFName.of("ColorSpace"));
  if (cs instanceof PDFName) return cs.asString().replace(/^\//, "");
  if (cs instanceof PDFArray && cs.size() > 0) {
    const head = cs.lookup(0);
    if (head instanceof PDFName) return head.asString().replace(/^\//, "");
  }
  return undefined;
}

// ---------- public API ----------------------------------------------------

export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
): Promise<{ images: ExtractedImage[]; diagnostic: ExtractionDiagnostic }> {
  const diag: ExtractionDiagnostic = {
    method: "embedded-image-extraction",
    totalStreams: 0,
    imageStreams: 0,
    imagesExtracted: 0,
    imagesSkipped: 0,
    imagesByFormat: { jpeg: 0, jpeg2000: 0, flate: 0, ccitt: 0, other: 0 },
    errors: [],
    imageDetails: [],
  };

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch (e: any) {
    diag.errors.push(`pdf-lib load: ${e?.message ?? String(e)}`);
    diag.method = "none";
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

    const width = dictNumber(dict, "Width");
    const height = dictNumber(dict, "Height");
    const bitsPerComponent = dictNumber(dict, "BitsPerComponent");
    if (!width || !height) {
      diag.imagesSkipped++;
      continue;
    }
    if (width * height < MIN_AREA) {
      diag.imagesSkipped++;
      continue;
    }

    const filterChain = parseFilterChain(dict.get(PDFName.of("Filter")));
    if (filterChain.length === 0) {
      diag.imagesSkipped++;
      diag.imagesByFormat.other++;
      continue;
    }

    const colorSpaceName = readColorSpaceName(dict);
    const rawBytes = Buffer.from(obj.contents);
    const finalFilter = filterChain[filterChain.length - 1];

    let imageBytes: Buffer | null = null;
    let mimeType = "";
    let format: keyof ExtractionDiagnostic["imagesByFormat"] = "other";

    if (finalFilter === "DCTDecode") {
      // JPEG. Stream content (after any leading filters) IS the JPEG file.
      imageBytes = applyLeadingFilters(rawBytes, filterChain, "DCTDecode");
      mimeType = "image/jpeg";
      format = "jpeg";
    } else if (finalFilter === "JPXDecode") {
      // JPEG 2000. Browser support is patchy but we keep the bytes.
      imageBytes = applyLeadingFilters(rawBytes, filterChain, "JPXDecode");
      mimeType = "image/jp2";
      format = "jpeg2000";
    } else if (finalFilter === "CCITTFaxDecode") {
      // Fax-style monochrome. Would need a TIFF wrapper to display.
      diag.imagesByFormat.ccitt++;
      diag.imagesSkipped++;
      diag.imageDetails.push({
        width, height, bitsPerComponent, filterChain,
        colorSpace: colorSpaceName, format: "ccitt-skipped", byteLength: rawBytes.length,
      });
      continue;
    } else {
      // Raw / Flate-compressed pixel data — would need a PNG wrapper. Skip.
      diag.imagesByFormat.flate++;
      diag.imagesSkipped++;
      diag.imageDetails.push({
        width, height, bitsPerComponent, filterChain,
        colorSpace: colorSpaceName, format: "raw-skipped", byteLength: rawBytes.length,
      });
      continue;
    }

    if (!imageBytes) {
      diag.imagesSkipped++;
      diag.errors.push(`failed to apply leading filters for ${width}x${height} ${finalFilter}`);
      continue;
    }

    const hash = createHash("md5").update(imageBytes).digest("hex");
    if (seenHashes.has(hash)) {
      diag.imagesSkipped++;
      continue;
    }
    seenHashes.add(hash);

    const colorSource: "rgb" | "cmyk" = colorSpaceName === "DeviceCMYK" ? "cmyk" : "rgb";

    out.push({
      dataUri: `data:${mimeType};base64,${imageBytes.toString("base64")}`,
      width,
      height,
      area: width * height,
      colorSource,
    });
    diag.imagesExtracted++;
    diag.imagesByFormat[format]++;
    diag.imageDetails.push({
      width,
      height,
      bitsPerComponent,
      filterChain,
      colorSpace: colorSpaceName,
      format,
      byteLength: imageBytes.length,
    });
  }

  return {
    images: out.sort((a, b) => b.area - a.area),
    diagnostic: diag,
  };
}
