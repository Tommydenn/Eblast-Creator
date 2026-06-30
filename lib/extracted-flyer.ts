// The structured shape Claude returns from a flyer PDF.
// Every field on the eventual HTML email is derivable from this object.

export interface ExtractedFlyer {
  /** Email subject line. ≤60 chars, action-forward, specific. */
  subject: string;
  /** Inbox preview text (after subject in the inbox list). ≤120 chars. */
  previewText: string;

  // Hero
  /** Small uppercase eyebrow above the headline (e.g. "RSVP REQUIRED"). */
  eyebrow: string;
  /** The dominant hero headline, e.g. "Dining Director Info Session". */
  headline: string;
  /** Optional script-styled subhead under the headline. */
  scriptSubheadline?: string;
  /** @deprecated No longer rendered. Always empty string on new drafts. */
  heroHook: string;

  // Event detail (only present when the flyer is for an event)
  eventDate?: string;       // "Wednesday, May 13"
  eventTime?: string;       // "2:00 PM"
  eventLocation?: string;

  // Body
  /** Section eyebrow above the story, e.g. "A Look Inside Our Kitchen". */
  storyEyebrow: string;
  /** Optional script-styled section title, e.g. "Get a Taste of Life at Caretta". */
  storyScriptTitle?: string;
  /** 2–4 paragraphs of body copy. Plain text, no HTML. */
  bodyParagraphs: string[];

  // Pull-quote / value prop block
  pullQuoteEyebrow?: string;  // "How Unidine is Different"
  pullQuote?: string;         // "Fresh ingredients. Made-from-scratch cooking..."
  pullQuoteAttribution?: string; // "— The Unidine Standard"

  /** True if the flyer explicitly requires or requests RSVP. */
  rsvpRequired?: boolean;

  // CTA
  ctaEyebrow: string;        // "Reserve Your Seat"
  ctaHeadline: string;       // "Wednesday, May 13 · 2:00 PM"
  ctaSubline: string;        // "Seating is limited · RSVP required"
  ctaButtonLabel: string;    // "Call 920.504.3443"
  ctaButtonHref: string;     // "tel:9205043443" or "mailto:..." or "https://..."

  // Hero photography direction (used as alt text + later for image search)
  heroImageAlt: string;
  heroImageDescription: string; // What kind of photo this slot calls for

  // Optional secondary inline image
  secondaryImageAlt?: string;
  secondaryImageDescription?: string;

  // Audience cues for the marketing team — informational, not rendered
  audienceHints: string[];

  /**
   * Inline-edit overrides for text that is normally pulled from the community
   * record (not the flyer). The drafter never sets these; they're only written
   * when the user edits that text directly in the preview, so the renderer can
   * prefer them over the community defaults. Keeps "every visible word is
   * editable" working without mutating the saved community record.
   */
  galleryLabel?: string;   // default: "A Look Around {shortName}"
  footerName?: string;     // default: community.displayName
  footerAddress?: string;  // default: "{street} · {city}, {state} {zip}"

  /**
   * 1–3 generic words classifying the event type — used for the HubSpot email
   * name so the list view is scannable. e.g. "Open House", "Social Event",
   * "Presentation", "Info Session", "Community Tour", "Dining Event".
   * Not specific to this flyer — just the category.
   */
  eventCategory?: string;

  /**
   * 1–2 sentences from the drafter explaining which past-send patterns or
   * brand rules they leaned on. Surfaced in the UI under "Intelligence
   * applied" so the user can see how the agent's memory shaped the draft.
   * Only populated when past sends or structured voice rules were in context.
   */
  drafterRationale?: string;
}
