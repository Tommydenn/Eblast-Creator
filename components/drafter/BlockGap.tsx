"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput } from "@/components/drafter/RichEditor";
import { allCustomLines, type CustomSlot, type CustomLine } from "@/lib/extracted-flyer";

const baseInput =
  "w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors";

/**
 * The lines someone added in one gap of the eblast, and the control that
 * adds another there.
 *
 * One of these sits after every box in the sidebar, so the gaps are the ones
 * the email actually has and a line lands where you put it. A gap belongs to
 * one section, which is the whole of the containment rule: a line added in the
 * hero sits in a hero gap and cannot end up in the story.
 *
 * This replaces the footer's own "+ line", which was the only place you could
 * add anything.
 */
export function BlockGap({ slot }: { slot: CustomSlot }) {
  const { fields, setFields, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  const all = fields ? allCustomLines(fields) : [];
  const mine = all.filter((l) => l.after === slot);

  // Writing moves whatever the old footer-only list held into the new one, so
  // a draft written before the other sections had gaps quietly catches up the
  // first time anybody touches a line.
  const write = (next: CustomLine[]) =>
    setFields({
      customLines: next.length ? next : undefined,
      footerCustomLines: undefined,
    });

  return (
    <div className="space-y-2">
      {mine.map((line) => (
        <div key={line.id} className="flex items-start gap-2">
          <div className="flex-1">
            <RichInput
              value={line.text}
              onValueChange={(html) =>
                write(all.map((l) => (l.id === line.id ? { ...l, text: html } : l)))
              }
              placeholder="Extra line"
              className={baseInput}
              activeEditorRef={activeEditorRef}
              activeEditorCallback={activeEditorCallback}
              activeFieldNameRef={activeFieldNameRef}
              fieldName={`footerCustomLine:${line.id}`}
            />
          </div>
          <button
            type="button"
            onClick={() => write(all.filter((l) => l.id !== line.id))}
            className="mt-1.5 px-1 text-sm leading-none text-[#b9a89a] hover:text-[#a4552f] transition-colors"
            title="Remove this line"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          write([
            ...all,
            {
              id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              text: "",
              after: slot,
            },
          ])
        }
        className="w-full py-0.5 text-[11px] text-[#d5cec5] hover:text-[#1F4538] transition-colors"
        title="Add a line of text here"
      >
        + line
      </button>
    </div>
  );
}
