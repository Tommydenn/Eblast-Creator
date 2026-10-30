"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * The rows of a section, in the order the email draws them, dragged to change
 * it.
 *
 * Reordering was only in the row menu, which is correct and unfindable. The
 * guidance on this is consistent: a grip is the clearest statement that a
 * thing can be dragged, the pointer should say so too, and the place it will
 * land should be drawn rather than guessed at — so a line appears at the
 * boundary the row would drop into. It is also consistent that dragging must
 * never be the only way, because a drag cannot be done from a keyboard. The
 * row menu keeps Move up and Move down for exactly that.
 *
 * What is in this list is what can be reordered, and nothing else is in it.
 * A rule between the rows is what says they are one sequence; the photo above
 * sits in a card and the colours below sit on their own surface, so neither
 * can be read as a row that has lost its grip.
 */

/**
 * What is being dragged, for as long as it is.
 *
 * Module-level rather than state because `dragover` fires constantly and has
 * to know, synchronously, what is being carried. The browser will not let us
 * read dataTransfer during dragover, only on drop.
 */
let dragging: { list: string; key: string } | null = null;

export interface OrderableRow {
  /** Stable across a reorder, so the caller can read the new order back. */
  key: string;
  node: React.ReactNode;
}

export function Orderable({
  /** Names this list, so a drag can never land in another one. */
  id,
  rows,
  onReorder,
}: {
  id: string;
  rows: OrderableRow[];
  /** The keys in their new order, once a row has been dropped. */
  onReorder: (keys: string[]) => void;
}) {
  const [held, setHeld] = useState<string | null>(null);
  const [edge, setEdge] = useState<{ key: string; side: "above" | "below" } | null>(null);
  const boxes = useRef<Record<string, HTMLDivElement | null>>({});

  // Pressing the grip and letting go somewhere else never reaches the grip's
  // own mouseup, and the row would stay draggable afterwards — which means
  // selecting a word inside it starts a drag instead. A real drag suppresses
  // mouseup and ends at dragend, so this only ever catches the click case.
  useEffect(() => {
    if (!held) return;
    const up = () => setHeld(null);
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, [held]);

  if (rows.length === 0) return null;

  const move = (from: string, onto: string, before: boolean) => {
    const keys = rows.map((r) => r.key).filter((k) => k !== from);
    const at = keys.indexOf(onto);
    if (at === -1) return;
    keys.splice(before ? at : at + 1, 0, from);
    onReorder(keys);
  };

  const mine = () => dragging?.list === id;
  // One row is not a sequence, so it gets no handle and no hint of one.
  const movable = rows.length > 1;

  return (
    <div className="-mx-1">
      {rows.map((row, i) => {
        const here = edge?.key === row.key ? edge.side : null;
        const first = i === 0;
        return (
          <div
            key={row.key}
            ref={(el) => { boxes.current[row.key] = el; }}
            // Draggable only while the grip is held, so selecting a word in
            // one of these boxes still selects it rather than starting a drag.
            draggable={held === row.key}
            onDragStart={(e) => {
              dragging = { list: id, key: row.key };
              e.dataTransfer.effectAllowed = "move";
              // Firefox will not start a drag without something on the transfer.
              e.dataTransfer.setData("text/plain", row.key);
            }}
            onDragEnd={() => { dragging = null; setHeld(null); setEdge(null); }}
            onDragOver={(e) => {
              if (!mine() || dragging?.key === row.key) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const box = boxes.current[row.key]?.getBoundingClientRect();
              if (box) setEdge({ key: row.key, side: e.clientY < box.top + box.height / 2 ? "above" : "below" });
            }}
            onDragLeave={() => setEdge((was) => (was?.key === row.key ? null : was))}
            onDrop={(e) => {
              if (!mine() || !dragging || dragging.key === row.key) return;
              e.preventDefault();
              move(dragging.key, row.key, here !== "below");
              dragging = null;
              setHeld(null);
              setEdge(null);
            }}
            className={[
              "group/item relative rounded-md px-1 py-3",
              first ? "" : "border-t border-[#EFEBE4]",
              held === row.key ? "opacity-45" : "",
              here === "above" ? "shadow-[inset_0_2px_0_0_#1F4538]" : "",
              here === "below" ? "shadow-[inset_0_-2px_0_0_#1F4538]" : "",
            ].join(" ")}
          >
            {movable && (
              <span
                // Held to drag. Not a tab stop: a drag cannot be performed from
                // a keyboard anyway, and the row menu carries Move up and Move
                // down for anyone not using a pointer.
                aria-hidden
                onMouseDown={() => setHeld(row.key)}
                onMouseUp={() => setHeld(null)}
                title="Drag to move this within the section"
                className={[
                  "absolute left-0 top-3.5 grid h-5 w-4 place-items-center transition-opacity",
                  "text-[#9BA29E] hover:text-[#495250]",
                  held === row.key ? "cursor-grabbing opacity-100" : "cursor-grab opacity-0 group-hover/item:opacity-100",
                ].join(" ")}
              >
                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                  <circle cx="2" cy="2" r="1.3" /><circle cx="8" cy="2" r="1.3" />
                  <circle cx="2" cy="6" r="1.3" /><circle cx="8" cy="6" r="1.3" />
                  <circle cx="2" cy="10" r="1.3" /><circle cx="8" cy="10" r="1.3" />
                </svg>
              </span>
            )}
            {/* An item is usually one box, but the hero's band is three of
                them — the date, the time and the address — which the email
                draws inside one border and moves as a piece. They are spaced
                like any other boxes; what they share is a place in the order. */}
            <div className={`space-y-3.5 ${movable ? "pl-5" : ""}`}>{row.node}</div>
          </div>
        );
      })}
    </div>
  );
}
