"use client";

import React from "react";
import { RichInput } from "@/components/drafter/RichEditor";

/**
 * One box holding the event's date and time, on two lines.
 *
 * They are two separate fields on the draft — the drafter reads them apart
 * and the email styles them apart — but editing them in two side-by-side
 * boxes read as two unrelated things, so the sidebar presents one box. The
 * line between them is the split point.
 *
 * It used to be a dot: date, then "\u00b7", then time, all on one line. The
 * email prints them on separate lines now, so the dot has nothing to
 * separate and the break does the job instead.
 */

/** The break between the two lines, in the canonical form the editor writes. */
const BREAK = /<br\s*\/?>/i;

export function combineDateTime(date: string | undefined, time: string | undefined): string {
  const d = (date ?? "").trim();
  const t = (time ?? "").trim();
  if (!t) return d;
  if (!d) return t;
  return `${d}<br>${t}`;
}

/**
 * Split the box back into date and time at the first line break.
 *
 * This splits the DOM, not the string. Formatting the whole box produces
 * something like `<span style="font-size:60px">…</span>` wrapped around both
 * lines, and cutting that as text would sever the markup — the opening span
 * stays with the date and an orphan closing tag goes to the time, so the
 * formatting only ever applied to the first line.
 *
 * Range.cloneContents() is what makes it correct: it reproduces the enclosing
 * elements around each side, so a span wrapping the whole value ends up
 * wrapping both halves and the formatting survives on each.
 *
 * With no break, the whole value is the date and the time is cleared, which
 * is what someone typing only a date would expect.
 */
export function splitDateTime(combined: string): { date?: string; time?: string } {
  if (typeof document === "undefined") {
    // SSR fallback: no DOM to split with. Plain values are unaffected.
    const parts = combined.split(BREAK);
    return {
      date: parts[0]?.trim() || undefined,
      time: parts.slice(1).join("<br>").trim() || undefined,
    };
  }

  const root = document.createElement("div");
  root.innerHTML = combined;

  const br = root.querySelector("br");
  const serialize = (fragment: DocumentFragment): string => {
    const holder = document.createElement("div");
    holder.appendChild(fragment);
    return holder.innerHTML.trim();
  };

  if (!br) {
    const date = serialize(document.createRange().createContextualFragment(root.innerHTML));
    return { date: date || undefined, time: undefined };
  }

  const before = document.createRange();
  before.setStart(root, 0);
  before.setEndBefore(br);

  const after = document.createRange();
  // Start after the break itself, so it belongs to neither line.
  after.setStartAfter(br);
  after.setEnd(root, root.childNodes.length);

  const date = serialize(before.cloneContents());
  const time = serialize(after.cloneContents());
  return { date: date || undefined, time: time || undefined };
}

interface Props {
  label: string;
  hint?: string;
  date?: string;
  time?: string;
  onChange: (next: { date?: string; time?: string }) => void;
  className?: string;
  /** Which template field the toolbar should treat this as, for default sizing. */
  fieldName: string;
  activeEditorRef: React.MutableRefObject<HTMLDivElement | null>;
  activeEditorCallback: React.MutableRefObject<(() => void) | null>;
  activeFieldNameRef: React.MutableRefObject<string | null>;
}

export function DateTimeField({
  label, hint, date, time, onChange, className, fieldName,
  activeEditorRef, activeEditorCallback, activeFieldNameRef,
}: Props) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-1.5">
        {label}
      </label>
      <RichInput
        value={combineDateTime(date, time)}
        onValueChange={(html) => onChange(splitDateTime(html))}
        placeholder="e.g. Wednesday, May 13 (then the time on the next line)"
        className={className}
        activeEditorRef={activeEditorRef}
        activeEditorCallback={activeEditorCallback}
        activeFieldNameRef={activeFieldNameRef}
        fieldName={fieldName}
      />
      {hint && <p className="mt-1 text-xs text-[#9aaba4]">{hint}</p>}
    </div>
  );
}
