// Browser-only. Uses the Canvas API + pdf-lib to re-compress JPEG image
// XObjects embedded in a PDF so it fits Vercel's 4.5 MB Route Handler limit.
// Never call this from server-side code.

const MAX_DIM = 2400; // max pixel dimension; reduces very-high-res photos

type RecompressResult = { bytes: Uint8Array; width: number; height: number } | null;

async function recompressJpeg(source: Uint8Array, quality: number): Promise<RecompressResult> {
  try {
    const url = URL.createObjectURL(new Blob([new Uint8Array(source)], { type: "image/jpeg" }));

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("load failed"));
      img.src = url;
    });
    URL.revokeObjectURL(url);

    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return { bytes, width: w, height: h };
  } catch {
    return null;
  }
}

/**
 * If `file` is already under `maxBytes`, returns it unchanged.
 * Otherwise re-compresses JPEG images embedded in the PDF using the browser
 * Canvas API and returns a new (smaller) File. Falls back to the original
 * on any parse or runtime error so the caller always gets a usable file.
 */
export async function compressPdfIfNeeded(
  file: File,
  maxBytes = 4 * 1024 * 1024,
): Promise<File> {
  if (file.size <= maxBytes) return file;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PDFName: any, PDFNumber: any, PDFRawStream: any, pdfDoc: any;
  try {
    const lib = await import("pdf-lib");
    PDFName = lib.PDFName;
    PDFNumber = lib.PDFNumber;
    PDFRawStream = lib.PDFRawStream;
    pdfDoc = await lib.PDFDocument.load(await file.arrayBuffer());
  } catch {
    return file; // unparseable — let the server return 413 with the existing message
  }

  const context = pdfDoc.context;

  // Snapshot JPEG XObjects before mutating the context.
  const jpegImages: Array<{ ref: unknown; dict: unknown; originalBytes: Uint8Array }> = [];
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = obj as any;
    if (!stream.dict || !stream.contents) continue;
    const dict = stream.dict;

    const subtype = dict.get(PDFName.of("Subtype"));
    if (subtype?.toString() !== "/Image") continue;

    const filter = dict.get(PDFName.of("Filter"));
    // Filter can be a single PDFName or a PDFArray — both stringify with 'DCTDecode' for JPEG.
    if (!filter?.toString().includes("DCTDecode")) continue;

    const contents: Uint8Array = stream.contents;
    if (contents.length < 1000) continue; // skip tiny decorative images

    jpegImages.push({ ref, dict, originalBytes: contents });
  }

  if (jpegImages.length === 0) return file;

  // Try progressively harder compression until the file fits under maxBytes.
  for (const quality of [0.75, 0.6, 0.45]) {
    for (const { ref, dict, originalBytes } of jpegImages) {
      const result = await recompressJpeg(originalBytes, quality);
      if (!result || result.bytes.length >= originalBytes.length) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = dict as any;
      d.set(PDFName.of("Length"), PDFNumber.of(result.bytes.length));
      d.set(PDFName.of("Width"), PDFNumber.of(result.width));
      d.set(PDFName.of("Height"), PDFNumber.of(result.height));
      context.assign(ref, PDFRawStream.of(d, result.bytes));
    }

    const saved = new Uint8Array(await pdfDoc.save() as Uint8Array<ArrayBuffer>);
    if (saved.length <= maxBytes) {
      return new File([saved], file.name, { type: "application/pdf" });
    }
  }

  // Return best-effort result even if still over the limit.
  const best = new Uint8Array(await pdfDoc.save() as Uint8Array<ArrayBuffer>);
  return new File([best], file.name, { type: "application/pdf" });
}
