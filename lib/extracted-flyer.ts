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
  // Event detail (only present when the flyer is for an event)
  eventDate?: string;       // "Wednesday, May 13"
  eventTime?: string;       // "2:00 PM"
  eventLocation?: string;

  // Body
  /** Section eyebrow above the story, e.g. "Inside Our Kitchen". Never opens
   * with an article — see the storyEyebrow guidance in lib/anthropic.ts. */
  storyEyebrow: string;
  /** Optional script-styled section title, e.g. "Get a Taste of Life at Caretta". */
  storyScriptTitle?: string;
  /** 2–4 paragraphs of body copy. Plain text, no HTML. */
  bodyParagraphs: string[];

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

  /** Override for the address line shown in the hero section beneath the event date. */
  heroAddress?: string;
  /** Override for the "Thank You!" text in the email footer. */
  thankYouText?: string;
  /** Override for the "Visit Website" button URL in the footer. */
  footerWebsiteUrl?: string;
  /** Editable label text on the footer "Visit Website" button (the URL always
   *  comes from the community's configured website). Default: "Visit Website". */
  footerButtonLabel?: string;

  /**
   * 1–3 generic words classifying the event type — used for the HubSpot email
   * name so the list view is scannable. e.g. "Open House", "Social Event",
   * "Presentation", "Info Session", "Community Tour", "Dining Event".
   * Not specific to this flyer — just the category.
   */
  eventCategory?: string;

  /**
   * Exact RSVP label from the flyer: "RSVP Required" or "RSVP Requested".
   * Empty/undefined when the flyer has no RSVP requirement.
   * Rendered at the top of the Hero and CTA sections.
   */
  rsvpLabel?: string;

  /**
   * Independent footer/CTA section overrides. When set, these replace the
   * Hero values in the bottom call-to-action band only, so the two sections
   * can show different event details. When absent, the CTA band inherits the
   * Hero's eventDate / eventTime / rsvpLabel (same as before).
   */
  ctaEventDate?: string;
  ctaEventTime?: string;
  ctaRsvpLabel?: string;

  /**
   * Independent override for the bottom call-to-action band's call button.
   * Generates with the same text as ctaButtonLabel (the Hero's call button)
   * until the user explicitly edits this one — from that point on the two
   * buttons are fully independent (text and formatting), same pattern as
   * ctaEventDate/ctaEventTime/ctaRsvpLabel above.
   */
  finalCtaButtonLabel?: string;

  /**
   * 1–2 sentences from the drafter explaining which past-send patterns or
   * brand rules they leaned on. Surfaced in the UI under "Intelligence
   * applied" so the user can see how the agent's memory shaped the draft.
   * Only populated when past sends or structured voice rules were in context.
   */
  drafterRationale?: string;

  /**
   * Manual background-color overrides (hex) for individual email sections.
   * The drafter never sets these — they're only written when the user picks
   * a color directly in the editor. Each defaults to the community brand's
   * usual color for that section when unset (see lib/render-email.ts).
   */
  headerBgColor?: string;
  heroBgColor?: string;
  finalCtaBgColor?: string;
  footerBgColor?: string;

  /** Same idea, for the three buttons — each independent of the others. */
  ctaButtonBgColor?: string;
  finalCtaButtonBgColor?: string;
  footerButtonBgColor?: string;

  /**
   * Manual per-draft "hide this section/button" toggles, set only from the
   * editor (hover-delete in the preview, or the sidebar's restore banner).
   * Non-destructive: hiding never clears the underlying content (text, image
   * assignment, community website, etc.) — it's purely a display flag, so
   * turning it back off restores exactly what was there before. Header and
   * Footer themselves are never hideable (logo/branding and required sender
   * contact info), but the Footer's own "Visit Website" button is.
   */
  heroSectionHidden?: boolean;
  storySectionHidden?: boolean;
  secondaryImageSectionHidden?: boolean;
  gallerySectionHidden?: boolean;
  finalCtaSectionHidden?: boolean;
  ctaButtonHidden?: boolean;
  finalCtaButtonHidden?: boolean;
  footerButtonHidden?: boolean;

  /**
   * Formatting-only override for the footer's primary salesperson email.
   * Same locking pattern as ctaButtonLabel's tracking phone number (see
   * CallButtonField/EmailButtonField): the plain text is always the
   * community's current primary sender email — only bold/italic/color/font/
   * size can be changed here, never the address itself. That address is
   * owned by the Community page's sender records, not the drafter.
   */
  footerSenderEmail?: string;

  /**
   * Additional email addresses shown under the primary one in the footer.
   * Unlike footerSenderEmail, these are fully free-text/editable — added and
   * removed directly in the editor, not sourced from the community record.
   */
  additionalFooterEmails?: string[];

  /**
   * Click-through destinations for the photos. When set, that image is wrapped
   * in an <a href> in the rendered email, so a recipient clicking the photo
   * opens the link. Set only from the editor (click a photo in the live
   * preview), never by the drafter.
   *
   * These live on ExtractedFlyer rather than alongside the image data because
   * every downstream render — the approval email, the auto-refine revision,
   * and the HubSpot push — rebuilds the HTML from these fields, so a link set
   * once survives the whole approval pipeline through to the real send.
   *
   * galleryImageLinks is positional: index i is the link for gallery photo i,
   * with holes left as undefined/"" for photos that have no link.
   */
  heroImageLink?: string;
  secondaryImageLink?: string;
  galleryImageLinks?: string[];
}
