/**
 * The editor's surface values, in one place.
 *
 * Six files kept their own copy of the same `baseInput` string and about
 * twenty hex codes were typed out wherever they were needed, so a change to
 * the editor's look meant finding every copy of it first. Nothing here is new
 * — these are the values the editor already used, named.
 *
 * The names are what a thing is for, not what colour it happens to be, so the
 * palette can move without every file having to.
 */

/** The colours, as they are written in Tailwind's arbitrary-value brackets. */
export const c = {
  /** The brand green. Primary buttons, focus, the one accent. */
  brand: "#1F4538",
  brandDeep: "#173829",
  /** A wash of the brand, for a selected row or a hover on a quiet control. */
  brandWash: "#f0f5f2",

  /** Text, from the words themselves down to a whisper. */
  ink: "#1a1a1a",
  body: "#3a3a3a",
  strong: "#5a6b63",
  muted: "#7a8c85",
  faint: "#9aaba4",
  ghost: "#c3bdb4",

  /** Surfaces, lightest first. */
  white: "#ffffff",
  panel: "#faf9f6",
  shell: "#f5f3ef",
  sunken: "#f0ede7",
  frame: "#e8e3dc",

  /** Lines. */
  rule: "#e8e3dc",
  ruleSoft: "#f0ede7",
  field: "#ddd8d0",

  /** Something went wrong, or is about to. */
  warn: "#a4552f",
  danger: "#b3312c",
} as const;

/** A text box: the single-line inputs, the textareas, the rich fields. */
export const input =
  "w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] " +
  "focus:outline-none focus:ring-2 focus:ring-[#1F4538]/25 focus:border-[#1F4538] transition-colors";

/**
 * The name above a box.
 *
 * Sentence case at a readable weight. It used to be 12px uppercase with the
 * widest tracking Tailwind has, which is a decorative treatment: it reads
 * slower, takes more width than the words need, and was applied to every
 * label in the editor at once, so nothing could stand out from it.
 */
export const label = "block text-[11.5px] font-medium text-[#5a6b63]";

/** The line under a box, for the one thing the label could not say. */
export const hint = "text-[11px] leading-snug text-[#9aaba4]";

/** A small heading over a group of controls, where one is still wanted. */
export const eyebrow = "text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4]";

/** A quiet control: a link-weight button that does not compete with content. */
export const quiet =
  "text-[11px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors";

/** The buttons along the command bar, by how much they commit you. */
export const btn = {
  /** The one action the bar is for. */
  primary:
    "inline-flex items-center gap-1.5 rounded-lg bg-[#1F4538] px-3.5 py-1.5 text-xs font-semibold " +
    "text-white transition-colors hover:bg-[#173829] disabled:opacity-50",
  /** An action that matters but is not the destination. */
  secondary:
    "inline-flex items-center gap-1.5 rounded-lg border border-[#ddd8d0] bg-white px-3 py-1.5 " +
    "text-xs font-medium text-[#5a6b63] transition-colors hover:border-[#1F4538]/40 hover:text-[#1F4538] " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#ddd8d0] disabled:hover:text-[#5a6b63]",
  /** An icon on its own, for the things that are reached often and read once. */
  icon:
    "grid h-7 w-7 place-items-center rounded-lg text-[#7a8c85] transition-colors " +
    "hover:bg-[#f0ede7] hover:text-[#1F4538] disabled:opacity-30 disabled:hover:bg-transparent",
} as const;
