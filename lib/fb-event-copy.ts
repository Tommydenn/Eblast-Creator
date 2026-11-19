/**
 * Assembling a Facebook event's description.
 *
 * Two paragraphs are written (by the model, from the eblast's own body), and
 * everything below them is built here instead: the date, the time, the
 * address, and the line telling people to call. Those are facts with one
 * correct form, and a model asked to write them will eventually write a
 * different phone number or drop a year — the same reason the eblast renders
 * its date band rather than letting the drafter type one.
 *
 * The shape, which is the house format:
 *
 *   <paragraph>
 *
 *   <paragraph>
 *
 *   📅 Wednesday, November 11th
 *   🕐 2:00 PM
 *   📍 1910 County Road C East, Maplewood, MN
 *
 *   RSVP required, call today!
 *   📞 651-360-1691
 *
 * Further gets the same thing without that last pair of lines, because
 * Further collects the RSVP itself and pushes it to the CRM — telling the
 * reader to phone instead would be working against the form they are looking
 * at.
 */

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(day: number): string {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

/**
 * The eblast's date, with the day number given its ending.
 *
 * The eblast writes "Thursday, November 19"; the Facebook house style is
 * "Thursday, November 19th". Only a date with exactly one number in it is
 * touched. "October 21/22", "November 19 - 21" and "Saturday, May 2 at 2:00"
 * are all left exactly as written, because there is no way to tell from here
 * which number is the day — and a date shown as the eblast wrote it is right,
 * while a date reshaped on a guess can be wrong without looking wrong.
 */
export function formatEventDate(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const numbers = text.match(/\d+/g) ?? [];
  if (numbers.length !== 1) return text;
  if (/\d\s*(?:st|nd|rd|th)\b/i.test(text)) return text;
  return text.replace(/\d+/, (d) => ordinal(Number(d)));
}

/** The eblast stores the time with the separator it is drawn with. */
export function formatEventTime(raw: string): string {
  return (raw ?? "").replace(/^[\s·•|–—-]+/, "").trim();
}

/**
 * The phone number to call, as a person would read it out.
 *
 * Taken from the button's href, which is the only place it is stored as
 * digits — the label is written for the eblast ("Call 763.325.8107 to RSVP")
 * and its punctuation is not Facebook's.
 */
export function phoneFrom(href: string | null | undefined, label?: string | null): string | null {
  // Each source is read on its own. Reading them together was the first
  // version, and on a draft that has both — which is nearly all of them — it
  // produced twenty digits and gave up, so every event went out with no
  // number and no line telling anyone to call.
  const ten = tenDigits(String(href ?? "").replace(/^tel:/i, "")) ?? tenDigits(label);
  if (!ten) return null;
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Ten digits, or nothing.
 *
 * A label can arrive carrying the editor's own markup — a colour as
 * rgb(69, 103, 101) is three numbers sitting in front of the real one — so
 * tags are taken out before the digits are read.
 */
function tenDigits(source: string | null | undefined): string | null {
  const digits = String(source ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(?:rgba?|hsla?)\([^)]*\)/gi, " ")
    .replace(/\D+/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10 ? ten : null;
}

/**
 * The date, time and place read back out of a finished description.
 *
 * Events written before those were stored in their own columns have them
 * only inside the text, which is why some rows showed the detail in the
 * description and offered no box to copy it from. Rather than leave those
 * events half-usable until somebody rewrites them, the three lines are read
 * back off the text they were built into — they are on their own lines,
 * each behind a known marker, because this file put them there.
 */
export function detailsFromDescription(description: string | null | undefined): {
  date: string | null;
  time: string | null;
  location: string | null;
} {
  const after = (marker: string) => {
    for (const line of (description ?? "").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith(marker)) {
        const value = trimmed.slice(marker.length).trim();
        if (value) return value;
      }
    }
    return null;
  };
  return { date: after("📅"), time: after("🕐"), location: after("📍") };
}

export interface EventFacts {
  /** The two paragraphs, already written. */
  paragraphs: string[];
  date: string;
  time: string;
  location: string;
  phone: string | null;
  rsvpRequired: boolean;
}

export interface EventDescriptions {
  /** For Facebook: the paragraphs, the details, and the call-to-RSVP close. */
  facebook: string;
  /** For Further: the paragraphs alone. */
  further: string;
}

export function buildDescriptions(facts: EventFacts): EventDescriptions {
  const body = facts.paragraphs.map((p) => p.trim()).filter(Boolean).join("\n\n");

  const details = [
    facts.date ? `📅 ${formatEventDate(facts.date)}` : null,
    facts.time ? `🕐 ${formatEventTime(facts.time)}` : null,
    facts.location ? `📍 ${facts.location.trim()}` : null,
  ].filter(Boolean) as string[];

  // The close exists to collect an RSVP. An event that does not want one is
  // a walk-in, and printing a number under "call today" turns an open door
  // into a hurdle — so when no RSVP is asked for, neither the line nor the
  // number appears. No number on file means the same thing.
  const close =
    facts.rsvpRequired && facts.phone ? `RSVP required, call today!\n📞 ${facts.phone}` : "";

  return {
    facebook: [body, details.join("\n"), close].filter(Boolean).join("\n\n"),
    // Further has a field of its own for the date, the time and the place,
    // and prints them beside the description. Repeating them underneath says
    // everything twice on the one page where it is already answered, so
    // Further gets the prose and nothing else.
    further: body,
  };
}
