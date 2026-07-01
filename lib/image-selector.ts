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
 *   [0] hero     = images[0] (largest/first from PDF — always the main flyer photo)
 *   [1] secondary = first exterior shot (building/grounds); fallback: first interior
 *   [2+] gallery  = interiors first; remaining exteriors only if secondary is already exterior
 */
export async function classifyImagesForSlots(
  images: ExtractedImage[],
): Promise<ExtractedImage[]> {
  if (images.length <= 1) return images;
  if (!process.env.ANTHROPIC_API_KEY) return images;

  // Hero is always images[0] — never touched. Classify the remainder.
  const hero = images[0];
  const rest = images.slice(1, 1 + MAX_CANDIDATES);
  if (rest.length === 0) return images;

  try {
    const thumbnails = await Promise.all(rest.map((img) => toThumbnailDataUri(img.dataUri)));
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });

    const classifyCall = anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Classify each image (numbered 0–${rest.length - 1}) for a senior living community marketing email.

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
    const labeled = rest.map((img, i) => ({ img, cls: classes[i] ?? "graphic" }));

    const exteriors = labeled.filter((x) => x.cls === "exterior").map((x) => x.img);
    const interiors = labeled.filter((x) => x.cls === "interior").map((x) => x.img);
    const people    = labeled.filter((x) => x.cls === "people").map((x) => x.img);
    // "graphic" images (logos, text overlays, design elements) are excluded entirely

    // secondary = exterior[0] if available, else interior[0], else people[0]
    // gallery   = interiors + people; remaining exteriors ONLY if secondary is already exterior
    const secondaryIsExterior = exteriors.length > 0;
    const ordered = secondaryIsExterior
      ? [...exteriors, ...interiors, ...people]   // exterior leads → secondary, rest in gallery
      : [...interiors, ...people, ...exteriors];  // no exterior → interior leads secondary

    return [hero, ...ordered, ...images.slice(1 + MAX_CANDIDATES)];
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
