// The reviewer. Runs after a draft is generated (and after every refinement)
// and returns severity-tagged findings the salesperson would want flagged
// before this hits HubSpot. Does NOT draft. Does NOT auto-fix. Surfaces issues.
//
// v1 is a single Claude call with structured output. Once we wire up Postgres
// + HubSpot analytics ingestion, this becomes a real tool-use loop with
// `lookup_past_sends`, `read_open_rates_by_subject_pattern`, etc.

import Anthropic from "@anthropic-ai/sdk";
import type { Community } from "@/data/communities";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import {
  formatPastSendsForPrompt,
  type PastSendForContext,
} from "@/lib/past-sends-retrieval";

const MODEL = "claude-sonnet-4-6";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type ReviewVerdict = "ready" | "needs_revision" | "blocking_issues";
export type FindingSeverity = "blocker" | "important" | "nice_to_have";
export type FindingCategory =
  | "voice"
  | "brand"
  | "field_completeness"
  | "subject_line"
  | "preview_text"
  | "cta"
  | "structure"
  | "compliance"
  | "send_strategy"
  | "image_quality";

/**
 * One of the images currently embedded in the rendered email that the critic
 * judges to be unusable (blank, corrupted, off-topic, off-brand). The
 * agentic loop reads this list and drops the named slot from the next round's
 * image assignment.
 */
export interface FlaggedImage {
  slot: "hero" | "secondary" | "gallery";
  /** 1-indexed position in the gallery grid. Required when slot == "gallery". */
  galleryIndex?: number;
  /** Why it's unusable. */
  reason: string;
}

export interface CriticFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  /** Which ExtractedFlyer field this targets, when applicable. */
  field?: string;
  /** What's wrong, in one sentence. */
  issue: string;
  /**
   * A concrete refinement instruction the user can apply. Phrased as the user
   * would say it in the refine box, e.g. "Tighten the subject to 'Reserve
   * Your Seat — Dining Director Info Session'."
   */
  suggestion?: string;
  /** Why this matters. */
  rationale: string;
}

export interface DraftReview {
  verdict: ReviewVerdict;
  /** 1-2 sentence overall take. Lead with what's strong, then what to watch. */
  summary: string;
  findings: CriticFinding[];
  /** If the subject is weak, 2-3 alternatives, each <=60 chars. */
  subjectLineAlternatives?: string[];
  /** e.g. "Tuesday 10am — matches the community's strongest historical opens." */
  sendTimeRecommendation?: string;
  /** Flag if the recipient list isn't configured or seems wrong. */
  recipientListNote?: string;
  /**
   * Images currently in the rendered email that the critic judges unusable.
   * The agentic loop drops these slots and re-renders next round.
   */
  flaggedImages?: FlaggedImage[];
}

/**
 * Optional images for the critic to actually look at. Hero is the largest
 * image extracted from the PDF; secondary the next largest; gallery the rest.
 * If absent, the critic does a text-only review (and cannot catch blank /
 * broken / off-topic image issues).
 */
export interface ReviewImages {
  heroDataUri?: string;
  secondaryDataUri?: string;
  galleryDataUris?: string[];
}

function dataUriToImageBlock(dataUri: string): {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
} {
  const m = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid image data URI passed to critic");
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

const reviewSchema = {
  type: "object",
  required: ["verdict", "summary", "findings"],
  properties: {
    verdict: {
      type: "string",
      enum: ["ready", "needs_revision", "blocking_issues"],
      description:
        "'ready' = could send as-is. 'needs_revision' = important issues to address. 'blocking_issues' = do NOT send until fixed.",
    },
    summary: {
      type: "string",
      description: "1-2 sentences. Lead with what's strong, then what needs work.",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "category", "issue", "rationale"],
        properties: {
          severity: { type: "string", enum: ["blocker", "important", "nice_to_have"] },
          category: {
            type: "string",
            enum: [
              "voice",
              "brand",
              "field_completeness",
              "subject_line",
              "preview_text",
              "cta",
              "structure",
              "compliance",
              "send_strategy",
              "image_quality",
            ],
          },
          field: { type: "string", description: "Which ExtractedFlyer field this finding applies to, when relevant." },
          issue: { type: "string", description: "What's wrong, in one sentence." },
          suggestion: {
            type: "string",
            description:
              "A concrete refinement instruction the user could paste into the refine box, e.g. 'Tighten the headline to 3 words and remove the script subhead.'.",
          },
          rationale: { type: "string", description: "Why this matters." },
        },
      },
    },
    subjectLineAlternatives: {
      type: "array",
      items: { type: "string" },
      description: "If the subject could be stronger, 2-3 alternatives (each <=60 chars).",
    },
    sendTimeRecommendation: {
      type: "string",
      description: "Suggested send window with rationale. Skip if unsure.",
    },
    recipientListNote: {
      type: "string",
      description: "Flag if the recipient list isn't configured or seems wrong. Skip if fine.",
    },
    flaggedImages: {
      type: "array",
      description:
        "Images currently in the rendered email that are unusable (blank, corrupted, off-topic, off-brand). The drafter cannot improve image bytes — flagging an image causes the loop to drop that slot from the next render.",
      items: {
        type: "object",
        required: ["slot", "reason"],
        properties: {
          slot: { type: "string", enum: ["hero", "secondary", "gallery"] },
          galleryIndex: {
            type: "number",
            description: "1-indexed position in the gallery grid. Required when slot == 'gallery'.",
          },
          reason: { type: "string", description: "Why it's unusable, in one sentence." },
        },
      },
    },
  },
};

function systemPrompt(community: Community, pastSends?: PastSendForContext[]): string {
  return `You are a senior email marketing reviewer for Great Lakes Management's senior-living communities. You do NOT draft emails — you review what's already drafted and catch issues before they reach the site salesperson.

Be direct, specific, and pragmatic. Distinguish:
- BLOCKERS: would embarrass us if sent (factual error, missing event detail, broken CTA href, voice violation, fabricated information)
- IMPORTANT: meaningful quality issues (weak subject, salesy or generic body, vague CTA copy, missing audience cues)
- NICE TO HAVE: polish (rhythm, word choice, alt text)

Skip findings if there's nothing wrong. Don't manufacture issues to justify your existence — a clean draft is a valid review with zero findings and a 'ready' verdict.

Community context
- Name: ${community.displayName} (${community.shortName})
- Type: ${community.type.replace(/_/g, " ")}${community.careTypes && community.careTypes.length > 0 ? ` — ${community.careTypes.join(", ")}` : ""}
- Location: ${community.address.city}, ${community.address.state}
- Sender (recipients see this): ${community.senders[0]?.name ?? community.displayName} <${community.senders[0]?.email ?? community.email ?? ""}>
${community.marketingDirector ? `- Marketing director (builds + schedules in HubSpot): ${community.marketingDirector.name}` : ""}
${community.hubspot.listId ? `- Recipient list configured: ${community.hubspot.listId}` : "- Recipient list NOT YET CONFIGURED — flag this as a blocker."}

Voice
${community.voiceNotes ?? "Warm, hospitable, dignified. Speak to prospective residents AND adult children making the decision for a parent."}
${community.taglines && community.taglines.length > 0 ? `Brand taglines you can lean on: ${community.taglines.join(" / ")}` : ""}
${community.amenities && community.amenities.length > 0 ? `Distinctive amenities to reference: ${community.amenities.join(", ")}` : ""}

Hard rules to enforce
- Every name, date, time, phone number, email, URL must be plausible for a real flyer (not invented).
- Subject lines: <=60 chars, specific, benefit-led, no clickbait, no all-caps, no exclamation marks, no emoji.
- Preview text: complements the subject without repeating it. <=120 chars.
- CTAs: clear actionable label; href is tel:, mailto:, or https://. The label should match the action (e.g. "Call 920.504.3443" with href tel:9205043443).
- Body: 2-4 paragraphs of grounded copy. No superlatives, no emoji, no exclamation marks. Skim-readable.
- Voice: warm and dignified, never salesy or pushy. Audience reads carefully — assume both adult children and prospective residents.
- Communities use their actual name (${community.displayName}), never generic "our community."
- If event-focused: date AND time AND location should all be present. Flag missing event details as blockers.

Visual checks (when images are attached to the user message)
- Each image is labeled with its role (HERO IMAGE / SECONDARY IMAGE / GALLERY IMAGE n). Those are the actual images currently rendered in the email.
- Flag any image that is blank, near-blank (mostly solid white/black), corrupted (banding, posterization, alpha-channel artifacts, looks like a mask/alpha layer instead of a photo), or unreadable. These are BLOCKERS — populate the \`flaggedImages\` array with the slot.
- Flag images that obviously don't match the email's topic (e.g. a hero of an empty parking lot when the email is about dining), or are off-brand for ${community.displayName}. These are IMPORTANT.
- The drafter cannot improve image bytes. When you flag an image, the loop drops that slot for the next round and re-renders with the next available image. So flag generously — there's no cost beyond losing that slot.
- If you flag a gallery image, you MUST set galleryIndex (1-indexed).
- Image alt text and image *direction* (heroImageAlt, heroImageDescription) are still text findings — use those for category=image_quality with field=heroImageAlt.

${
    pastSends && pastSends.length > 0
      ? `Recent eblasts from ${community.displayName} (use these as ground-truth voice/style/length references AND for performance comparisons in send_strategy findings):
${formatPastSendsForPrompt(pastSends)}

When you flag a send_strategy concern, refer to specific past sends ("the recent 'Reserve Your Seat' subject opened at 38% — this draft's 'Join us' phrasing has historically opened ~15 points lower for this community"). If a past send opened well and the current draft drifts from its formula in a way that may hurt performance, flag with category: send_strategy. If the current draft is in line with what's working, do NOT manufacture a finding.`
      : `For send_strategy findings: no historical performance data is wired up yet for this community. Prefer concrete generic reasoning ("Tuesdays 10am consistently outperform Mondays for senior-living audiences") over claims about past performance you can't verify.`
  }

Output: call the \`review_draft\` tool. Do not write prose; only call the tool.`;
}

export async function reviewDraft(opts: {
  flyer: ExtractedFlyer;
  community: Community;
  images?: ReviewImages;
  pastSends?: PastSendForContext[];
}): Promise<DraftReview> {
  const c = client();

  // Build the user message: text labels + image blocks for each slot the
  // critic should look at, then the JSON to review. Order matters — Claude
  // reads it top-to-bottom and we want labels right next to their image.
  const userContent: any[] = [];
  if (opts.images?.heroDataUri) {
    userContent.push({ type: "text", text: "HERO IMAGE (largest from the PDF, used as the email hero):" });
    userContent.push(dataUriToImageBlock(opts.images.heroDataUri));
  }
  if (opts.images?.secondaryDataUri) {
    userContent.push({
      type: "text",
      text: "SECONDARY IMAGE (placed inline between body paragraphs):",
    });
    userContent.push(dataUriToImageBlock(opts.images.secondaryDataUri));
  }
  if (opts.images?.galleryDataUris && opts.images.galleryDataUris.length > 0) {
    for (let i = 0; i < opts.images.galleryDataUris.length; i++) {
      userContent.push({
        type: "text",
        text: `GALLERY IMAGE ${i + 1} (in the "A Look Around ${opts.community.shortName}" grid):`,
      });
      userContent.push(dataUriToImageBlock(opts.images.galleryDataUris[i]));
    }
  }
  userContent.push({
    type: "text",
    text: `Review this email draft for ${opts.community.displayName}:

${JSON.stringify(opts.flyer, null, 2)}

Return your review by calling the review_draft tool.`,
  });

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt(opts.community, opts.pastSends),
    tools: [
      {
        name: "review_draft",
        description: "Submit your structured review of the email draft.",
        input_schema: reviewSchema as any,
      },
    ],
    tool_choice: { type: "tool", name: "review_draft" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUseBlock = response.content.find((b: any) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Reviewer did not return tool_use output.");
  }
  return toolUseBlock.input as DraftReview;
}
