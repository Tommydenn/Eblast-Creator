"use client";

import React from "react";
import { RichInput } from "@/components/drafter/RichEditor";

/**
 * One input box for "date · time", writing back to two separate fields.
 *
 * Date and time are genuinely separate values: the drafter extracts them
 * independently and the email template renders them as their own spans so each
 * can be formatted on its own. But editing them in two side-by-side boxes
 * formatted badly and read as two unrelated things, so the sidebar presents a
 * single box. The split is purely a UI concern and happens here.
 *
 * The "·" separator is the split point. Everything before it is the date,
 * everything after is the time. The stored time keeps its leading "·" because
 * that's the existing convention (see DraftContext's generate step and
 * render-email's separator handling), so nothing downstream has to change.
 */

const SEPARATOR = "·";

export function combineDateTime(date: string | undefined, time: string | undefined): string {
  const d = (date ?? "").trim();
  const t = (time ?? "").trim();
  if (!t) return d;
  // The stored time normally already begins with the separator.
  if (t.startsWith(SEPARATOR)) return d ? `${d} ${t}` : t;
  return d ? `${d} ${SEPARATOR} ${t}` : t;
}

/**
 * Split the combined value back into date and time on the FIRST separator.
 * With no separator the whole value is the date and the time is cleared, which
 * is what someone typing just a date would expect.
 */
export function splitDateTime(combined: string): { date?: string; time?: string } {
  const idx = combined.indexOf(SEPARATOR);
  if (idx === -1) {
    const date = combined.trim();
    return { date: date || undefined, time: undefined };
  }
  const date = combined.slice(0, idx).trim();
  const rest = combined.slice(idx + SEPARATOR.length).trim();
  return {
    date: date || undefined,
    time: rest ? `${SEPARATOR} ${rest}` : undefined,
  };
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
        placeholder="e.g. Wednesday, May 13 · 2:00 PM"
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
