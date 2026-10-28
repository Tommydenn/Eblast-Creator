/**
 * Which part of the email the AI is pointed at, for each section of it.
 *
 * The email has seven sections. The AI has five scopes, and they are coarser:
 * the Header has no words of its own, and the Call to Action and the Footer
 * are refined together. Something has to say which is which.
 *
 * It used to be said twice — once in the preview, to decide which tab a click
 * opened, and once in the sidebar. Two copies of a map like this disagree
 * eventually, and when they do, clicking a section and opening it would aim
 * the AI at two different parts of the email. There is one copy now, read by
 * both, and a guard checks it still covers every section and reaches every
 * scope.
 */
import { SECTION_NAMES } from "@/lib/eblast-blocks";
import type { EblastSection } from "@/lib/eblast-sections";

/**
 * Every row of the sidebar's outline, and the scope opening it gives the AI.
 *
 * Subject is in here and not in the email's own sections: it is the envelope,
 * read before the email is opened and not part of it, so it has nothing to
 * hide and nowhere in the order to move to.
 */
export const OUTLINE_SCOPE: Record<string, EblastSection> = {
  Subject: "subject",
  Header: "hero",
  Hero: "hero",
  Story: "story",
  "Secondary Image": "story",
  "Photo Gallery": "images",
  "Call to Action": "cta",
  Footer: "cta",
};

/**
 * The rows that are a row and nothing more.
 *
 * The header band is drawn from the community's logo and colours — there is
 * nothing in it anybody types — so opening it would show an empty panel. Its
 * row carries the only two things it can be told: show yourself, and sit
 * here.
 */
export const OUTLINE_WITHOUT_FIELDS: readonly string[] = ["Header"];

/** The outline, top to bottom, before this draft rearranges anything. */
export const OUTLINE_ROWS: readonly string[] = ["Subject", ...SECTION_NAMES];
