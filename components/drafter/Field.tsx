"use client";

import React from "react";
import { HideToggle, useHidden } from "@/components/drafter/HideToggle";
import { Reorderable } from "@/components/drafter/Reorderable";
import { sectionOfBlock } from "@/lib/eblast-blocks";
import { label as labelCls, hint as hintCls } from "@/components/drafter/ui";

/**
 * One labelled box in the sidebar, with the controls that hide what it writes
 * and move it within its section.
 *
 * Every section used to carry its own copy of this wrapper. They are one now
 * because the controls have to behave identically in all of them: hiding and
 * ordering are properties of a block, not of the section it happens to sit in.
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
  orderBlock,
  children,
}: {
  label: string;
  hint?: string;
  /** The name the email tags this block with, when it is one that can be hidden. */
  block?: string;
  /** A hide flag of its own, for the buttons and sections that carry one. */
  flag?: string;
  /**
   * The name this box moves under, when that is not `block`.
   *
   * The buttons are hidden by a flag rather than by name, and the hero's date
   * band is one block that the sidebar splits across two boxes — so what a box
   * writes and what it moves are not always the same thing.
   */
  orderBlock?: string;
  children: React.ReactNode;
}) {
  const hidden = useHidden(block, flag);
  const movable = orderBlock ?? block;
  const section = movable ? sectionOfBlock(movable) : undefined;

  const inner = (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className={labelCls}>{label}</label>
        {(block || flag) && <HideToggle block={block} flag={flag} what={label.toLowerCase()} />}
      </div>

      {/* Still editable while hidden: writing the next version of a line you
          are not sending yet is an ordinary thing to want. */}
      <div className={hidden ? "opacity-40 transition-opacity" : "transition-opacity"}>
        {children}
      </div>

      {hint && !hidden && <p className={hintCls + " mt-1"}>{hint}</p>}
    </>
  );

  if (section && movable) {
    return (
      <Reorderable section={section.name} name={movable}>
        {inner}
      </Reorderable>
    );
  }
  return <div className="group/hideable">{inner}</div>;
}
