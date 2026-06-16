// Ranks extracted images by relevance to the event described in the flyer.
// Runs a quick Claude Haiku call with downscaled thumbnail versions of the
// top candidate images — keeping the payload small so this adds <5 seconds
// to the pipeline rather than 30-60 seconds with full-resolution images.

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { ExtractedFlyer } from "./extracted-flyer";
import type { ExtractedImage } from "./pdf-images";

const MAX_CANDIDATES = 5;
const THUMBNAIL_PX = 512; // longest edge — enough to distinguish event content from stock shots
const RANKING_TIMEOUT_MS = 12_000; // fall back to area-order if Haiku doesn't respond in time

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

export async function rankImagesByRelevance(
  images: ExtractedImage[],
  flyer: ExtractedFlyer,
): Promise<ExtractedImage[]> {
  if (images.length <= 1) return images;
  if (!process.env.ANTHROPIC_API_KEY) return images;

  const candidates = images.slice(0, MAX_CANDIDATES);

  const eventContext = [
    flyer.headline,
    flyer.heroHook,
    flyer.eventDate ? `Date: ${flyer.eventDate}` : null,
    flyer.eventLocation ? `Location: ${flyer.eventLocation}` : null,
    flyer.bodyParagraphs?.[0],
  ]
    .filter(Boolean)
    .join(" | ");

  try {
    // Downscale to thumbnails in parallel before sending — dramatically reduces
    // the Anthropic request payload from potentially 10MB+ to ~200KB.
    const thumbnailUris = await Promise.all(
      candidates.map((img) => toThumbnailDataUri(img.dataUri)),
    );

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });

    const rankingCall = anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are selecting images for a senior living marketing email about: "${eventContext}"

Here are ${candidates.length} images numbered 0–${candidates.length - 1}. Rank them best-to-worst. Prefer images related to the event theme, activity, or food. Generic community/building shots rank below event-specific ones. Logos, diagrams, and blank images rank last.

Reply with ONLY a JSON array of indices. Example: [2,0,3,1]`,
            },
            ...thumbnailUris.map((uri) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: (uri.split(";")[0].replace("data:", "") ||
                  "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: uri.split(",")[1] ?? "",
              },
            })),
          ],
        },
      ],
    });

    // Race against a timeout — if Haiku is slow, fall back to area order rather
    // than blocking the rest of the pipeline.
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), RANKING_TIMEOUT_MS),
    );

    const response = await Promise.race([rankingCall, timeoutPromise]);
    if (!response) return images; // timed out

    const text =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const match = text.match(/\[[\d,\s]+\]/);
    if (!match) return images;

    const ranking: number[] = JSON.parse(match[0]);
    const seen = new Set<number>();
    const reordered: ExtractedImage[] = [];

    for (const idx of ranking) {
      if (idx >= 0 && idx < candidates.length && !seen.has(idx)) {
        reordered.push(candidates[idx]);
        seen.add(idx);
      }
    }
    for (let i = 0; i < candidates.length; i++) {
      if (!seen.has(i)) reordered.push(candidates[i]);
    }
    return [...reordered, ...images.slice(MAX_CANDIDATES)];
  } catch {
    return images;
  }
}
