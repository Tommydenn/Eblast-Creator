import Anthropic from "@anthropic-ai/sdk";
import type { Community } from "@/data/communities";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import {
  formatPastSendsForPrompt,
  type PastSendForContext,
} from "@/lib/past-sends-retrieval";
import { SENIOR_LIVING_CRAFT_DOCTRINE } from "@/lib/senior-living-craft";

const MODEL = "claude-sonnet-4-6";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 });
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

    eyebrow: { type: "string", description: "All-caps label above the headline. 1–3 words. Gives the CATEGORY or required action ('RSVP REQUIRED', 'DINING EVENT', 'FREE TOUR'). Must NOT echo or preview the headline — it is a tag, not a teaser." },
    headline: { type: "string", description: "The single biggest message. 2–5 words. Title-case. The 'what.' Do not use adjectives here — use the most concrete noun+verb the flyer supports." },
    scriptSubheadline: { type: "string", description: "Optional script-styled subhead. 1–3 evocative words. Only include if it adds emotional texture not in the headline (e.g. a season, a feeling). Omit rather than echo the headline." },
    heroHook: { type: "string", description: "One italic sentence below the date. Adds NEW context not in the headline — sensory detail, a specific person, or the 'why attend.' Must NOT restate the headline. Opens with a moment, not 'Join us for...'." },

    eventDate: { type: "string", description: "Event date if applicable, e.g. 'Wednesday, May 13'. Empty if no event." },
    eventTime: { type: "string", description: "Event time, e.g. '2:00 PM'." },
    eventLocation: { type: "string" },

    storyEyebrow: { type: "string", description: "Section label above the body copy. Must be fresh — must NOT echo the hero eyebrow or headline. Give it a different angle: a place, a person, a process ('Inside Our Kitchen', 'Meet Chef Marcos', 'How It Works')." },
    storyScriptTitle: { type: "string", description: "Optional script-styled section title. Only include if it opens the story with warmth or personality not covered by storyEyebrow. Omit rather than repeat." },
    bodyParagraphs: {
      type: "array",
      items: { type: "string" },
      description: "2–4 paragraphs. Each paragraph advances the story — do NOT restate the headline or heroHook in paragraph 1. Para 1: a moment (sensory, specific). Para 2: what is actually happening / why it matters. Para 3 (optional): one piece of grounding detail (a person, an amenity, a credential). Para 4 (optional): clear CTA-ready line. No exclamation marks.",
    },

    pullQuoteEyebrow: { type: "string", description: "Optional eyebrow above the pull-quote block. Omit if it would just echo the ctaEyebrow." },
    pullQuote: { type: "string", description: "A verbatim or near-verbatim line taken DIRECTLY from the flyer — a tagline printed on the flyer, a quote from a named person, or the flyer's most specific value statement word-for-word. Do NOT compose a new sentence. Do NOT paraphrase. If the flyer contains no quotable line, leave this field EMPTY." },
    pullQuoteAttribution: { type: "string", description: "The name or role of the person quoted, exactly as it appears in the flyer (e.g. 'Chef Marco Rossi' or 'Mary B., Resident'). Leave EMPTY if no attribution is in the flyer — never invent one." },

    ctaEyebrow: { type: "string", description: "Action label above the final CTA block. Must NOT repeat the hero eyebrow. Verb-led and specific: 'Reserve Your Seat', 'Save Saturday', 'Join the Table'." },
    ctaHeadline: { type: "string", description: "CTA headline — state the date+time OR a final reason to act (not the event name again). E.g. 'Saturday, June 28 · 5:30 PM' or 'Seating Is Limited'." },
    ctaSubline: { type: "string", description: "One supporting, factual line that lowers friction or adds a useful detail (cost, who's invited, what to bring, whether RSVP is needed). E.g. 'Complimentary for residents and their guests.' No urgency, scarcity, or hype. Omit if nothing fresh to add." },
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
    drafterRationale: {
      type: "string",
      description:
        "1-2 sentences (max ~280 chars) explaining which past-send patterns or brand rules you used to shape this draft. Reference SPECIFIC subjects + open % when relevant, e.g. \"Matched the 'Reserve Your Seat' formula from your top dining-event sends (avg 41% open). Held to brand voice by leaning on hospitality language over event hype.\". Only populate this when past sends or structured voice rules were in context.",
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

  const hasIntelligenceContext = (pastSends && pastSends.length > 0) || hasVoice;

  return `You are the lead copywriter for ${community.displayName}, a ${community.type.replace(/_/g, " ")} senior-living community${community.address.city ? ` in ${community.address.city}, ${community.address.state ?? ""}`.trim() : ""}. You are writing one of the best senior-living marketing emails on the planet — held to the bar of a working professional, not an intern who just learned the template.

Your job: take a printed flyer (provided as a PDF) and translate it into the structured fields for a marketing email that will be sent to this community's segmented list.

${SENIOR_LIVING_CRAFT_DOCTRINE}

This community's voice
${hasVoice ? voiceBlock : fallbackVoice}

Inviolable rules
- Never invent facts. Every name, date, phone number, time, location, and quote in your output must appear in the flyer. If a detail isn't in the flyer, leave that field empty.
- pullQuote must be a verbatim or near-verbatim lift from the flyer's printed text — not a sentence you composed. If no quotable line exists in the flyer, leave pullQuote AND pullQuoteAttribution EMPTY. A composed value proposition is not a quote.
- Use the community's actual name (${community.displayName}) — never generic substitutes like "our community" or "the community."${trackingPhoneNote}
- The CTA href is the tracking number above (or a real mailto:/https:// from the flyer). The CTA label is human-formatted ("Call 920.504.3028", not "Click here").
- Honor the flyer's intent. If the flyer is event-focused, your email is event-focused. Do not invent angles the flyer doesn't support.${pastSendsBlock}

${
    hasIntelligenceContext
      ? `Self-narration
- After completing all other fields, populate \`drafterRationale\` with 1–2 sentences (max ~280 chars) explaining which past-send patterns AND/OR brand-voice rules you applied. Be specific — name a past subject or an open-rate range when it shaped your decision. The user reads this to see HOW your memory shaped the draft.`
      : "If no past sends or voice rules were in context, leave drafterRationale empty — don't pretend memory you don't have."
  }

Output format: call the \`extract_flyer\` tool with a fully-populated structured object. Do not write prose; only call the tool. Write to inform, not to sell: the reader should finish knowing exactly what the event or offering is and why it might genuinely matter to them. Favor plain, specific, honest language over clever hooks or persuasion — clarity and concrete detail carry the email, not salesmanship. Never tease curiosity the body doesn't pay off, and never comment on your own selling (no "this isn't a sales pitch," "no pressure," "no obligation" framing).`;
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

// A desired final image arrangement, expressed by the model in terms of the
// index numbers in the photo manifest it was shown. -1 means "no photo".
export interface RefineImageLayout {
  hero: number;
  secondary: number;
  gallery: number[];
}

export interface RefineResult {
  /** The updated flyer text fields (imageLayout/refineNote stripped out). */
  flyer: ExtractedFlyer;
  /** Present only when the user explicitly asked to change which photos appear. */
  imageLayout?: RefineImageLayout;
  /** One-line summary of what changed, or an "I couldn't ..." explanation. */
  refineNote?: string;
}

// Refine schema = the extract schema plus two refine-only, non-required fields:
// imageLayout (to express deliberate photo edits) and refineNote (feedback /
// "couldn't do it" signal). Kept separate so the initial-extraction call isn't
// affected.
const refineFlyerToolSchema = {
  ...extractFlyerToolSchema,
  // Require every content field so the model ALWAYS re-emits the full object.
  // This makes "clear this field" (emit "") reliable and makes accidental
  // key-omission impossible — no field can be silently dropped on refine. In
  // refinement there is always an existing value to copy, so requiring a field
  // never forces fabrication (the model emits "" for fields that were empty).
  required: [
    "subject", "previewText", "eyebrow", "headline", "scriptSubheadline", "heroHook",
    "eventDate", "eventTime", "eventLocation",
    "storyEyebrow", "storyScriptTitle", "bodyParagraphs",
    "pullQuoteEyebrow", "pullQuote", "pullQuoteAttribution",
    "ctaEyebrow", "ctaHeadline", "ctaSubline", "ctaButtonLabel", "ctaButtonHref",
    "heroImageAlt", "heroImageDescription", "secondaryImageAlt", "secondaryImageDescription",
    "audienceHints",
  ],
  properties: {
    ...extractFlyerToolSchema.properties,
    imageLayout: {
      type: "object",
      description:
        "ONLY include this if the user explicitly asked to remove, reorder, swap, or change which photos appear. OMIT IT ENTIRELY otherwise — including it changes the photos. Reference photos by the index numbers in the 'Photos in this email' list.",
      required: ["hero", "secondary", "gallery"],
      properties: {
        hero: { type: "integer", description: "Index of the photo to show as the hero image, or -1 for no hero photo." },
        secondary: { type: "integer", description: "Index of the photo to show as the inline secondary image, or -1 for none." },
        gallery: {
          type: "array",
          items: { type: "integer" },
          description: "Indices of the photos to show in the gallery grid, in order. Leave an index out to remove that photo.",
        },
      },
    },
    refineNote: {
      type: "string",
      description:
        "One short sentence summarizing what you changed. If part of the request is impossible (e.g. recolor a photo, add a photo that isn't already in the email, change fonts/layout), start with \"I couldn't ...\", explain briefly, and make no change for that part.",
    },
  },
};

/**
 * Refine an existing extracted draft based on a user instruction.
 * E.g. "make the headline shorter", "change the tone to more casual", or —
 * when an image manifest is supplied — "remove the second photo".
 */
export async function refineFlyerContent(opts: {
  current: ExtractedFlyer;
  instruction: string;
  community: Community;
  pastSends?: PastSendForContext[];
  /** Pre-formatted "[0] hero ..." list of the photos currently in the email.
   *  When provided, the model may return imageLayout to rearrange them. */
  imageManifestText?: string;
}): Promise<RefineResult> {
  const c = client();

  const imageBlock = opts.imageManifestText
    ? `

Photos in this email
Each photo has a NAME (in quotes) that the user sees when hovering it in the preview, and an index. The user will refer to photos by these names (e.g. "swap Gallery image 1 and Gallery image 2", "remove the Secondary image"). Map the named photos the user mentions to their indices below:
${opts.imageManifestText}
- ONLY change photos if the user explicitly asks to remove, reorder, swap, or change which photo appears. Match the photo NAME(s) in their instruction to the indices above, then return \`imageLayout\` with the desired final arrangement: \`hero\` = the index to show as the hero (or -1 for none), \`secondary\` = the index for the inline image (or -1 for none), \`gallery\` = the list of indices for the gallery grid, in order (leave an index out to remove that photo).
- If the user does NOT mention photos/images, OMIT \`imageLayout\` entirely — the photos must stay exactly as they are.
- You can only rearrange or remove the photos listed above. You cannot add new photos, recolor them, or edit pixels. If the user asks for that, change nothing and say so in \`refineNote\`.`
    : "";

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `${systemPrompt(opts.community, opts.pastSends)}

You are now in REFINEMENT mode. The user has an existing extracted draft and wants targeted changes.
- Apply the user's specific instruction. Touch only what they ask about.
- Leave every other field exactly as the user has it. Do not "improve" things you weren't asked to improve.
- To REMOVE the text in a field (e.g. "remove the pull quote"), set that field to an empty string "" — do not invent a replacement.
- If the user's instruction implies a small cascading change (e.g. shortening a headline that a script subhead quotes), make the minimum cascading change and explain nothing.
- Always return the FULL updated object via the extract_flyer tool (every text field), so nothing is accidentally dropped.
- Set \`refineNote\` to one short sentence describing what you changed (or an "I couldn't ..." explanation if part of the request is out of scope).${imageBlock}`,
    tools: [
      {
        name: "extract_flyer",
        description: "Return the FULL updated marketing-email content with the user's refinement applied.",
        input_schema: refineFlyerToolSchema as any,
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
  const { imageLayout, refineNote, ...flyer } = toolUseBlock.input as any;
  return {
    flyer: flyer as ExtractedFlyer,
    imageLayout: imageLayout as RefineImageLayout | undefined,
    refineNote: typeof refineNote === "string" ? refineNote : undefined,
  };
}
