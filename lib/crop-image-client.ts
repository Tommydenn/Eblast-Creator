/**
 * Cropping a photo in the browser instead of shipping it to the server.
 *
 * Assigning or repositioning used to POST the whole photo to /api/crop-image.
 * Vercel refuses a request body over 4.5 MB, and a full-size flyer photo is
 * routinely bigger — a real one measured 6.15 MB and came back 413. The crop
 * then threw, nothing caught it, and the photo simply never appeared: the
 * "I can't assign an image" report, which only ever happened on big photos.
 *
 * The geometry here is deliberately identical to cropDataUriToXY in
 * lib/pdf-images.ts: take the largest box of the target ratio that fits inside
 * the source, then slide it by x/y. Same framing, same result — the only
 * difference is where it runs. Keep the two in step if either changes.
 */

const JPEG_QUALITY = 0.88; // matches sharp's quality: 88 on the server

export function canCropInBrowser(): boolean {
  return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Data URIs need no CORS, but a hosted photo would taint the canvas and
    // make toDataURL throw, so ask for it cross-origin up front.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo could not be read"));
    img.src = src;
  });
}

/**
 * Crop to `targetRatio`, positioned by x/y (0-100, the same scale the
 * repositioning tool uses). Returns a JPEG data URI.
 */
export async function cropInBrowser(
  imageUrl: string,
  targetRatio: number,
  x = 50,
  y = 50,
): Promise<string> {
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) throw new Error("The photo has no dimensions");

  const srcRatio = width / height;
  let cropWidth: number;
  let cropHeight: number;
  if (srcRatio > targetRatio) {
    cropHeight = height;
    cropWidth = Math.round(cropHeight * targetRatio);
  } else {
    cropWidth = width;
    cropHeight = Math.round(cropWidth / targetRatio);
  }
  // Rounding can push the derived side a pixel past the source when the two
  // ratios are nearly equal.
  cropWidth = Math.min(cropWidth, width);
  cropHeight = Math.min(cropHeight, height);

  const left = Math.round((width - cropWidth) * (x / 100));
  const top = Math.round((height - cropHeight) * (y / 100));

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot crop photos");
  ctx.drawImage(img, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
