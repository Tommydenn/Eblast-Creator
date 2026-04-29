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

// JSON Schema for the ExtractedFlyer — used as a tool input schema so Claude
// returns guaranteed-shape output instead of free-form prose we have to parse.
const extractFlyerToolSchema = {
  type: "object",
  required: [
    "subject", "previewText", "eyebrow", "headline", "heroHook",
    "storyEyebrow", "bodyParagraphs",
    "ctaEyebrow", "ctaHeadline", "ctaSubline", "ctaButtonLabel", "ctaButtonHref",
    "heroImageAlt", "heroImageDescription",
    "audienceHints",
  ],
  properties: {
    subject: { type: "string", description: "Email subject line. <=60 chars. Specific, benefit-led, no clickbait." },
    previewText: { type: "string", description: "Inbox preview text. <=120 chars. Reinforces subject without repeating it." },

    eyebrow: { type: "string", description: "All-caps eyebrow text above the hero headline. 1-3 words, e.g. 'RSVP REQUIRED'." },
    headline: { type: "string", description: "Hero headline. 2-5 words. Title-case." },
    scriptSubheadline: { type: "string", description: "Optional script-styled subhead, 1-3 words." },
    heroHook: { type: "string", description: "One italic sentence below the date in the hero block." },

    eventDate: { type: "string", description: "Event date if applicable, e.g. 'Wednesday, May 13'. Empty if no event." },
    eventTime: { type: "string", description: "Event time, e.g. '2:00 PM'." },
    eventLocation: { type: "string" },

    storyEyebrow: { type: "string", description: "Eyebrow above the body copy, e.g. 'A Look Inside Our Kitchen'." },
    storyScriptTitle: { type: "string", description: "Optional script-styled section title." },
    bodyParagraphs: {
      type: "array",
      items: { type: "string" },
      description: "2-4 paragraphs of body copy. Plain text. Ground every claim in the flyer — do not invent details.",
    },

    pullQuoteEyebrow: { type: "string", description: "Optional eyebrow above the pull-quote block." },
    pullQuote: { type: "string", description: "A 1-2 sentence value prop or quoted line from the flyer." },
    pullQuoteAttribution: { type: "string" },

    ctaEyebrow: { type: "string", description: "Final-CTA eyebrow, e.g. 'Reserve Your Seat'." },
    ctaHeadline: { type: "string", description: "CTA headline, often the date+time again." },
    ctaSubline: { type: "string", description: "Supporting subline, e.g. 'Seating is limited'." },
    ctaButtonLabel: { type: "string", description: "Button text, e.g. 'Call 920.504.3443'." },
    ctaButtonHref: { type: "string", description: "Button href: tel:, mailto:, or https:// URL. Pull from the flyer." },

    heroImageAlt: { type: "string" },
    heroImageDescription: { type: "string", description: "Photo direction for the hero slot, e.g. 'Plated bruschetta on a wood board, top-down, natural light'." },

    secondaryImageAlt: { type: "string" },
    secondaryImageDescription: { type: "string" },

    audienceHints: {
      type: "array",
      items: { type: "string" },
      description: "Who this is for, e.g. ['adult children of prospects', 'current residents'].",
    },
  },
};

function systemPrompt(community: Community, pastSends?: PastSendForContext[]): string {
  const voiceBlock = community.voice
    ? [
        community.voice.tone?.length ? `Tone: ${community.voice.tone.join(", ")}.` : null,
        community.voice.dos?.length ? `Do: ${community.voice.dos.join(" / ")}` : null,
        community.voice.donts?.length ? `Don't: ${community.voice.donts.join(" / ")}` : null,
        community.voice.prohibited?.length ? `Never use these words/phrases: ${community.voice.prohibited.join(", ")}.` : null,
        community.voice.approvedClaims?.length ? `Approved claims you may use: ${community.voice.approvedClaims.join(" / ")}` : null,
        community.voice.photoStyleNotes ? `Photo direction: ${community.voice.photoStyleNotes}` : null,
      ].filter(Boolean).join("\n")
    : "";

  const hasVoice = voiceBlock.length > 0;
  const fallbackVoice =
    community.voiceNotes ??
    "Warm, hospitable, dignified. Speak to both prospective residents and the adult children making the decision for a parent.";

  const trackingPhoneNote = community.trackingPhone
    ? `\n- For phone CTAs in this email, use ${community.trackingPhone} (the community's tracking number) — do NOT use any other phone number from the flyer, even if the flyer prints a different one.`
    : "";

  const pastSendsBlock =
    pastSends && pastSends.length > 0
      ? `

Recent eblasts from ${community.displayName} (use as voice/style/length reference; do NOT copy lines verbatim):
${formatPastSendsForPrompt(pastSends)}

Notes on using this:
- High-performing past subjects (higher open %) are signals about what works for this audience. Match their structure when the topic fits.
- The drafts that already shipped represent the brand's accepted voice — match it. If your draft sounds noticeably different, that's a yellow flag.`
      : "";

  return `You are a senior marketing copywriter for ${community.displayName}, a ${community.type.replace(/_/g, " ")} senior living community${community.address.city ? ` in ${community.address.city}, ${community.address.state ?? ""}`.trim() : ""}.

Your job: take a printed flyer (provided as a PDF) and translate it into the structured fields for a marketing email that will be sent to that community's contact list.

Voice and audience:
${hasVoice ? voiceBlock : fallbackVoice}

Hard rules:
- Never invent facts. Every name, date, phone number, time, and quote in your output must appear in the flyer. If something isn't in the flyer, leave that field empty.
- Use the community's actual name (${community.displayName}) — not generic terms like "our community."
- Subject lines are specific and benefit-led, not vague ("You're invited: ..." is fine; "Important update" is not).
- Body copy is grounded and warm, not salesy. Avoid superlatives and exclamation points. Single thoughtful emoji in subject lines is allowed when it's seasonal/celebratory and the brand has used emoji historically — otherwise omit.
- Honor the flyer's tone. If the flyer is event-focused, your email is event-focused.
- Keep paragraphs to 2-4 sentences. Write for skim-readers in inboxes.${trackingPhoneNote}${pastSendsBlock}

Output format: call the \`extract_flyer\` tool with a fully-populated structured object. Do not write prose; only call the tool.`;
}

/**
 * Read a flyer PDF and return structured marketing-email content.
 */
export async function extractFlyerContent(opts: {
  pdfBase64: string;
  community: Community;
  pastSends?: PastSendForContext[];
}): Promise<ExtractedFlyer> {
  const c = client();

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt(opts.community, opts.pastSends),
    tools: [
      {
        name: "extract_flyer",
        description: "Return the structured marketing-email content extracted from the flyer.",
        input_schema: extractFlyerToolSchema as any,
      },
    ],
    tool_choice: { type: "tool", name: "extract_flyer" },
    messages: [
      {
        role: "user",
        // Cast to any: the SDK's published types still classify "document" as
        // a beta content block in some minor versions. The runtime API accepts
        // it cleanly on Sonnet 4.6.
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: opts.pdfBase64 },
          },
          {
            type: "text",
            text: "Read this flyer and extract its content as a marketing email by calling the extract_flyer tool.",
          },
        ] as any,
      },
    ],
  });

  const toolUseBlock = response.content.find((b: any) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Claude did not return tool_use output. Check model response.");
  }
  return toolUseBlock.input as ExtractedFlyer;
}

/**
 * Refine an existing extracted draft based on a user instruction.
 * E.g. "make the headline shorter" or "change the tone to more casual".
 */
export async function refineFlyerContent(opts: {
  current: ExtractedFlyer;
  instruction: string;
  community: Community;
  pastSends?: PastSendForContext[];
}): Promise<ExtractedFlyer> {
  const c = client();

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `${systemPrompt(opts.community, opts.pastSends)}

You are now in REFINEMENT mode. The user has an existing extracted draft and wants targeted changes.
- Apply the user's specific instruction. Touch only what they ask about.
- Leave every other field exactly as the user has it. Do not "improve" things you weren't asked to improve.
- If the user's instruction implies a cascading change (e.g. "make the headline shorter" might naturally also affect a script subhead that quotes it), make the minimum cascading change and explain nothing.
- Always return the FULL updated object via the extract_flyer tool. Do not return a partial diff.`,
    tools: [
      {
        name: "extract_flyer",
        description: "Return the FULL updated marketing-email content with the user's refinement applied.",
        input_schema: extractFlyerToolSchema as any,
      },
    ],
    tool_choice: { type: "tool", name: "extract_flyer" },
    messages: [
      {
        role: "user",
        content: `Here is the current draft:\n\n${JSON.stringify(opts.current, null, 2)}\n\nMy instruction: ${opts.instruction}`,
      },
    ],
  });

  const toolUseBlock = response.content.find((b: any) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Claude did not return tool_use output for refinement.");
  }
  return toolUseBlock.input as ExtractedFlyer;
}
