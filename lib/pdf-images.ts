// Extract individual images from a PDF using MuPDF's high-level API.
//
// Approach (this is the same path Acrobat uses for its "extract image" tool):
//   1. Render each page with MuPDF — produces a properly color-managed RGB
//      pixmap. Same library, same color conversion Acrobat does.
//   2. Ask MuPDF for the page's structured text *with images preserved*.
//      This gives us the bounding box of every image on the page.
//   3. Crop the rendered page to each image's bbox using sharp.
//
// Result: individual photos extracted with the same color fidelity as
// Acrobat. No CMYK math, no ICC tweaking, no contrast hacks.

import sharp from "sharp";

export interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  area: number;
  colorSource: "rgb" | "cmyk" | "rendered";
}

export interface ExtractionDiagnostic {
  method: "mupdf-render-crop" | "none";
  pageCount: number;
  pagesProcessed: number;
  imageBlocksFound: number;
  cropped: number;
  cropFailed: number;
  errors: string[];
  imageDetails: Array<{
    page: number;
    pdfBbox: number[];
    pixelBbox: { left: number; top: number; width: number; height: number };
    outputBytes: number;
  }>;
}

const RENDER_SCALE = 2; // 2× the PDF default DPI of 72 = 144 DPI render
const MIN_PIXEL_AREA = 10_000; // ~100×100 — filters out logos and tiny icons
const MAX_OUTPUT_DIMENSION = 1400;

export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
): Promise<{ images: ExtractedImage[]; diagnostic: ExtractionDiagnostic }> {
  const diag: ExtractionDiagnostic = {
    method: "none",
    pageCount: 0,
    pagesProcessed: 0,
    imageBlocksFound: 0,
    cropped: 0,
    cropFailed: 0,
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
  diag.method = "mupdf-render-crop";

  let doc: any;
  try {
    doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  } catch (e: any) {
    diag.errors.push(`mupdf openDocument: ${e?.message ?? String(e)}`);
    return { images: [], diagnostic: diag };
  }

  let pageCount = 0;
  try {
    pageCount = doc.countPages();
    diag.pageCount = pageCount;
  } catch (e: any) {
    diag.errors.push(`countPages: ${e?.message ?? String(e)}`);
    return { images: [], diagnostic: diag };
  }

  const out: ExtractedImage[] = [];
  const pagesToProcess = Math.min(pageCount, 3); // first 3 pages cover any flyer

  for (let pageIdx = 0; pageIdx < pagesToProcess; pageIdx++) {
    let page: any, pixmap: any;
    try {
      page = doc.loadPage(pageIdx);

      // Step 1: render the page (proper color management baked in)
      const matrix = mupdf.Matrix.scale(RENDER_SCALE, RENDER_SCALE);
      const colorspace = mupdf.ColorSpace?.DeviceRGB ?? mupdf.DeviceRGB;
      pixmap = page.toPixmap(matrix, colorspace, false);
      const pagePng = Buffer.from(pixmap.asPNG());

      // Step 2: pull image bounding boxes from the page's structured text
      let stext: any;
      let stextJson: any;
      try {
        stext = page.toStructuredText("preserve-images");
        const raw = stext.asJSON();
        stextJson = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (e: any) {
        diag.errors.push(`page ${pageIdx} structured text: ${e?.message ?? String(e)}`);
      }

      const blocks: any[] = stextJson?.blocks ?? [];
      const imageBlocks = blocks.filter((b: any) => b?.type === "image" || b?.kind === "image");
      diag.imageBlocksFound += imageBlocks.length;

      // Render meta — use the pixmap's actual dimensions for sanity checking
      const renderedWidth = pixmap.getWidth?.() ?? pixmap.width;
      const renderedHeight = pixmap.getHeight?.() ?? pixmap.height;

      // Step 3: crop the rendered page to each image bbox
      for (const block of imageBlocks) {
        const bbox = block.bbox ?? block.box;
        if (!bbox) continue;

        // bbox arrives as either an array [x0,y0,x1,y1] or {x,y,w,h}
        let x0: number, y0: number, x1: number, y1: number;
        if (Array.isArray(bbox)) {
          [x0, y0, x1, y1] = bbox;
        } else if (bbox.x !== undefined) {
          x0 = bbox.x;
          y0 = bbox.y;
          x1 = bbox.x + (bbox.w ?? 0);
          y1 = bbox.y + (bbox.h ?? 0);
        } else {
          continue;
        }

        // Convert to pixel coordinates. MuPDF's structured text uses top-left
        // origin (matching screen coords) so no Y-flip needed.
        const left = Math.max(0, Math.round(x0 * RENDER_SCALE));
        const top = Math.max(0, Math.round(y0 * RENDER_SCALE));
        const width = Math.min(renderedWidth - left, Math.round((x1 - x0) * RENDER_SCALE));
        const height = Math.min(renderedHeight - top, Math.round((y1 - y0) * RENDER_SCALE));

        if (width <= 0 || height <= 0) continue;
        if (width * height < MIN_PIXEL_AREA) continue;

        try {
          let pipeline = sharp(pagePng).extract({ left, top, width, height });

          // Downscale if huge
          if (width > MAX_OUTPUT_DIMENSION || height > MAX_OUTPUT_DIMENSION) {
            pipeline = pipeline.resize(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION, {
              fit: "inside",
              withoutEnlargement: true,
            });
          }

          const jpeg = await pipeline.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });

          out.push({
            dataUri: `data:image/jpeg;base64,${jpeg.data.toString("base64")}`,
            width: jpeg.info.width,
            height: jpeg.info.height,
            area: jpeg.info.width * jpeg.info.height,
            colorSource: "rendered",
          });
          diag.cropped++;
          diag.imageDetails.push({
            page: pageIdx,
            pdfBbox: [x0, y0, x1, y1],
            pixelBbox: { left, top, width, height },
            outputBytes: jpeg.data.length,
          });
        } catch (e: any) {
          diag.cropFailed++;
          diag.errors.push(`crop page ${pageIdx} bbox ${x0},${y0},${x1},${y1}: ${e?.message ?? String(e)}`);
        }
      }

      // Fallback: if no image blocks were found on page 1, use the whole
      // rendered page as a hero candidate.
      if (pageIdx === 0 && imageBlocks.length === 0) {
        try {
          const pageJpeg = await sharp(pagePng)
            .resize(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 90 })
            .toBuffer({ resolveWithObject: true });
          out.push({
            dataUri: `data:image/jpeg;base64,${pageJpeg.data.toString("base64")}`,
            width: pageJpeg.info.width,
            height: pageJpeg.info.height,
            area: pageJpeg.info.width * pageJpeg.info.height,
            colorSource: "rendered",
          });
          diag.cropped++;
          diag.imageDetails.push({
            page: pageIdx,
            pdfBbox: [0, 0, renderedWidth / RENDER_SCALE, renderedHeight / RENDER_SCALE],
            pixelBbox: { left: 0, top: 0, width: pageJpeg.info.width, height: pageJpeg.info.height },
            outputBytes: pageJpeg.data.length,
          });
        } catch (e: any) {
          diag.errors.push(`page ${pageIdx} fallback render: ${e?.message ?? String(e)}`);
        }
      }

      diag.pagesProcessed++;
    } catch (e: any) {
      diag.errors.push(`page ${pageIdx}: ${e?.message ?? String(e)}`);
    } finally {
      try { pixmap?.destroy?.(); } catch {}
      try { page?.destroy?.(); } catch {}
    }
  }

  try { doc.destroy?.(); } catch {}

  return { images: out.sort((a, b) => b.area - a.area), diagnostic: diag };
}
