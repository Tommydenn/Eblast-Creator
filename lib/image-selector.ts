// Classifies extracted images into exterior / interior / other slots so the
// correct type of photo lands in each section of the email:
//   hero      → images[0] (largest, typically the main flyer photo — unchanged)
//   secondary → first exterior shot; fallback: first interior
//   gallery   → interiors; additional exteriors allowed only when secondary is already exterior
//
// Runs a single Claude Haiku call with downscaled thumbnails — adds <5 seconds.

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { ExtractedImage } from "./pdf-images";

const MAX_CANDIDATES = 8;
const THUMBNAIL_PX = 512;
const TIMEOUT_MS = 12_000;

async function toThumbnailDataUri(dataUri: string): Promise<string> {
  try {
    const commaIdx = dataUri.indexOf(",");
    if (commaIdx === -1) return dataUri;
    const buffer = Buffer.from(dataUri.slice(commaIdx + 1), "base64");
    const thumb = await sharp(buffer, { failOn: "none" })
      .resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    return `data:image/jpeg;base64,${thumb.toString("base64")}`;
  } catch {
    return dataUri;
  }
}

/**
 * Reorders images so the correct types land in the correct email slots:
 *   [0] hero      = largest non-graphic image by pixel area (graphics like logos are skipped)
 *   [1] secondary = first exterior shot (building/grounds); fallback: first interior
 *   [2+] gallery  = interiors first; remaining exteriors only if secondary is already exterior
 *
 * All candidates (including index 0) are classified so that a high-res logo that
 * sorts to the top of the area list doesn't accidentally become the hero image.
 */
export async function classifyImagesForSlots(
  images: ExtractedImage[],
): Promise<ExtractedImage[]> {
  if (images.length <= 1) return images;
  if (!process.env.ANTHROPIC_API_KEY) return images;

  // Classify all candidates (images already sorted by area desc from pdf-images).
  const candidates = images.slice(0, MAX_CANDIDATES);
  const overflow = images.slice(MAX_CANDIDATES);

  try {
    const thumbnails = await Promise.all(candidates.map((img) => toThumbnailDataUri(img.dataUri)));
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });

    const classifyCall = anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Classify each image (numbered 0–${candidates.length - 1}) for a senior living community marketing email.

Categories:
- "exterior": outside of a building, community entrance, grounds, parking, signage, building facade
- "interior": inside the building — rooms, dining area, common space, hallway, apartment interior
- "people": photos of residents, staff, events, activities, food, lifestyle — real photography with people or life in it
- "graphic": flyer design elements that are NOT real photography — logos, watermarks, text overlays, decorative borders, gradient backgrounds, clip art, icons, color blocks, texture fills, any image that is primarily text or a design graphic

Reply with ONLY a JSON array, one label per image. Example for 4 images: ["exterior","interior","people","graphic"]`,
            },
            ...thumbnails.map((uri) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: (uri.split(";")[0].replace("data:", "") || "image/jpeg") as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: uri.split(",")[1] ?? "",
              },
            })),
          ],
        },
      ],
    });

    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    const response = await Promise.race([classifyCall, timeout]);
    if (!response) return images;

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return images;

    const classes: string[] = JSON.parse(match[0]);
    const labeled = candidates.map((img, i) => ({ img, cls: classes[i] ?? "graphic" }));

    // "graphic" images (logos, text overlays, design elements) are excluded entirely.
    // Candidates are already sorted by area desc, so the first non-graphic is the largest real photo.
    const allReal = labeled.filter((x) => x.cls !== "graphic");
    if (allReal.length === 0) return images; // nothing real — leave untouched

    const hero = allReal[0].img;
    const rest = allReal.slice(1);

    const exteriors = rest.filter((x) => x.cls === "exterior").map((x) => x.img);
    const interiors = rest.filter((x) => x.cls === "interior").map((x) => x.img);
    const people    = rest.filter((x) => x.cls === "people").map((x) => x.img);

    // secondary = exterior[0] if available, else interior[0], else people[0]
    // gallery   = interiors + people; remaining exteriors ONLY if secondary is already exterior
    const secondaryIsExterior = exteriors.length > 0;
    const ordered = secondaryIsExterior
      ? [...exteriors, ...interiors, ...people]
      : [...interiors, ...people, ...exteriors];

    return [hero, ...ordered, ...overflow];
  } catch {
    return images;
  }
}

/** @deprecated Use classifyImagesForSlots instead. Kept for any callers not yet migrated. */
export async function rankImagesByRelevance(
  images: ExtractedImage[],
): Promise<ExtractedImage[]> {
  return classifyImagesForSlots(images);
}
