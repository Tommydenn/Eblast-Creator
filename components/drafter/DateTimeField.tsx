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

/** The text of a field with any formatting markup taken off. */
function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

export function combineDateTime(date: string | undefined, time: string | undefined): string {
  const d = (date ?? "").trim();
  const t = (time ?? "").trim();
  if (!t) return d;
  // Test the TEXT, not the markup. Once the time has any formatting it starts
  // with "<span …>", so a check against the raw HTML never matched and a
  // second separator was added every time the box was rebuilt — and because
  // the footer falls back to the header's date and time when it has no
  // override of its own, editing one field grew a dot on the other.
  if (plainText(t).startsWith(SEPARATOR)) return d ? `${d} ${t}` : t;
  return d ? `${d} ${SEPARATOR} ${t}` : t;
}

/**
 * Split the combined value back into date and time at the FIRST separator.
 *
 * This splits the DOM, not the string. A plain string split severs the markup:
 * formatting the whole box produces something like
 * `<span style="font-size:60px">Friday, Aug 28 · 2:00 PM</span>`, and cutting
 * that at the "·" leaves the opening span attached to the date and an orphan
 * `</span>` on the time, so the formatting only ever applied to the date half.
 *
 * Range.cloneContents() is what makes this correct: it reproduces the enclosing
 * elements around each side, so a span wrapping the whole value ends up
 * wrapping both halves and the formatting survives on each.
 *
 * With no separator the whole value is the date and the time is cleared, which
 * is what someone typing only a date would expect.
 */
export function splitDateTime(combined: string): { date?: string; time?: string } {
  if (typeof document === "undefined") {
    // SSR fallback: no DOM to split with. Plain-text values are unaffected.
    const idx = combined.indexOf(SEPARATOR);
    if (idx === -1) return { date: combined.trim() || undefined, time: undefined };
    const rest = combined.slice(idx + SEPARATOR.length).trim();
    return {
      date: combined.slice(0, idx).trim() || undefined,
      time: rest ? `${SEPARATOR} ${rest}` : undefined,
    };
  }

  const root = document.createElement("div");
  root.innerHTML = combined;

  // Find the first text node containing the separator, at any depth.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let hit: { node: Text; offset: number } | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const offset = node.data.indexOf(SEPARATOR);
    if (offset !== -1) { hit = { node, offset }; break; }
    node = walker.nextNode() as Text | null;
  }

  const serialize = (fragment: DocumentFragment): string => {
    const holder = document.createElement("div");
    holder.appendChild(fragment);
    return holder.innerHTML.trim();
  };

  if (!hit) {
    const date = serialize(document.createRange().createContextualFragment(root.innerHTML));
    return { date: date || undefined, time: undefined };
  }

  const before = document.createRange();
  before.setStart(root, 0);
  before.setEnd(hit.node, hit.offset);

  const after = document.createRange();
  // Start AT the separator, not after it, so the "·" is captured inside the
  // cloned formatting rather than re-added as bare text alongside it. That's
  // what makes the separator scale and restyle with the rest of the line:
  // prefixing it manually left it outside every span, so it kept the field's
  // base size while the date and time changed around it.
  after.setStart(hit.node, hit.offset);
  after.setEnd(root, root.childNodes.length);

  const dateHtml = serialize(before.cloneContents());
  // Already begins with the separator, matching the stored-time convention the
  // generate step and the email template both rely on.
  const timeHtml = serialize(after.cloneContents());
  const timeText = timeHtml.replace(/<[^>]+>/g, "").replace(SEPARATOR, "").trim();

  return {
    date: dateHtml || undefined,
    time: timeText ? timeHtml : undefined,
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
