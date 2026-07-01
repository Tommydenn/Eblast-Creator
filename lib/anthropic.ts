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
    "subject", "previewText", "eyebrow", "headline",
    "storyEyebrow", "bodyParagraphs",
    "ctaEyebrow", "ctaHeadline", "ctaSubline", "ctaButtonLabel", "ctaButtonHref",
    "heroImageAlt", "heroImageDescription",
    "audienceHints",
  ],
  properties: {
    subject: { type: "string", description: "Email subject line. <=60 chars. Specific, benefit-led, no clickbait." },
    previewText: { type: "string", description: "Inbox preview text. <=120 chars. Reinforces subject without repeating it." },

    eyebrow: { type: "string", description: "All-caps label above the headline. 1–3 words. Gives the CATEGORY or required action ('RSVP REQUIRED', 'DINING EVENT', 'FREE TOUR'). Must NOT echo or preview the headline — it is a tag, not a teaser." },
    headline: { type: "string", description: "The event name or a short direct description of it, taken as closely as possible from the flyer. 2–5 words. Title-case. Do NOT try to be clever or construct a noun+verb phrase — just use the event name." },
    scriptSubheadline: { type: "string", description: "Optional short subtitle shown in cursive under the headline. Only use if the flyer itself has a subtitle or secondary line worth showing — do NOT invent one. Must be short enough to fit on one line: aim for under 25 characters, hard limit 35. If nothing from the flyer fits, leave it empty." },
    heroHook: { type: "string", description: "Always emit an empty string. This field is no longer rendered in the email." },

    eventDate: { type: "string", description: "Event date if applicable, e.g. 'Wednesday, May 13'. Empty if no event." },
    eventTime: { type: "string", description: "Event time, e.g. '2:00 PM'." },
    eventLocation: { type: "string" },

    storyEyebrow: { type: "string", description: "Section label above the body copy. Must be fresh — must NOT echo the hero eyebrow or headline. Give it a different angle: a place, a person, a process ('Inside Our Kitchen', 'Meet Chef Marcos', 'How It Works')." },
    storyScriptTitle: { type: "string", description: "Optional script-styled section title. Only include if it opens the story with warmth or personality not covered by storyEyebrow. Omit rather than repeat." },
    bodyParagraphs: {
      type: "array",
      items: { type: "string" },
      description: "2–4 short paragraphs. Copy the flyer's wording as closely as possible — treat it almost like a copy-paste with minor adaptation for email format. Do not rephrase, restructure, or add your own angles. Keep it short and non-redundant: say each thing once. For cheerful events (open house, social, dining), the tone must be upbeat and friendly — use exclamation points freely and naturally throughout, not just once. If the flyer is informational, be warm but measured. Do NOT include logistical details (date, time, location, RSVP) — those are in the hero and CTA. No em dashes. NEVER invent quotes or put words in residents' or families' mouths — not even paraphrased ('many residents say...' or 'families tell us...'). Only use wording that is actually in the flyer.",
    },

    rsvpRequired: { type: "boolean", description: "True only if the flyer explicitly requires or requests RSVP (phrases like 'RSVP required', 'RSVP requested', 'please RSVP', 'reservations required'). False if attendance is open/walk-in." },

    ctaEyebrow: { type: "string", description: "Action label above the final CTA block. Must NOT repeat the hero eyebrow. Verb-led and specific: 'Reserve Your Seat', 'Save Saturday', 'Join the Table'." },
    ctaHeadline: { type: "string", description: "CTA headline — state the date+time OR a final reason to act (not the event name again). E.g. 'Saturday, June 28 · 5:30 PM' or 'Seating Is Limited'." },
    ctaSubline: { type: "string", description: "One supporting, factual line that lowers friction or adds a useful detail (cost, who's invited, what to bring). If the flyer requires or requests RSVP, this line MUST say so explicitly (e.g. 'RSVP required — seating is limited'). Never include a person's name. No urgency, scarcity, or hype. Omit if nothing fresh to add." },
    ctaButtonLabel: { type: "string", description: "Button text using the phone number only, e.g. 'Call 920.504.3443'. Never include a salesperson's name." },
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
    eventCategory: {
      type: "string",
      description: "1–3 generic words naming the event type — used as the HubSpot email name so the list view is scannable. Choose the broadest accurate category: 'Open House', 'Social Event', 'Presentation', 'Info Session', 'Community Tour', 'Dining Event', 'Health & Wellness', 'Music & Entertainment'. Do NOT use the specific event title — just the category.",
    },
    rsvpLabel: {
      type: "string",
      description: "The RSVP label to display at the top of the email. Use 'RSVP Required' if the flyer says RSVP is required/mandatory. Use 'RSVP Requested' if the flyer says RSVP is requested/appreciated. Leave EMPTY if the flyer has no RSVP mention at all.",
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
- High-performing past subjects (higher open %) tell you what tone and angle resonates with this specific audience. Use them as your primary style cue for the story section — if past high-performers are warm and upbeat, match that; if they are measured and informational, match that.
- The body copy tone and energy of this email's story section should feel consistent with what has worked for this community before.
- The drafts that already shipped represent the brand's accepted voice — match it. If your draft sounds noticeably different, that's a yellow flag.`
      : "";

  const hasIntelligenceContext = (pastSends && pastSends.length > 0) || hasVoice;

  return `You are the lead copywriter for ${community.displayName}, a ${community.type.replace(/_/g, " ")} senior-living community${community.address.city ? ` in ${community.address.city}, ${community.address.state ?? ""}`.trim() : ""}. You are writing one of the best senior-living marketing emails on the planet — held to the bar of a working professional, not an intern who just learned the template.

Your job: take a printed flyer (provided as a PDF) and translate it into the structured fields for a marketing email that will be sent to this community's segmented list.

${SENIOR_LIVING_CRAFT_DOCTRINE}

This community's voice
${hasVoice ? voiceBlock : fallbackVoice}

Inviolable rules
- Never use em dashes (—) anywhere in the email. Replace with a comma, a period, or a new sentence.
- Never invent quotes or testimonials. Do not put words in anyone's mouth — not a resident, not a family member, not staff. This includes paraphrased "what residents say" framing. The phrase "My only regret is that I didn't move here sooner" is a banned example of exactly this — never use it or anything like it.
- Never invent facts. Every name, date, phone number, time, location, and quote in your output must appear in the flyer. If a detail isn't in the flyer, leave that field empty.
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
  /** Present only when the user explicitly asked to crop or reframe a photo. */
  imageCropInstructions?: Array<{ imageIndex: number; focus: string }>;
  /**
   * True when the request cannot be fulfilled at all through text/copy edits —
   * e.g. "use a different image", "add a new photo", "change the layout".
   * The approval edits route uses this to skip applying the refinement and
   * route the request to a human instead.
   */
  isOutOfScope?: boolean;
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
    imageCropInstructions: {
      type: "array",
      description: "ONLY include if the user explicitly asks to crop, reframe, or reposition a photo. Reference an 'Original image' entry (full-resolution, labeled '— full-resolution original') — NOT a placed/cropped entry. The imageIndex is the pool index of the original. First use imageLayout to assign the original to the desired slot, then add a crop instruction so the server crops it fresh with the specified focus.",
      items: {
        type: "object",
        required: ["imageIndex", "focus"],
        properties: {
          imageIndex: { type: "integer", description: "Pool index of an 'Original image' (not an already-placed image). The original will be freshly cropped to the slot's correct aspect ratio." },
          focus: { type: "string", enum: ["top", "center", "bottom", "left", "right"], description: "Which edge of the original to anchor the crop to. 'top' keeps the top of the photo; 'bottom' keeps the bottom; 'center' crops to the middle." },
        },
      },
    },
    isOutOfScope: {
      type: "boolean",
      description:
        "Set to true ONLY when the salesperson's request CANNOT be fulfilled at all through text/copy editing alone — for example: requests to use a different photo that isn't already in the email, add a brand-new image, change the layout or design, update branding, or any task that requires sourcing new assets or human design work. When true, return ALL content fields with their current values completely unchanged — do NOT make any content edits. Leave this field undefined (do not include it) for requests that can be handled through text changes, even partially.",
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
- You can only rearrange or remove the photos listed above. You cannot add new photos, recolor them, or edit pixels. If the user asks for that, change nothing and say so in \`refineNote\`.
- If the user asks to crop, reframe, or shift a photo (e.g. "show more of the top", "crop lower"), use BOTH: (1) \`imageLayout\` to place the corresponding "Original image" in the desired slot, AND (2) \`imageCropInstructions\` with that Original image's index and the focus direction. Only reference "Original image" indices (labeled "full-resolution original" above) in \`imageCropInstructions\` — never already-placed indices.`
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
- Set \`refineNote\` to one short sentence describing what you changed (or an "I couldn't ..." explanation if part of the request is out of scope).
- If the request CANNOT be handled through text/copy editing at all (e.g. "use a different photo", "add a new image", "change the layout", "update the branding"), set \`isOutOfScope=true\` AND return every content field with its current value completely unchanged. Do not attempt any edits when isOutOfScope is true.${imageBlock}`,
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
  const { imageLayout, refineNote, imageCropInstructions, isOutOfScope, ...flyer } = toolUseBlock.input as any;
  return {
    flyer: flyer as ExtractedFlyer,
    imageLayout: imageLayout as RefineImageLayout | undefined,
    refineNote: typeof refineNote === "string" ? refineNote : undefined,
    imageCropInstructions: Array.isArray(imageCropInstructions) ? imageCropInstructions as Array<{ imageIndex: number; focus: string }> : undefined,
    isOutOfScope: isOutOfScope === true ? true : undefined,
  };
}
