// Subject Specialist agent.
//
// Subject lines have a different objective function from the rest of the
// email (open rate vs. engagement) and benefit from multi-candidate
// generation + evaluation rather than single-shot drafting. This agent runs
// AFTER the drafter produces an initial draft and BEFORE the critic reviews,
// so the email arriving at the critic already has its strongest possible
// subject + preview pair.
//
// Inputs: the full extracted flyer (so the specialist knows the email's
// content), the community + brand, and the last 12 PUBLISHED sends with
// open rates (so it can match patterns that have actually worked).
//
// Output: 5–7 ranked candidates, a winner, and a short rationale. The
// drafter's original subject is one of the candidates so it isn't unfairly
// replaced — it has to win on merit.

import Anthropic from "@anthropic-ai/sdk";
import type { Community } from "@/lib/db/queries";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import {
  formatPastSendsForPrompt,
  type PastSendForContext,
} from "@/lib/past-sends-retrieval";
import { SENIOR_LIVING_CRAFT_DOCTRINE } from "@/lib/senior-living-craft";
import { SENIOR_60_PLUS_SUBJECT_RESEARCH } from "@/lib/senior-60-plus-research";

const MODEL = "claude-sonnet-4-6";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type SubjectApproach =
  | "specificity-led"      // names a person, dish, or specific detail
  | "time-led"             // leads with the day or time
  | "question"             // opens with a real question, not clickbait
  | "surprise"             // an unexpected angle the audience hasn't heard
  | "benefit-led"          // crisp benefit framing
  | "story-tease"          // a glimpse of a moment
  | "warmth-led"           // hospitality-forward, conversational
  | "data-led"             // names a real fact or number
  | "drafter-original";    // the drafter's submitted subject preserved

export interface SubjectCandidate {
  subject: string;
  previewText: string;
  approach: SubjectApproach;
  charCount: number;
  /** 1 sentence: what this candidate gets right. */
  rationale: string;
}

export interface SubjectSpecialistResult {
  winner: SubjectCandidate;
  /** 2–3 strong runners-up the user can swap in with one click. */
  alternatives: SubjectCandidate[];
  /** 1–2 sentences naming WHY the winner beat the alternatives. References
   *  past-send patterns or doctrine principles by name. */
  chosenRationale: string;
}

const subjectToolSchema = {
  type: "object",
  required: ["winner", "alternatives", "chosenRationale"],
  properties: {
    winner: candidateSchema(),
    alternatives: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: candidateSchema(),
    },
    chosenRationale: {
      type: "string",
      description:
        "1–2 sentences (max ~280 chars) explaining why the winner beat the alternatives. Reference SPECIFIC past-send patterns or doctrine principles by name when relevant. The user reads this to see the reasoning.",
    },
  },
};

function candidateSchema() {
  return {
    type: "object",
    required: ["subject", "previewText", "approach", "charCount", "rationale"],
    properties: {
      subject: {
        type: "string",
        description: "The subject line. Hard cap 60 chars. Sweet spot 35–50.",
      },
      previewText: {
        type: "string",
        description:
          "Inbox preview text. ≤120 chars. Complements the subject — does NOT repeat the same idea.",
      },
      approach: {
        type: "string",
        enum: [
          "specificity-led",
          "time-led",
          "question",
          "surprise",
          "benefit-led",
          "story-tease",
          "warmth-led",
          "data-led",
          "drafter-original",
        ],
        description:
          "The structural approach this candidate takes. Force structural diversity across the candidate slate.",
      },
      charCount: {
        type: "number",
        description: "Character count of `subject`. Helps the user see length distribution.",
      },
      rationale: {
        type: "string",
        description: "ONE sentence explaining what this candidate gets right and who it's for.",
      },
    },
  };
}

function systemPrompt(community: Community, pastSends?: PastSendForContext[]): string {
  const pastBlock =
    pastSends && pastSends.length > 0
      ? `

This community's recent subjects (use these as ground truth — match what's worked, surpass what hasn't):
${formatPastSendsForPrompt(pastSends)}

Pay special attention to subjects that opened above 40%. Their structure (length, lead phrase, presence of a name/day/dish) is signal. The winner should match or improve on that structure.`
      : "";

  return `You are the Subject Line Specialist for ${community.displayName}, a ${community.type.replace(/_/g, " ")} senior-living community. You don't write emails — you craft subject + preview pairs that earn the open. The drafter has handed you a finished draft. You produce 5 candidates, choose a winner, and explain.

You are a working professional in this category — held to the bar of the best senior-living direct-marketing pro on the planet. Your subjects routinely open at 40%+ for this audience.

# PRIMARY DRIVER: research-backed knowledge on the 60+ audience
The data below is conclusive. Where intuition disagrees with the research, the research wins. Apply it on every candidate.

${SENIOR_60_PLUS_SUBJECT_RESEARCH}

# Craft doctrine (style-level rules, applied AFTER the research filter)

${SENIOR_LIVING_CRAFT_DOCTRINE}

Your specific craft for subject lines

The 60-char ceiling is non-negotiable. Sweet spot is 35–50 — long enough to be specific, short enough to land on mobile.

Subject + preview is a two-line conversation. The preview complements (does NOT repeat). If the subject is "Saturday open house — bring your questions," the preview is NOT "Open house this Saturday." It's "Coffee from Chef Marcos, real residents, 10–2."

Force structural diversity in the slate. The drafter's original subject is preserved as one candidate (approach: drafter-original), so you must propose at least 4 ALTERNATIVES — each from a different approach. Don't generate 5 specificity-led variants; generate 1 specificity-led, 1 time-led, 1 question, 1 surprise, etc. Diversity is the point.

For each candidate, evaluate against (in priority order — research first):
1. **Research filter**: does it conform to the 60+ subject rules above? If a candidate uses ALL CAPS, multiple exclamation marks, scarcity/urgency language, or a listicle frame, REJECT it before evaluating anything else. If it uses a question pattern that the research flags as low-performing for this demo, reject it.
2. **First-30-chars test**: does the value land in the first 30 characters (mobile preview cutoff)? If the most important word is at position 45, the candidate fails this test.
3. **Specificity**: does it name a real thing from the email's content (a day, a dish, a person, a place)? Generic subjects like "Spring Open House at X" lose to specific ones like "Sunday open house — bourbon tasting at 4."
4. **Pattern match against history**: does it echo the structure of past sends that opened above the community's average?
5. **Length**: 35–55 characters is the sweet spot for 60+. Hard cap at 60. Subjects under 25 chars feel low-effort — usually fail.
6. **Sender harmony**: the From line carries who's writing — don't waste subject characters re-stating the brand. Use the saved characters for specificity.
7. **The "would mom open this" test**: read it in a crowded inbox. Does it stand out by being more specific, more human, or more trustworthy than the surrounding noise?

Pick the winner that best balances specificity, performance pattern match, and warmth. The chosenRationale must reference a SPECIFIC past-send pattern or doctrine principle — not just "this one is best."${pastBlock}

Hard rules
- Never invent facts. The subject can only reference things actually in the draft / flyer.
- Subject ≤60 chars. Preview ≤120 chars.
- The drafter's original subject IS one of your candidates — don't unfairly replace it. It only loses if a stronger one wins on merit.
- 5 total candidates: 1 drafter-original + 4 alternatives. The winner is whichever is strongest, drafter-original or otherwise.

Output: call the \`craft_subject\` tool. Do not write prose; only call the tool.`;
}

export async function craftSubjectLine(opts: {
  flyer: ExtractedFlyer;
  community: Community;
  pastSends?: PastSendForContext[];
}): Promise<SubjectSpecialistResult> {
  const c = client();

  const userMsg = `Here is the drafted email content. Craft 5 subject candidates (1 keeping the drafter's original + 4 alternatives from different approaches), pick a winner, and explain.

DRAFT (key fields):
- Subject (drafter): ${JSON.stringify(opts.flyer.subject)}
- Preview (drafter): ${JSON.stringify(opts.flyer.previewText)}
- Eyebrow: ${JSON.stringify(opts.flyer.eyebrow)}
- Headline: ${JSON.stringify(opts.flyer.headline)}
- Hero hook: ${JSON.stringify(opts.flyer.heroHook)}
- Event date: ${JSON.stringify(opts.flyer.eventDate ?? "")}
- Event time: ${JSON.stringify(opts.flyer.eventTime ?? "")}
- Body: ${opts.flyer.bodyParagraphs.join("\n\n")}
- CTA label: ${JSON.stringify(opts.flyer.ctaButtonLabel)}
- Audience: ${(opts.flyer.audienceHints ?? []).join(", ")}

Return your ranked candidates via the craft_subject tool.`;

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt(opts.community, opts.pastSends),
    tools: [
      {
        name: "craft_subject",
        description: "Submit your ranked subject + preview candidates with a chosen winner.",
        input_schema: subjectToolSchema as any,
      },
    ],
    tool_choice: { type: "tool", name: "craft_subject" },
    messages: [{ role: "user", content: userMsg }],
  });

  const toolUseBlock = response.content.find((b: any) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Subject specialist did not return tool_use output.");
  }
  const input = toolUseBlock.input as Partial<SubjectSpecialistResult>;

  // Defensive normalization — never let downstream code see undefined here.
  if (!input.winner || !input.alternatives) {
    throw new Error("Subject specialist returned malformed result (missing winner or alternatives).");
  }
  return {
    winner: input.winner,
    alternatives: Array.isArray(input.alternatives) ? input.alternatives : [],
    chosenRationale: input.chosenRationale ?? "",
  };
}
