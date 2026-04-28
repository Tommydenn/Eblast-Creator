// Extract individual images from a PDF using MuPDF.
//
// Same approach as PyMuPDF's `doc.extract_image(xref)`: walk the PDF's xref
// table, find image stream objects, and use MuPDF's color-managed renderer
// to materialise each one as RGB. Because we're letting MuPDF do the
// CMYK→sRGB conversion (the same library Acrobat-class viewers use), the
// colors come out correctly without any post-processing tweaks.

import sharp from "sharp";

export interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  area: number;
  colorSource: "rgb" | "cmyk" | "rendered";
}

export interface ExtractionDiagnostic {
  method: "mupdf-xref" | "none";
  xrefCount: number;
  imageObjects: number;
  imagesRendered: number;
  imagesSkipped: number;
  errors: string[];
  imageDetails: Array<{
    xref: number;
    width: number;
    height: number;
    colorspace?: string;
    components?: number;
    outputBytes: number;
  }>;
}

const MIN_AREA = 5_000;
const MAX_OUTPUT_DIMENSION = 1400;

/**
 * Defensive wrapper for calling potentially-different mupdf-js APIs.
 * The library's surface differs slightly across versions, so we try several
 * known method names.
 */
function safeCall<T = any>(target: any, names: string[], ...args: any[]): T | undefined {
  for (const name of names) {
    if (target && typeof target[name] === "function") {
      try {
        return target[name](...args);
      } catch {
        // try next
      }
    }
  }
  return undefined;
}

export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
): Promise<{ images: ExtractedImage[]; diagnostic: ExtractionDiagnostic }> {
  const diag: ExtractionDiagnostic = {
    method: "none",
    xrefCount: 0,
    imageObjects: 0,
    imagesRendered: 0,
    imagesSkipped: 0,
    errors: [],
    imageDetails: [],
  };

  let mupdfModule: any;
  try {
    mupdfModule = await import("mupdf");
  } catch (e: any) {
    diag.errors.push(`mupdf import: ${e?.message ?? String(e)}`);
    return { images: [], diagnostic: diag };
  }
  const mupdf = mupdfModule.default ?? mupdfModule;
  diag.method = "mupdf-xref";

  let doc: any;
  try {
    doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  } catch (e: any) {
    diag.errors.push(`mupdf openDocument: ${e?.message ?? String(e)}`);
    return { images: [], diagnostic: diag };
  }

  // Try multiple known names for "how many xref entries does this PDF have"
  const xrefCount: number =
    safeCall<number>(doc, ["countObjects", "getXrefLength", "numObjects"]) ?? 0;
  diag.xrefCount = xrefCount;

  if (xrefCount === 0) {
    diag.errors.push("mupdf: could not determine xref count");
    return { images: [], diagnostic: diag };
  }

  const out: ExtractedImage[] = [];

  for (let xref = 1; xref < xrefCount; xref++) {
    let obj: any;
    try {
      obj = safeCall(doc, ["findObject", "lookupObject", "getObject"], xref);
      if (!obj) continue;
    } catch {
      continue;
    }

    // Filter to image streams: must be a stream with /Subtype /Image
    let isStream = false;
    try {
      isStream = !!safeCall(obj, ["isStream"]);
    } catch {}
    if (!isStream) continue;

    let subtypeName: string | undefined;
    try {
      const subtype = obj.get?.("Subtype") ?? safeCall(obj, ["get"], "Subtype");
      subtypeName = safeCall(subtype, ["asName", "toString"]);
      if (typeof subtypeName === "string") subtypeName = subtypeName.replace(/^\//, "");
    } catch {}
    if (subtypeName !== "Image") continue;

    diag.imageObjects++;

    // Load as a MuPDF Image — this is the key step. The Image class
    // understands the source colorspace (DeviceCMYK, ICCBased, etc.) and
    // can be rendered to a target colorspace correctly.
    let image: any;
    try {
      image = mupdf.Image ? new mupdf.Image(obj) : safeCall(doc, ["loadImage"], obj);
      if (!image) continue;
    } catch (e: any) {
      diag.imagesSkipped++;
      diag.errors.push(`xref ${xref}: load Image — ${e?.message ?? String(e)}`);
      continue;
    }

    let width = 0;
    let height = 0;
    let cs: any;
    let csName: string | undefined;
    let components: number | undefined;
    try {
      width = safeCall<number>(image, ["getWidth", "width"]) ?? 0;
      height = safeCall<number>(image, ["getHeight", "height"]) ?? 0;
      cs = safeCall(image, ["getColorSpace", "colorSpace"]);
      csName = safeCall(cs, ["getName", "toString"]);
      components = safeCall(cs, ["getNumberOfComponents", "n"]);
    } catch {}

    if (!width || !height || width * height < MIN_AREA) {
      diag.imagesSkipped++;
      continue;
    }

    // Render the image to an RGB pixmap. MuPDF handles the color conversion
    // (including any embedded ICC profile or document-level OutputIntent
    // profile) automatically.
    let pixmap: any;
    try {
      const targetCs = mupdf.ColorSpace?.DeviceRGB ?? mupdf.DeviceRGB;
      pixmap =
        safeCall(image, ["toPixmap"], undefined, targetCs) ??
        safeCall(image, ["toPixmap"], targetCs) ??
        safeCall(image, ["toPixmap"]);
      if (!pixmap) {
        diag.imagesSkipped++;
        diag.errors.push(`xref ${xref}: toPixmap returned null`);
        continue;
      }
    } catch (e: any) {
      diag.imagesSkipped++;
      diag.errors.push(`xref ${xref}: toPixmap — ${e?.message ?? String(e)}`);
      continue;
    }

    let pngBytes: Uint8Array | undefined;
    try {
      pngBytes = safeCall<Uint8Array>(pixmap, ["asPNG", "toPNG"]);
      if (!pngBytes) {
        diag.imagesSkipped++;
        continue;
      }
    } catch (e: any) {
      diag.imagesSkipped++;
      diag.errors.push(`xref ${xref}: asPNG — ${e?.message ?? String(e)}`);
      continue;
    }

    // PNG → JPEG (smaller for email), with downscale if needed.
    try {
      const sharpInput = Buffer.from(pngBytes);
      let pipeline = sharp(sharpInput);
      const meta = await sharp(sharpInput).metadata();
      if (meta.width && meta.height) {
        if (meta.width > MAX_OUTPUT_DIMENSION || meta.height > MAX_OUTPUT_DIMENSION) {
          pipeline = pipeline.resize(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION, {
            fit: "inside",
            withoutEnlargement: true,
          });
        }
      }
      const jpeg = await pipeline.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });

      out.push({
        dataUri: `data:image/jpeg;base64,${jpeg.data.toString("base64")}`,
        width: jpeg.info.width,
        height: jpeg.info.height,
        area: jpeg.info.width * jpeg.info.height,
        colorSource: components === 4 ? "cmyk" : "rgb",
      });
      diag.imagesRendered++;
      diag.imageDetails.push({
        xref,
        width: jpeg.info.width,
        height: jpeg.info.height,
        colorspace: csName,
        components,
        outputBytes: jpeg.data.length,
      });
    } catch (e: any) {
      diag.imagesSkipped++;
      diag.errors.push(`xref ${xref}: sharp encode — ${e?.message ?? String(e)}`);
    }

    // Free native resources.
    try { pixmap.destroy?.(); } catch {}
    try { image.destroy?.(); } catch {}
  }

  try { doc.destroy?.(); } catch {}

  return { images: out.sort((a, b) => b.area - a.area), diagnostic: diag };
}
