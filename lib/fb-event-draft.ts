/**
 * Writing the two paragraphs a Facebook event opens with.
 *
 * The source is the eblast that was already drafted for this event, not the
 * flyer again. The eblast's body has been through the voice doctrine and, on
 * most of these, through a person; starting from the flyer a second time
 * would produce a second opinion of the same facts and the two would drift
 * apart. So this condenses what is already agreed.
 *
 * The model writes prose and nothing else. The date, the time, the address
 * and the phone number are assembled by lib/fb-event-copy.ts from the fields
 * the eblast stores, so there is no way for a number to be rewritten here.
 */
import { MODEL } from "@/lib/anthropic";
import Anthropic from "@anthropic-ai/sdk";
import { buildDescriptions, type EventDescriptions } from "@/lib/fb-event-copy";

/** The eblast fields this reads. A subset of the draft's `fields` object. */
export interface DraftFields {
  headline?: string;
  storyScriptTitle?: string;
  scriptSubheadline?: string;
  storyEyebrow?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  bodyParagraphs?: string[];
  ctaButtonHref?: string;
  ctaButtonLabel?: string;
  rsvpRequired?: boolean;
}

export interface FbEventCopy {
  /** The event's name, which is the title on both Facebook and Further. */
  name: string;
  paragraphs: string[];
  descriptions: EventDescriptions;
}

const GUIDANCE = `You are writing the opening of a Facebook event for a senior living community.

You are given the email that has already been written for this same event. Your
job is to say the same thing in two short paragraphs, not to have a second look
at the subject.

The shape, which does not vary:
- Paragraph one opens with the invitation and names the community. If the event
  has a presenter, a partner organisation or a particular draw, it is named here
  with whatever credentials the email gives it, spelled exactly as the email
  spells them.
- Paragraph two covers what else happens: the activity, the tasting, the tour
  afterwards, whatever the email says is on offer.

Rules:
- Use the email's own words wherever they fit. You are shortening, not rewriting.
- Never state a fact the email does not state. No invented times, prices,
  names, credentials or promises.
- Do not write the date, the time, the address or the phone number. Those are
  added below your paragraphs automatically, and repeating them reads as a
  mistake.
- Do not open with "Join us for" twice.
- Do not end with a send-off. "We'd love to see you there", "Hope to see you
  soon" and anything like them carry nothing a reader did not already know,
  and the lines below your paragraphs are where the event is actually offered.
  The last sentence you write is a fact about the event.
- Two paragraphs, two to four sentences each. Shorter is better.
- Plain sentences. No hashtags, no emoji, no exclamation marks beyond one.`;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 });
}

/**
 * @param fields        the eblast draft's own fields
 * @param communityName the community as the app names it
 * @param fallbackName  the Planner task's event name, used when the eblast
 *                      headline is missing
 */
export async function writeFbEventCopy(
  fields: DraftFields,
  communityName: string,
  fallbackName: string,
  phone: string | null,
): Promise<FbEventCopy> {
  const body = (fields.bodyParagraphs ?? []).filter(Boolean);
  const source = [
    `Community: ${communityName}`,
    fields.headline ? `Headline: ${fields.headline}` : null,
    fields.scriptSubheadline ? `Subheadline: ${fields.scriptSubheadline}` : null,
    fields.storyEyebrow ? `Section heading: ${fields.storyEyebrow}` : null,
    fields.storyScriptTitle ? `Presented by: ${fields.storyScriptTitle}` : null,
    "",
    "The email's body:",
    ...body.map((p) => `  ${p}`),
  ]
    .filter((l) => l !== null)
    .join("\n");

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: GUIDANCE,
    messages: [{ role: "user", content: source }],
    tools: [
      {
        name: "facebook_event",
        description: "The name and opening paragraphs of the Facebook event.",
        input_schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "The event's name as it should appear on Facebook: what the thing IS, in a few words — " +
                "\"Music Therapy Presentation\", \"Home for the Holidays Open House\". Not a sentence, " +
                "and not the community's name, which Facebook already shows beside it.",
            },
            paragraphs: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 2,
              description:
                "Exactly two paragraphs, as described. No date, time, address or phone number in either.",
            },
          },
          required: ["name", "paragraphs"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "facebook_event" },
  });

  const tool = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  if (!tool) throw new Error("Claude did not return the facebook_event tool. Check the model response.");
  const out = tool.input as { name?: string; paragraphs?: string[] };

  const paragraphs = (out.paragraphs ?? []).map((p) => String(p).trim()).filter(Boolean);
  if (paragraphs.length === 0) throw new Error("Claude returned no paragraphs for the Facebook event");

  return {
    name: (out.name ?? "").trim() || fields.headline?.trim() || fallbackName,
    paragraphs,
    descriptions: buildDescriptions({
      paragraphs,
      date: fields.eventDate ?? "",
      time: fields.eventTime ?? "",
      location: fields.eventLocation ?? "",
      phone,
      // Only when the source says so: an event that wants no RSVP gets no
      // number and no line telling anyone to ring it.
      rsvpRequired: fields.rsvpRequired === true,
    }),
  };
}
