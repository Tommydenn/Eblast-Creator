"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";

/**
 * The one control that hides a piece of the eblast.
 *
 * The editor has exactly two verbs, and they are kept apart on purpose:
 *
 *   an eye  hides and shows — reversible, so it never asks
 *   an x    deletes         — destroys typed words, so it always asks
 *
 * This is the eye. It is the only way anything is hidden, whether that is a
 * line, a button or a whole section, and it looks and behaves the same in all
 * three cases. Hiding used to be a red x in the preview, a confirm box, a red
 * eye in the sidebar, a red sentence under the box and an amber banner at the
 * top of the tab — five things for one piece of state, and four of them in a
 * colour that elsewhere means something went wrong.
 *
 * It is quiet until you need it: invisible until the pointer is over the thing
 * it belongs to, and visible from then on once that thing is hidden, because a
 * hidden thing has to say so without being hovered.
 *
 * Most things are hidden by name, in `hiddenBlocks`. The buttons and whole
 * sections carry a boolean of their own, which the preview has always written —
 * `flag` points the control at that instead, so there is one piece of state per
 * thing rather than two that can disagree.
 */
export function HideToggle({
  block,
  flag,
  what,
  className,
}: {
  block?: string;
  flag?: string;
  /** Names the thing in the tooltip, for the rows that carry two of these. */
  what?: string;
  className?: string;
}) {
  const { fields, setField } = useDraft();
  const hidden = isHidden(fields, block, flag);
  const subject = what ?? "this";

  const toggle = () => {
    if (flag) {
      setField(flag as never, (hidden ? undefined : true) as never);
      return;
    }
    if (!block) return;
    const current = fields?.hiddenBlocks ?? [];
    const next = hidden ? current.filter((b) => b !== block) : [...current, block];
    setField("hiddenBlocks", next.length ? next : undefined);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={hidden ? `Show ${subject}` : `Hide ${subject}`}
      aria-pressed={hidden}
      className={[
        "shrink-0 rounded p-0.5 text-[#9aaba4] transition-all hover:text-[#1F4538]",
        // Out of the way until it is wanted, and permanent once it has been
        // used — the slashed eye is the whole of how a hidden thing says so.
        hidden
          ? "opacity-100"
          : "opacity-0 group-hover/hideable:opacity-100 focus-visible:opacity-100",
        className ?? "",
      ].join(" ")}
    >
      {hidden ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

/** Whether a block or flag is hidden, for anything that needs to ask. */
export function isHidden(
  fields: { hiddenBlocks?: string[] } | null | undefined,
  block?: string,
  flag?: string,
): boolean {
  if (flag) return !!(fields as unknown as Record<string, unknown> | null)?.[flag];
  return !!block && (fields?.hiddenBlocks ?? []).includes(block);
}

/** The same question, from a component that has no fields of its own. */
export function useHidden(block?: string, flag?: string): boolean {
  const { fields } = useDraft();
  return isHidden(fields, block, flag);
}
