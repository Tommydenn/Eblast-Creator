/**
 * The event's date and time, worked out rather than written by a model.
 *
 * A language model reading a flyer is guessing at two things it has no way to
 * know: what day of the week a date falls on, and what the house style for a
 * time range is. It got both wrong often enough to be worth taking off it.
 * Weekdays are arithmetic and house style is a rule, so both live here.
 */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

/** Title case, as the email prints them. */
const titled = (s: string) => s[0].toUpperCase() + s.slice(1);

// ── Times ──────────────────────────────────────────────────────────────────

/** One time, broken up so a range can reason about both ends together. */
interface Clock {
  hour: number;
  minute: number;
  meridiem: "AM" | "PM" | null;
}

function readClock(text: string): Clock | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\s*$/i.exec(text);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return { hour, minute, meridiem: (m[3].toUpperCase() + "M") as "AM" | "PM" };
}

/** A time with no AM or PM on it, which only a range can resolve. */
function readBareClock(text: string): Clock | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(text);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return { hour, minute, meridiem: null };
}

const printClock = (c: Clock) =>
  `${c.hour}:${String(c.minute).padStart(2, "0")} ${c.meridiem}`;

/** Minutes past midnight, for comparing the two ends of a range. */
const asMinutes = (c: Clock) => {
  const h = c.meridiem === "PM" ? (c.hour % 12) + 12 : c.hour % 12;
  return h * 60 + c.minute;
};

/**
 * A time range in house style: "4:00 PM - 5:30 PM".
 *
 * Both ends carry AM or PM, minutes are always shown, and the dash has a space
 * either side. A start with no meridiem of its own takes the end's, unless
 * that would put the start after the end — "10 - 2 PM" is a morning start.
 *
 * Returns the input untouched when it cannot be read as a time, so a line that
 * says something else entirely is never mangled into one.
 */
export function normalizeEventTime(input: string | undefined | null): string {
  if (!input) return "";
  // A leading separator is the old convention, from when the time shared a
  // line with the date.
  const text = input.replace(/^\s*[·•|–—-]\s*/, "").trim();
  if (!text) return "";

  const range = /^(.+?)\s*(?:-|–|—|to|until|till)\s*(.+)$/i.exec(text);
  if (range) {
    const end = readClock(range[2]);
    if (end) {
      const startWithMeridiem = readClock(range[1]);
      if (startWithMeridiem) return `${printClock(startWithMeridiem)} - ${printClock(end)}`;

      const bare = readBareClock(range[1]);
      if (bare) {
        // Assume the start shares the end's half of the day, and fall back to
        // the other half when that would run backwards.
        let start: Clock = { ...bare, meridiem: end.meridiem };
        if (asMinutes(start) >= asMinutes(end)) {
          start = { ...bare, meridiem: end.meridiem === "PM" ? "AM" : "PM" };
        }
        return `${printClock(start)} - ${printClock(end)}`;
      }
    }
    return text;
  }

  const single = readClock(text);
  return single ? printClock(single) : text;
}

// ── Dates ──────────────────────────────────────────────────────────────────

export interface ResolvedEventDate {
  /** The date as the email should print it, with the right weekday. */
  text: string;
  /** The weekday the date actually falls on, or null if it could not be read. */
  weekday: string | null;
  /** The full date, once the year is settled. */
  date: Date | null;
  /**
   * Set when the flyer named a weekday that the date does not fall on.
   *
   * One of the two is wrong and there is no way to tell which from here, so
   * this is reported rather than quietly resolved.
   */
  conflict: string | null;
}

/** What a date string says, before anything is worked out from it. */
function readDate(text: string) {
  const plain = text.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  const weekday = WEEKDAYS.find((d) =>
    new RegExp(`\\b${d}\\b`, "i").test(plain) ||
    new RegExp(`\\b${d.slice(0, 3)}\\b\\.?`, "i").test(plain),
  );
  const monthIndex = MONTHS.findIndex((m) =>
    new RegExp(`\\b${m}\\b`, "i").test(plain) ||
    new RegExp(`\\b${m.slice(0, 3)}\\b\\.?`, "i").test(plain),
  );
  if (monthIndex === -1) return null;

  // The day of the month: a 1–31 number that is not a year.
  const day = (() => {
    for (const m of plain.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\b/gi)) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 31) return n;
    }
    return null;
  })();
  if (day === null) return null;

  const yearMatch = /\b(20\d{2})\b/.exec(plain);
  return {
    plain,
    weekday: weekday ?? null,
    monthIndex,
    day,
    year: yearMatch ? Number(yearMatch[1]) : null,
  };
}

/**
 * The date an event falls on, and the weekday that goes with it.
 *
 * `anchor` is the earliest the event could be — the send-by date of the task
 * that produced the draft, since an eblast goes out before its event. Without
 * one, today. A flyer printing "October 22" with no year means the next
 * October 22 from there, which is what settles the year without guessing.
 *
 * A few days of slack either side of the anchor, because an eblast is
 * sometimes written the same week as the thing it is advertising.
 */
export function resolveEventDate(
  input: string | undefined | null,
  anchor: Date = new Date(),
): ResolvedEventDate {
  const empty: ResolvedEventDate = { text: input ?? "", weekday: null, date: null, conflict: null };
  if (!input) return empty;
  const read = readDate(input);
  if (!read) return empty;

  const floor = new Date(anchor.getTime() - 3 * 24 * 60 * 60 * 1000);
  const year = read.year ?? (() => {
    const thisYear = Date.UTC(floor.getUTCFullYear(), read.monthIndex, read.day);
    const floorUtc = Date.UTC(floor.getUTCFullYear(), floor.getUTCMonth(), floor.getUTCDate());
    return thisYear >= floorUtc ? floor.getUTCFullYear() : floor.getUTCFullYear() + 1;
  })();

  const date = new Date(Date.UTC(year, read.monthIndex, read.day));
  // A day that rolled over — 31 February — is not a date anyone meant.
  if (date.getUTCMonth() !== read.monthIndex) return empty;

  const weekday = WEEKDAYS[date.getUTCDay()];
  const stated = read.weekday;
  const conflict =
    stated && stated !== weekday
      ? `The flyer says ${titled(stated)}, but ${titled(MONTHS[read.monthIndex])} ${read.day}, ${year} is a ${titled(weekday)}. Check which is right.`
      : null;

  // Print it with the weekday the date actually falls on. A flyer that named
  // one has it replaced; a flyer that named none has it added, which is what
  // the drafter was doing by guesswork.
  const withoutWeekday = read.plain
    .replace(new RegExp(`\\b(${WEEKDAYS.join("|")})\\b\\.?,?\\s*`, "i"), "")
    .replace(new RegExp(`\\b(${WEEKDAYS.map((d) => d.slice(0, 3)).join("|")})\\b\\.?,?\\s*`, "i"), "")
    .trim();

  return {
    text: `${titled(weekday)}, ${withoutWeekday}`,
    weekday: titled(weekday),
    date,
    conflict,
  };
}
