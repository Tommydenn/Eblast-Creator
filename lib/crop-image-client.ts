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
/** Never crop to nothing, however far someone drags the zoom. */
const MIN_CROP_EDGE = 32;

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
 * repositioning tool uses) and tightened by `zoom`. Returns a JPEG data URI.
 */
export async function cropInBrowser(
  imageUrl: string,
  targetRatio: number,
  x = 50,
  y = 50,
  zoom = 1,
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
  // Zoom takes a smaller piece of the same shape, which is what makes the
  // subject bigger in a slot of fixed size. 1 is the whole of the largest box
  // that fits, which is where this started and still the default.
  const tightened = Math.max(1, zoom);
  cropWidth = Math.round(cropWidth / tightened);
  cropHeight = Math.round(cropHeight / tightened);

  // Rounding can push the derived side a pixel past the source when the two
  // ratios are nearly equal.
  cropWidth = Math.min(Math.max(cropWidth, MIN_CROP_EDGE), width);
  cropHeight = Math.min(Math.max(cropHeight, MIN_CROP_EDGE), height);

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

/**
 * Shrink a photo from someone's device before it goes anywhere near a draft.
 *
 * A photo straight off a phone or camera is routinely several megabytes, and
 * a save request cannot carry that, so it used to be dropped without a word
 * and the photo would quietly vanish on the next reload.
 *
 * Safe to do here: a device photo is ordinary RGB. Flyer photos are CMYK and
 * are shrunk on the server instead, where Sharp converts them properly.
 */
export async function downscaleInBrowser(
  imageUrl: string,
  maxEdge = 1600,
  maxChars = 1_500_000,
): Promise<string> {
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return imageUrl;
  const longest = Math.max(width, height);
  if (longest <= maxEdge && imageUrl.length <= maxChars) return imageUrl;

  const scale = Math.min(1, maxEdge / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
