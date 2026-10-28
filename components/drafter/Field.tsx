"use client";

import React from "react";
import { HideToggle, useHidden } from "@/components/drafter/HideToggle";

/**
 * One labelled box in the sidebar, and the control that hides what it writes.
 *
 * Every section used to carry its own copy of this wrapper. They are one now
 * because the hide control has to behave identically in all of them: hiding is
 * a property of a block, not of the section it happens to sit in.
 *
 * A box with neither `block` nor `flag` has nothing to hide — the subject line,
 * for one, is not part of the email — so it renders without the control.
 */
export function Field({
  label,
  hint,
  block,
  flag,
  children,
}: {
  label: string;
  hint?: string;
  /** The name the email tags this block with, when it is one that can be hidden. */
  block?: string;
  /** A hide flag of its own, for the buttons and sections that had one before. */
  flag?: string;
  children: React.ReactNode;
}) {
  const hidden = useHidden(block, flag);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">
          {label}
        </label>
        {(block || flag) && <HideToggle block={block} flag={flag} what={label.toLowerCase()} />}
      </div>

      {/* Still editable while hidden: writing the next version of a line you
          are not sending yet is an ordinary thing to want. */}
      <div className={hidden ? "opacity-40" : undefined}>{children}</div>

      {hidden ? (
        <p className="mt-1 text-xs text-[#b3312c]">Hidden from the eblast.</p>
      ) : (
        hint && <p className="mt-1 text-xs text-[#9aaba4]">{hint}</p>
      )}
    </div>
  );
}
