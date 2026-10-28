"use client";

import React, { useRef, useState } from "react";
import { useDraft } from "@/context/DraftContext";
import { orderedBlocks } from "@/lib/eblast-blocks";

/**
 * What is being dragged, for as long as it is being dragged.
 *
 * Module-level rather than state because `dragover` fires constantly and needs
 * to know, synchronously, whether the thing under the cursor is somewhere the
 * dragged block is allowed to land. The browser will not let us read
 * dataTransfer during dragover, only on drop.
 */
let dragging: { section: string; name: string } | null = null;

/**
 * One block in the sidebar, and the grip that moves it.
 *
 * A block moves only within its own section, so a drag that wanders into
 * another section's boxes simply finds nowhere to land — the rule is enforced
 * by there being no drop target, not by a message after the fact.
 *
 * The grip appears on hover, like the eye beside it, and the box is only
 * draggable while the grip is held. Making the whole box draggable all the
 * time would mean selecting a word in it started a drag instead.
 */
export function Reorderable({
  section,
  name,
  children,
}: {
  section: string;
  name: string;
  children: React.ReactNode;
}) {
  const { fields, setField } = useDraft();
  const [armed, setArmed] = useState(false);
  const [edge, setEdge] = useState<"above" | "below" | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const move = (from: string, before: boolean) => {
    if (!fields) return;
    const order = orderedBlocks(fields, section).map((b) => b.name);
    const without = order.filter((n) => n !== from);
    const at = without.indexOf(name);
    if (at === -1) return;
    without.splice(before ? at : at + 1, 0, from);
    setField("blockOrder", { ...(fields.blockOrder ?? {}), [section]: without });
  };

  const sameSection = () => dragging && dragging.section === section && dragging.name !== name;

  return (
    <div
      ref={rowRef}
      draggable={armed}
      onDragStart={(e) => {
        dragging = { section, name };
        e.dataTransfer.effectAllowed = "move";
        // Firefox will not start a drag without something on the transfer.
        e.dataTransfer.setData("text/plain", name);
      }}
      onDragEnd={() => {
        dragging = null;
        setArmed(false);
        setEdge(null);
      }}
      onDragOver={(e) => {
        if (!sameSection()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const box = rowRef.current?.getBoundingClientRect();
        if (box) setEdge(e.clientY < box.top + box.height / 2 ? "above" : "below");
      }}
      onDragLeave={() => setEdge(null)}
      onDrop={(e) => {
        if (!sameSection() || !dragging) return;
        e.preventDefault();
        move(dragging.name, edge !== "below");
        dragging = null;
        setEdge(null);
      }}
      className={[
        "group/hideable relative rounded-lg transition-shadow",
        armed ? "cursor-grabbing" : "",
        edge === "above" ? "shadow-[0_-2px_0_0_#1F4538]" : "",
        edge === "below" ? "shadow-[0_2px_0_0_#1F4538]" : "",
      ].join(" ")}
    >
      <span
        // Held to drag. The box becomes draggable only while this is down, so
        // selecting text inside it still works the rest of the time.
        onMouseDown={() => setArmed(true)}
        onMouseUp={() => setArmed(false)}
        title="Drag to move this within its section"
        aria-hidden
        className="absolute -left-3.5 top-0.5 cursor-grab text-[#c3bdb4] opacity-0 transition-opacity hover:text-[#5a6b63] group-hover/hideable:opacity-100"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.6" /><circle cx="15" cy="5" r="1.6" />
          <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="19" r="1.6" /><circle cx="15" cy="19" r="1.6" />
        </svg>
      </span>
      {children}
    </div>
  );
}
