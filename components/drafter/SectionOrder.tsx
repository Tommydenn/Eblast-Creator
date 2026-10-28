"use client";

import React, { useRef, useState } from "react";
import { useDraft } from "@/context/DraftContext";
import { orderedSections } from "@/lib/eblast-blocks";

/** Which section is being dragged, read synchronously during dragover. */
let dragging: string | null = null;

/**
 * The order of the email's sections, as one short list.
 *
 * Blocks are rearranged where they are edited, because a block and its
 * neighbours are always on the same tab. Sections are not: the Header and the
 * Hero are on the first tab and the Footer is on the last, so there is no
 * stretch of sidebar you could drag one along. This is the one place that
 * shows the whole email at once, which is the only place the order of its
 * parts can be changed — or simply read, which is worth something on its own.
 *
 * It is a single quiet row until opened, because it is a thing you do once and
 * then stop thinking about.
 */
export function SectionOrder() {
  const { fields, setField } = useDraft();
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState<{ name: string; edge: "above" | "below" } | null>(null);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});

  if (!fields) return null;

  const order = orderedSections(fields);
  const rearranged = !!fields.sectionOrder?.length;

  const move = (from: string, onto: string, before: boolean) => {
    const names = order.map((s) => s.name).filter((n) => n !== from);
    const at = names.indexOf(onto);
    if (at === -1) return;
    names.splice(before ? at : at + 1, 0, from);
    setField("sectionOrder", names);
  };

  return (
    <div className="border-b border-[#f0ede7]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4] hover:text-[#5a6b63] transition-colors"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={open ? "rotate-90 transition-transform" : "transition-transform"}
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
        Section order
        {rearranged && !open && <span className="font-normal normal-case tracking-normal text-[#c3bdb4]">· changed</span>}
      </button>

      {open && (
        <div className="px-5 pb-3 space-y-0.5">
          {order.map((section) => {
            const edge = over?.name === section.name ? over.edge : null;
            return (
              <div
                key={section.name}
                ref={(el) => { rows.current[section.name] = el; }}
                draggable
                onDragStart={(e) => {
                  dragging = section.name;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", section.name);
                }}
                onDragEnd={() => { dragging = null; setOver(null); }}
                onDragOver={(e) => {
                  if (!dragging || dragging === section.name) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const box = rows.current[section.name]?.getBoundingClientRect();
                  if (box) {
                    setOver({
                      name: section.name,
                      edge: e.clientY < box.top + box.height / 2 ? "above" : "below",
                    });
                  }
                }}
                onDragLeave={() => setOver((o) => (o?.name === section.name ? null : o))}
                onDrop={(e) => {
                  if (!dragging || dragging === section.name) return;
                  e.preventDefault();
                  move(dragging, section.name, edge !== "below");
                  dragging = null;
                  setOver(null);
                }}
                className={[
                  "group/row flex items-center gap-2 rounded-md px-1.5 py-1 text-xs cursor-grab transition-colors",
                  "text-[#5a6b63] hover:bg-[#f7f5f1]",
                  edge === "above" ? "shadow-[0_-2px_0_0_#1F4538]" : "",
                  edge === "below" ? "shadow-[0_2px_0_0_#1F4538]" : "",
                ].join(" ")}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-[#c3bdb4]">
                  <circle cx="9" cy="5" r="1.6" /><circle cx="15" cy="5" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="19" r="1.6" /><circle cx="15" cy="19" r="1.6" />
                </svg>
                <span className={isSectionHidden(fields, section.flag) ? "text-[#c3bdb4]" : undefined}>
                  {section.name}
                </span>
                {isSectionHidden(fields, section.flag) && (
                  <span className="text-[10px] text-[#c3bdb4]">hidden</span>
                )}
              </div>
            );
          })}

          {rearranged && (
            <button
              type="button"
              onClick={() => setField("sectionOrder", undefined)}
              className="pt-1 text-[10px] text-[#9aaba4] hover:text-[#1F4538] transition-colors"
            >
              Back to the usual order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function isSectionHidden(fields: unknown, flag: string): boolean {
  return !!(fields as Record<string, unknown> | null)?.[flag];
}
