"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";

/**
 * The eye that hides one piece of the eblast.
 *
 * Field puts one beside its label; the date-and-time box puts two, because it
 * writes two lines, and `what` names each so the tooltips stay apart.
 *
 * Most things are hidden by name, in `hiddenBlocks`. The buttons and whole
 * sections carry a boolean of their own, which the preview's hover-delete has
 * always written — `flag` points the control at that instead, so there is one
 * state per thing rather than two ways to hide it that disagree.
 *
 * Hiding keeps the words. Clearing the box is how you get rid of them.
 */
export function HideToggle({
  block,
  flag,
  what,
}: {
  block?: string;
  flag?: string;
  what?: string;
}) {
  const { fields, setField } = useDraft();
  const hidden = flag
    ? !!(fields as unknown as Record<string, unknown> | null)?.[flag]
    : !!block && (fields?.hiddenBlocks ?? []).includes(block);
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
      title={hidden ? `Show ${subject} in the eblast` : `Hide ${subject} from the eblast`}
      className={[
        "shrink-0 rounded p-0.5 transition-colors",
        hidden ? "text-[#b3312c] hover:text-[#8f2622]" : "text-[#c3bdb4] hover:text-[#5a6b63]",
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

/** Whether a block or flag is currently hidden, for anything that needs to ask. */
export function useHidden(block?: string, flag?: string): boolean {
  const { fields } = useDraft();
  if (flag) return !!(fields as unknown as Record<string, unknown> | null)?.[flag];
  return !!block && (fields?.hiddenBlocks ?? []).includes(block);
}
