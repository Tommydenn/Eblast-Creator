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
 * A hidden box says so once — it dims, and its eye wears a slash. It used to
 * say so three times over, in two shades of red, which made an ordinary
 * choice look like a problem.
 *
 * The words stay in the box either way. Hiding and clearing are different
 * things: hide when you don't want the line this time, clear when you don't
 * want those words.
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
  /** A hide flag of its own, for the buttons and sections that carry one. */
  flag?: string;
  children: React.ReactNode;
}) {
  const hidden = useHidden(block, flag);

  return (
    <div className="group/hideable">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">
          {label}
        </label>
        {(block || flag) && <HideToggle block={block} flag={flag} what={label.toLowerCase()} />}
      </div>

      {/* Still editable while hidden: writing the next version of a line you
          are not sending yet is an ordinary thing to want. */}
      <div className={hidden ? "opacity-40 transition-opacity" : "transition-opacity"}>
        {children}
      </div>

      {hint && !hidden && <p className="mt-1 text-xs text-[#9aaba4]">{hint}</p>}
    </div>
  );
}
