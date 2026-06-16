// Ranks extracted images by relevance to the event described in the flyer.
// Runs a quick Claude Haiku call with the top candidate images so the
// agentic loop starts with the most contextually appropriate photo as hero
// rather than whatever happened to be the largest pixel-area image.

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFlyer } from "./extracted-flyer";
import type { ExtractedImage } from "./pdf-images";

const MAX_CANDIDATES = 6;

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
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are selecting images for a senior living marketing email about: "${eventContext}"

Here are ${candidates.length} images numbered 0–${candidates.length - 1}. Rank them best-to-worst for this email. Prioritize images that relate to the event theme, activity, or food. Generic community/building photos are fine but rank below event-specific ones. Logos, blank images, and diagrams should rank last.

Reply with ONLY a JSON array of indices, best first. Example: [2,0,3,1]`,
            },
            ...candidates.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: (img.dataUri.split(";")[0].replace("data:", "") ||
                  "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: img.dataUri.split(",")[1] ?? "",
              },
            })),
          ],
        },
      ],
    });

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
