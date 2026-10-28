"use client";

import React, { useRef, useState } from "react";
import { useDraft } from "@/context/DraftContext";
import { orderedSections } from "@/lib/eblast-blocks";
import { EyeButton, Grip } from "@/components/drafter/ui";

/** Which section is being dragged, read synchronously during dragover. */
let dragging: string | null = null;

/**
 * The order of the email's parts, in the one place it is any use.
 *
 * This used to be a permanent column beside the panel, listing seven sections
 * at all times so that the email could be navigated by reading its table of
 * contents instead of looking at it. The email is the navigation now, so the
 * list only has to exist where it actually does something — rearranging and
 * hiding — which is a thing you do once per eblast and then stop thinking
 * about. It lives with the email's own settings, behind clicking away from
 * everything.
 */
export function SectionList({ onSelect }: { onSelect: (name: string) => void }) {
  const { fields, setField } = useDraft();
  const [over, setOver] = useState<{ name: string; edge: "above" | "below" } | null>(null);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});

  if (!fields) return null;

  const order = orderedSections(fields);
  const rearranged = !!fields.sectionOrder?.length;
  const isHidden = (flag: string) => !!(fields as unknown as Record<string, unknown>)[flag];

  const move = (from: string, onto: string, before: boolean) => {
    const names = order.map((s) => s.name).filter((n) => n !== from);
    const at = names.indexOf(onto);
    if (at === -1) return;
    names.splice(before ? at : at + 1, 0, from);
    setField("sectionOrder", names);
  };

  return (
    <div className="space-y-0.5">
      {order.map((section) => {
        const edge = over?.name === section.name ? over.edge : null;
        const hidden = isHidden(section.flag);
        return (
          <div
            key={section.name}
            ref={(el) => { rows.current[section.name] = el; }}
            draggable
            onDragStart={(e) => {
              dragging = section.name;
              e.dataTransfer.effectAllowed = "move";
              // Firefox will not start a drag without something on the transfer.
              e.dataTransfer.setData("text/plain", section.name);
            }}
            onDragEnd={() => { dragging = null; setOver(null); }}
            onDragOver={(e) => {
              if (!dragging || dragging === section.name) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const box = rows.current[section.name]?.getBoundingClientRect();
              if (box) setOver({ name: section.name, edge: e.clientY < box.top + box.height / 2 ? "above" : "below" });
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
              "flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-[#F7F6F3]",
              dragging === section.name ? "bg-white shadow-[0_4px_12px_rgba(27,29,28,0.12)]" : "",
              edge === "above" ? "shadow-[0_-2px_0_0_#1F4538]" : "",
              edge === "below" ? "shadow-[0_2px_0_0_#1F4538]" : "",
            ].join(" ")}
          >
            <Grip />
            <button
              type="button"
              onClick={() => onSelect(section.name)}
              className={[
                "flex-1 truncate text-left text-[13px] transition-colors hover:text-[#1F4538]",
                hidden ? "text-[#9BA29E] line-through decoration-[#C9C4BB]" : "text-[#1B1D1C]",
              ].join(" ")}
            >
              {section.name}
            </button>
            <EyeButton
              hidden={hidden}
              what={`the ${section.name.toLowerCase()}`}
              onClick={() => setField(section.flag as never, (hidden ? undefined : true) as never)}
            />
          </div>
        );
      })}

      {rearranged && (
        <button
          type="button"
          onClick={() => setField("sectionOrder", undefined)}
          className="mt-1 rounded px-1.5 py-1 text-[11.5px] text-[#495250] transition-colors hover:bg-[#F7F6F3] hover:text-[#1B1D1C]"
        >
          Back to the usual order
        </button>
      )}
    </div>
  );
}
