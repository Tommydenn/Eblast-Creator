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
 * The control shows nothing until the pointer is in the gap. There are a lot
 * of gaps — one after every box — and a standing "+ line" in each of them read
 * as a wall of buttons with the actual eblast lost somewhere behind it. It
 * still holds its height when hidden, so revealing it moves nothing.
 *
 * Lines already in the gap are not hidden this way. They are content, and
 * content you cannot see until you hover it is content you will forget about.
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

  const add = () =>
    write([
      ...all,
      {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        text: "",
        after: slot,
      },
    ]);

  return (
    <div className="-my-2 space-y-2">
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

      <div className="group/gap py-2">
        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover/gap:opacity-100 focus-within:opacity-100">
          <span className="h-px flex-1 bg-[#e8e3dc]" aria-hidden />
          <button
            type="button"
            onClick={add}
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-[#9aaba4] hover:bg-[#f0f5f2] hover:text-[#1F4538] transition-colors"
            title="Add a line of text here"
          >
            + line
          </button>
          <span className="h-px flex-1 bg-[#e8e3dc]" aria-hidden />
        </div>
      </div>
    </div>
  );
}
