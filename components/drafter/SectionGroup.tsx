"use client";

import React, { useRef, useState } from "react";
import { HideToggle, useHidden } from "@/components/drafter/HideToggle";

/**
 * One section of the email, in the sidebar's outline.
 *
 * The sidebar used to be five tabs, and a tab was not a section: the Hero tab
 * held the Header and the Hero, the Footer tab held the Call to Action and the
 * Footer, and the photos were on a tab of their own, away from the words they
 * sit between. So the names along the top of the sidebar did not describe the
 * email, and there was no view of the email's shape anywhere — which is why
 * the order of the sections had to be edited in a list of its own, in a
 * collapsed row that existed because the tabs could not show it.
 *
 * This is that list and the editor at the same time. Every section of the
 * email is a row, in the order the email draws them; opening one shows its
 * fields. So the outline is always on screen, a section is hidden and moved
 * where it is named, and the separate order list is gone.
 *
 * One section is open at a time. That is not for tidiness: the AI under the
 * preview is pointed at the section being worked on, and "the section being
 * worked on" has to be a single, obvious thing or the scope of a request
 * becomes a guess.
 */

/** What is being dragged, read synchronously during dragover. */
let dragging: string | null = null;

export function SectionGroup({
  name,
  flag,
  open,
  empty,
  fixed,
  onOpen,
  onMove,
  children,
}: {
  /** The section's name, as the email tags it and a stored order refers to it. */
  name: string;
  /**
   * The field that hides the whole section.
   *
   * The subject line has none: it is the envelope rather than part of the
   * email, so there is nothing in it to hide and no row of the email it could
   * be moved above.
   */
  flag?: string;
  open: boolean;
  /** The section has nothing to edit — the header row is the whole of it. */
  empty?: boolean;
  /** Pinned where it is, and not part of the email's order. */
  fixed?: boolean;
  onOpen: () => void;
  onMove: (from: string, onto: string, before: boolean) => void;
  children?: React.ReactNode;
}) {
  const hidden = useHidden(undefined, flag);
  const [edge, setEdge] = useState<"above" | "below" | null>(null);
  const [armed, setArmed] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const elsewhere = () => !fixed && dragging !== null && dragging !== name;

  return (
    <div
      ref={rowRef}
      draggable={armed}
      onDragStart={(e) => {
        dragging = name;
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
        if (!elsewhere()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const box = rowRef.current?.getBoundingClientRect();
        // Measured against the header's own height rather than the group's, so
        // an open section with a long body does not turn its whole height into
        // one drop half.
        if (box) setEdge(e.clientY < box.top + 18 ? "above" : "below");
      }}
      onDragLeave={() => setEdge(null)}
      onDrop={(e) => {
        if (!elsewhere() || !dragging) return;
        e.preventDefault();
        onMove(dragging, name, edge !== "below");
        dragging = null;
        setEdge(null);
      }}
      className={[
        "group/section border-b border-[#f0ede7] last:border-b-0",
        edge === "above" ? "shadow-[inset_0_2px_0_0_#1F4538]" : "",
        edge === "below" ? "shadow-[inset_0_-2px_0_0_#1F4538]" : "",
      ].join(" ")}
    >
      {/* The header row carries everything a section can have done to it:
          opened, hidden, moved. One row, three controls, in the order you
          reach for them. */}
      <div
        className={[
          "group/hideable relative flex items-center gap-2 pl-7 pr-4 transition-colors",
          open ? "bg-white" : "hover:bg-[#f5f3ef]",
        ].join(" ")}
      >
        {/* Held to drag. The row is only draggable while this is down, so a
            click on the row still opens the section. */}
        {!fixed && (
          <span
            onMouseDown={() => setArmed(true)}
            onMouseUp={() => setArmed(false)}
            title={`Drag to move the ${name} section`}
            aria-hidden
            className="absolute left-2 cursor-grab text-[#c3bdb4] opacity-0 transition-opacity hover:text-[#5a6b63] group-hover/section:opacity-100"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.6" /><circle cx="15" cy="5" r="1.6" />
              <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="19" r="1.6" /><circle cx="15" cy="19" r="1.6" />
            </svg>
          </span>
        )}

        {/* A section with nothing to edit is not a button, and has no
            chevron. The header band is drawn from the community's logo and
            colours, so there is nothing behind the row to open — and a row
            that highlights itself and then shows an empty panel is a
            promise it cannot keep. Its eye and its grip still work, which
            is everything such a section can be told. */}
        <Row empty={empty} onOpen={onOpen}>
          {empty ? (
            <span className="w-2.5" aria-hidden />
          ) : (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-hidden
              className={[
                "shrink-0 transition-transform",
                open ? "rotate-90 text-[#5a6b63]" : "text-[#c3bdb4]",
              ].join(" ")}
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
          )}
          <span
            className={[
              "text-[13px] transition-colors",
              hidden ? "text-[#c3bdb4]" : open ? "font-semibold text-[#1F4538]" : "font-medium text-[#3a3a3a]",
            ].join(" ")}
          >
            {name}
          </span>
        </Row>

        {flag && <HideToggle flag={flag} what={`the ${name} section`} />}
      </div>

      {open && !empty && <div className="space-y-4 bg-white px-4 pb-5 pt-1">{children}</div>}
    </div>
  );
}

/** The name and its chevron: a button where there is something to open. */
function Row({
  empty,
  onOpen,
  children,
}: {
  empty?: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  const inside = "flex flex-1 items-center gap-2 py-2.5 text-left";
  return empty ? (
    <span className={inside}>{children}</span>
  ) : (
    <button type="button" onClick={onOpen} className={inside}>
      {children}
    </button>
  );
}
