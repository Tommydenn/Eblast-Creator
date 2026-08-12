import Anthropic from "@anthropic-ai/sdk";
import type { Community } from "@/data/communities";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import {
  formatPastSendsForPrompt,
  type PastSendForContext,
} from "@/lib/past-sends-retrieval";
import { VOICE_DOCTRINE } from "@/lib/voice";

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
    // Field descriptions carry FORMAT only — length, structure, what belongs
    // where. Tone lives in the voice doctrine (lib/voice.ts) so the two can't
    // contradict each other, which is what made this untunable before.
    subject: { type: "string", description: "Email subject line. <=60 chars. Specific about what this is. Tone follows the voice doctrine — match the register of the event." },
    previewText: { type: "string", description: "Inbox preview text. <=120 chars. Reinforces subject without repeating it." },

    eyebrow: { type: "string", description: "All-caps label above the headline. 1–3 words. Gives the CATEGORY or required action ('RSVP REQUIRED', 'DINING EVENT', 'FREE TOUR'). Must NOT echo or preview the headline — it is a tag, not a teaser." },
    headline: { type: "string", description: "The opening hook from the voice doctrine's structure — a single line naming the community and the occasion, carrying the register of the piece ('Summer is kicking off at Talamore Senior Living Sun Prairie!'). Sentence case, written as a real sentence rather than a 2–5 word label. Keep it under about 70 characters so it fits the hero without dominating it. Name the occasion; don't tease it." },
    scriptSubheadline: { type: "string", description: "Optional short subtitle in cursive under the headline. Only include if there's a natural one worth showing — don't invent one. Aim under 25 chars, hard limit 35. Examples: 'With Live Entertainment', 'Families Welcome', 'Dinner Included'. Leave empty if nothing fits naturally." },

    eventDate: { type: "string", description: "Event date if applicable, e.g. 'Wednesday, May 13'. Empty if no event." },
    eventTime: { type: "string", description: "Event time, e.g. '2:00 PM'." },
    eventLocation: { type: "string" },

    storyEyebrow: { type: "string", description: "2–4 word label naming what the story section covers. NEVER begin with an article — no 'The', 'A', or 'An'. Open with the subject itself or a descriptor: 'Summer Concert Series', 'Friday's Dinner Menu', 'Live Jazz on the Patio', 'Inside Our Kitchen'. Be specific — not 'About the Event'. Must NOT echo the hero headline." },
    storyScriptTitle: { type: "string", description: "Optional script-styled line below the eyebrow. Its ONLY valid use: adding a specific detail the eyebrow left out, so the two read as one idea. Not an invitation — 'Come join us' belongs in body copy. Never echo the eyebrow or introduce a different topic. Leave empty if the eyebrow stands alone. Good: 'Summer Concert Series' → 'Live Music by the Garden'." },
    bodyParagraphs: {
      type: "array",
      items: { type: "string" },
      description: "The body, built to the voice doctrine's structure: one or two substantive paragraphs carrying the actual detail, then a short closing line that looks forward and invites. 2–3 entries total. The opening hook is NOT here — it's the headline. Original prose; every fact from the source, the wording yours. Keep it tight, and say each thing once. Do NOT include date, time, location, phone or RSVP — the template renders those separately and the reader would see them twice.",
    },

    rsvpRequired: { type: "boolean", description: "True only if the flyer explicitly requires or requests RSVP (phrases like 'RSVP required', 'RSVP requested', 'please RSVP', 'reservations required'). False if attendance is open/walk-in." },

    ctaEyebrow: { type: "string", description: "Action label above the final CTA block. Must NOT repeat the hero eyebrow. Verb-led and specific: 'Reserve Your Seat', 'Save Saturday', 'Join the Table'." },
    ctaHeadline: { type: "string", description: "CTA headline — state the date+time OR a final reason to act (not the event name again). E.g. 'Saturday, June 28 · 5:30 PM' or 'Seating Is Limited'." },
    ctaSubline: { type: "string", description: "One supporting, factual line that lowers friction or adds a useful detail (cost, who's invited, what to bring). If the source requires or requests RSVP, this line MUST say so explicitly. Never include a person's name. Omit if there's nothing fresh to add." },
    ctaButtonLabel: { type: "string", description: "Button text that matches the flyer's call to action. Always include the phone number formatted as XXX.XXX.XXXX, followed by a SHORT context-appropriate phrase. Examples: 'Call 920.504.3443 to RSVP', 'Call 920.504.3443 to Schedule a Tour', 'Call 920.504.3443 to Request Info', 'Call 920.504.3443 for Details'. Follow the flyer's intent — do not default to 'to RSVP' if the flyer is not about RSVPing. Keep it as short as possible. Never include a salesperson's name." },
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
  const trackingPhoneNote = community.trackingPhone
    ? `\n- For phone CTAs in this email, use ${community.trackingPhone} (the community's tracking number) — do NOT use any other phone number from the flyer, even if the flyer prints a different one.`
    : "";

  const pastSendsBlock =
    pastSends && pastSends.length > 0
      ? `

Recent eblasts from ${community.displayName}, for context only:
${formatPastSendsForPrompt(pastSends)}

These tell you what this list has already seen, which is useful for avoiding a
repeat angle or a recycled opening. They are NOT the quality bar and NOT the
voice reference — the voice section above is. Do not imitate a past send, and
do not treat sounding different from them as a problem.`
      : "";

  const hasIntelligenceContext = pastSends && pastSends.length > 0;

  return `You are the lead copywriter for ${community.displayName}, a ${community.type.replace(/_/g, " ")} senior-living community${community.address.city ? ` in ${community.address.city}, ${community.address.state ?? ""}`.trim() : ""}. You are writing one of the best senior-living marketing emails on the planet — held to the bar of a working professional, not an intern who just learned the template.

Your job: take a printed flyer (provided as a PDF) and translate it into the structured fields for a marketing email that will be sent to this community's segmented list.

${VOICE_DOCTRINE}

Facts and accuracy — these are absolute, and they are not style rules
- Every name, date, phone number, time, location and price in your output must come from the source. If a detail isn't there, leave that field empty rather than inventing it.
- Name the community as ${community.displayName} at least once so the reader knows who is writing. "Our community" is fine after that.${trackingPhoneNote}
- The CTA href is the tracking number above (or a real mailto:/https:// from the source). The CTA label is human-formatted ("Call 920.504.3028", not "Click here").
- Honor the source's intent. If it is event-focused, your email is event-focused. Do not invent angles it doesn't support.${pastSendsBlock}

${
    hasIntelligenceContext
      ? `Self-narration
- After completing all other fields, populate \`drafterRationale\` with 1–2 sentences (max ~280 chars) explaining which past-send patterns AND/OR brand-voice rules you applied. Be specific — name a past subject or an open-rate range when it shaped your decision. The user reads this to see HOW your memory shaped the draft.`
      : "If no past sends or voice rules were in context, leave drafterRationale empty — don't pretend memory you don't have."
  }

Output format: call the \`extract_flyer\` tool with a fully-populated structured object. Do not write prose; only call the tool.`;
}

/**
 * Read a flyer PDF and return structured marketing-email content.
 */
/**
 * Build the source content for the drafter: a flyer PDF, pasted event details,
 * or both. Pasted notes are authoritative where they conflict with the flyer —
 * they're what the marketing team typed just now, versus a document that may
 * be out of date.
 */
export function draftSourceBlocks(pdfBase64?: string, notes?: string): any[] {
  const blocks: any[] = [];
  if (pdfBase64) {
    blocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    });
  }
  const trimmedNotes = notes?.trim();
  if (pdfBase64 && trimmedNotes) {
    blocks.push({
      type: "text",
      text:
        `Read this flyer and extract its content as a marketing email by calling the extract_flyer tool.\n\n` +
        `The marketing team also provided these details. Where they conflict with the flyer, THESE WIN — ` +
        `they are more current than the document:\n\n${trimmedNotes}`,
    });
  } else if (trimmedNotes) {
    blocks.push({
      type: "text",
      text:
        `Write a marketing email from the event details below by calling the extract_flyer tool. ` +
        `There is no flyer for this one — work only from these details, and do not invent specifics ` +
        `(dates, times, prices, names) that aren't stated here. If a detail isn't given, leave that ` +
        `field empty rather than guessing.\n\n${trimmedNotes}`,
    });
  } else {
    blocks.push({
      type: "text",
      text: "Read this flyer and extract its content as a marketing email by calling the extract_flyer tool.",
    });
  }
  return blocks;
}

export async function extractFlyerContent(opts: {
  /** Omitted when generating purely from pasted details. */
  pdfBase64?: string;
  /** Free-text event details pasted by the marketing team. */
  notes?: string;
  community: Community;
  pastSends?: PastSendForContext[];
}): Promise<ExtractedFlyer> {
  if (!opts.pdfBase64 && !opts.notes?.trim()) {
    throw new Error("Provide a flyer PDF, pasted details, or both.");
  }
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
        content: draftSourceBlocks(opts.pdfBase64, opts.notes) as any,
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
    "subject", "previewText", "eyebrow", "headline", "scriptSubheadline",
    "eventDate", "eventTime", "eventLocation",
    "storyEyebrow", "storyScriptTitle", "bodyParagraphs",
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
          description: "Indices of the photos to show in the gallery grid, in order. Leave an index out to remove that photo — a removal request should result in FEWER indices than before, never the same count or more, unless the user also explicitly asked to add or swap in a specific replacement photo.",
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
- REMOVAL MEANS FEWER PHOTOS, PERIOD. If the user asks to remove a photo, \`imageLayout\` must show one fewer photo placed than before. Do NOT promote an "Original image" (an unused full-resolution photo, listed but not currently placed) into the gap left behind — that is adding a photo the user never asked for, which is just as wrong as ignoring the removal request. Only bring an "Original image" into hero/secondary/gallery when the user's instruction explicitly names or clearly points at that specific unused photo (e.g. "use the barbecue photo instead", "swap in the third original photo").
- If the user does NOT mention photos/images, OMIT \`imageLayout\` entirely — the photos must stay exactly as they are.
- You can only rearrange, remove, or (when explicitly requested) bring in an already-listed "Original image." You cannot add a photo that isn't in this manifest, recolor a photo, or edit pixels. If the user asks for that, change nothing and say so in \`refineNote\`.
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
- A field's current value may already contain inline HTML formatting markup (e.g. \`<span style="font-weight:700">\`, \`<b>\`, \`<i>\`, \`<u>\`, color/font spans) applied by the user in the editor. PRESERVE that markup exactly around any text you don't change. If your edit falls inside a formatted span, keep the same wrapping tag(s) around the new words instead of dropping them — never flatten formatted HTML down to plain text, and never add formatting that wasn't already there.
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

// ── Salesperson edit-request triage ─────────────────────────────────────────
// When a salesperson requests edits through the approval email, only requests
// that are purely about the wording/copy get auto-applied by the AI — every
// other kind of change (formatting, color, font, size, images, section colors,
// spacing, layout, or an explicit "have marketing do this") routes to a human
// instead. This is a separate, narrower gate from refineFlyerContent's own
// isOutOfScope (which governs the broader in-app "refine via chat" tool used
// directly in the editor, and still allows image/layout changes there).

export interface EditRequestClassification {
  scope: "text_content" | "other";
  /** One short sentence explaining the classification — surfaced to marketing
   *  in the fallback notification email so they know why it landed with them. */
  reason: string;
}

export async function classifyEditRequestScope(instruction: string): Promise<EditRequestClassification> {
  const c = client();

  try {
    const response = await c.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: `You triage change requests submitted against a marketing email draft. Classify by INTENT, not literal keywords — phrasing varies a lot.

Classify as "text_content" ONLY when the request is entirely about changing the actual words/copy: rewording, shortening, lengthening, correcting a fact, changing tone, updating a date/time/name/detail that appears in the copy, adding or removing a sentence, etc. Examples of text_content: "make this shorter", "tighten up the second paragraph", "the RSVP note should say 9am not 10am", "soften the tone", "the event is now in the ballroom, not the patio".

Classify as "other" when the request involves ANY of: bold/italic/underline/color/font/size or any other visual formatting, photos/images (adding, removing, replacing, reordering, cropping), section or background colors, spacing, layout, or when the salesperson explicitly asks for marketing/a human/someone to make the change manually. Also classify as "other" if the request is mixed (part text, part something else) or genuinely ambiguous about what's being asked — when in doubt, choose "other" rather than guessing.`,
      tools: [
        {
          name: "classify_request",
          description: "Classify the scope of a salesperson's edit request.",
          input_schema: {
            type: "object",
            required: ["scope", "reason"],
            properties: {
              scope: { type: "string", enum: ["text_content", "other"] },
              reason: { type: "string", description: "One short sentence explaining the classification." },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "classify_request" },
      messages: [{ role: "user", content: `Salesperson's request: "${instruction}"` }],
    });

    const toolUseBlock = response.content.find((b: any) => b.type === "tool_use");
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return { scope: "other", reason: "Could not classify the request automatically." };
    }
    const input = toolUseBlock.input as any;
    return {
      scope: input.scope === "text_content" ? "text_content" : "other",
      reason: typeof input.reason === "string" && input.reason ? input.reason : "Involves more than wording changes.",
    };
  } catch {
    // Fail safe toward a human, never toward an unreviewed auto-apply.
    return { scope: "other", reason: "Classification failed; routed to marketing team as a safe default." };
  }
}
