"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * The pieces the panel is built from, and the only place their look is
 * decided.
 *
 * The editor used to carry seven greys for text, six corner radii, eight type
 * sizes and six separate copies of the same input class. Nothing about that
 * was a decision — it was what accumulates when every section styles itself.
 * So the scale is short enough to hold in your head and lives in one file:
 *
 *   type      16/600 a section's name · 13 a value · 12/500 a label
 *             11 a note · 10.5/600 uppercase a group
 *   text      #1B1D1C says something · #495250 supports it · #6A736F is quiet
 *             #9BA29E is furniture and never carries words
 *   surface   #FFFFFF the panel · #F7F6F3 a group · #E9E5DE the canvas
 *   accent    #1F4538 · destructive #A3302B
 *   radius    6 a control · 9 a card · full a pill
 *
 * The lightest colour anything readable is set in measures 4.9:1 on white.
 * The old panel's lightest was #9aaba4, which measures about 2.9:1.
 */

export const INK = "#1B1D1C";
export const INK_SOFT = "#495250";
export const INK_QUIET = "#6A736F";
export const RULE = "#E4E0D9";
export const ACCENT = "#1F4538";

/** One input, everywhere. */
export const inputClass =
  "w-full rounded-md border border-[#DCD7CE] bg-white px-2.5 py-[7px] text-[13px] leading-[1.45] text-[#1B1D1C] " +
  "transition-[border-color,box-shadow] placeholder:text-[#9BA29E] " +
  "focus:outline-none focus:border-[#1F4538] focus:shadow-[0_0_0_3px_rgba(31,69,56,0.12)]";

/** A heading over a run of rows. The panel has at most two. */
export function Group({
  label,
  action,
  tone = "plain",
  children,
}: {
  label: string;
  action?: React.ReactNode;
  /**
   * A tinted group sits on its own surface rather than being ruled off.
   *
   * Dividers are for separating things of the same kind; a different kind of
   * thing is better told apart by what it sits on. Colour is not content, so
   * the appearance group gets a surface of its own and can never be read as
   * one more row in the list above it.
   */
  tone?: "plain" | "tinted";
  children: React.ReactNode;
}) {
  return (
    <section
      className={[
        "px-4 py-4",
        tone === "tinted"
          ? "bg-[#F7F6F3] border-t border-[#E4E0D9]"
          : "border-t border-[#EFEBE4] first:border-t-0",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#6A736F]">{label}</h3>
        {action}
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

/**
 * A button that opens a short list of actions.
 *
 * Every design system that has written this down says the same thing: show
 * the one or two actions a view is for, and put the rest behind one control
 * rather than spreading them along a bar. This is that one control — the
 * caret on a split button and the kebab at the end of the top bar are both
 * this, so they open and close identically.
 */
export function Menu({
  items,
  align = "right",
  className,
  title,
  label,
  children,
}: {
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
  title?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} title={title} aria-label={label} aria-expanded={open} className={className}>
        {children}
      </button>
      {open && (
        <div
          className={[
            "absolute top-full z-50 mt-1 w-48 overflow-hidden rounded-[9px] border border-[#E4E0D9] bg-white py-1 shadow-[0_12px_32px_rgba(27,29,28,0.16)]",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={[
                "block w-full px-3 py-1.5 text-left text-[12px] transition-colors disabled:opacity-35 disabled:cursor-default",
                item.danger ? "text-[#A3302B] hover:bg-[#FBF2F1]" : "text-[#1B1D1C] hover:bg-[#F7F6F3]",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One field: a label and a box.
 *
 * That is all a row carries at rest. The menu appears on the row you are
 * working on, which is the one place it can be read without competing with
 * the other nine. Before, every row wore a grip, an eye and a badge at once.
 */
export function Row({
  label,
  note,
  off,
  menu,
  children,
}: {
  label: string;
  note?: string;
  /**
   * This line is not in the email.
   *
   * One state for every reason it could be out — turned off, never written by
   * the draft, or written and not printed — because from the reader's side
   * there is only one outcome. It greys, it says so, and its menu stays on
   * screen so the switch is always within reach.
   */
  off?: boolean;
  menu?: MenuItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="group/row">
      <div className="flex items-center gap-2 mb-1">
        <span className="truncate text-[12px] font-medium text-[#495250]">{label}</span>
        {off && <Pill>Hidden</Pill>}
        <span className="flex-1" aria-hidden />
        {menu && menu.length > 0 && <RowMenu items={menu} what={label} always={off} />}
      </div>
      <div className={off ? "opacity-45 transition-opacity" : "transition-opacity"}>{children}</div>
      {note && <p className="mt-1 text-[11px] leading-snug text-[#6A736F]">{note}</p>}
    </div>
  );
}

/** A small standing label — hidden, changed, locked. Never a colour of alarm. */
export function Pill({ children, tone = "quiet" }: { children: React.ReactNode; tone?: "quiet" | "accent" }) {
  return (
    <span
      className={[
        "shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em]",
        tone === "accent" ? "bg-[#EDF2EF] text-[#1F4538]" : "bg-[#F0EDE7] text-[#6A736F]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * The one menu a row has.
 *
 * Hiding, moving and removing used to be three controls sitting on every row
 * at once, in three different places and two different colours. They are one
 * button now, and the row they belong to is the row you are on.
 */
export function RowMenu({
  items,
  what,
  always,
}: {
  items: MenuItem[];
  what: string;
  /** Kept on screen regardless — a hidden row has to be reachable to unhide. */
  always?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`More for ${what.toLowerCase()}`}
        aria-label={`More for ${what.toLowerCase()}`}
        className={[
          "grid h-5 w-5 place-items-center rounded text-[#6A736F] transition-all",
          "hover:bg-[#F0EDE7] hover:text-[#1B1D1C]",
          open || always
            ? "opacity-100"
            : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100",
          open ? "bg-[#F0EDE7]" : "",
        ].join(" ")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-40 w-40 overflow-hidden rounded-[9px] border border-[#E4E0D9] bg-white py-1 shadow-[0_8px_24px_rgba(27,29,28,0.12)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={[
                "block w-full px-3 py-1.5 text-left text-[12px] transition-colors disabled:opacity-35 disabled:cursor-default",
                item.danger
                  ? "text-[#A3302B] hover:bg-[#FBF2F1]"
                  : "text-[#1B1D1C] hover:bg-[#F7F6F3]",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Three buttons, not seven.
 *
 * `primary` sends the eblast somewhere, `secondary` is everything else that
 * acts, and `quiet` is a thing you can always undo.
 */
export function Button({
  tone = "secondary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "quiet" }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-[7px] text-[12px] font-medium transition-colors " +
    "disabled:opacity-40 disabled:cursor-not-allowed";
  const tones = {
    primary: "bg-[#1F4538] text-white hover:bg-[#173829] font-semibold",
    secondary: "border border-[#DCD7CE] bg-white text-[#1B1D1C] hover:border-[#1F4538] hover:text-[#1F4538]",
    quiet: "text-[#495250] hover:bg-[#F0EDE7] hover:text-[#1B1D1C]",
  } as const;
  return <button {...rest} className={[base, tones[tone], className ?? ""].join(" ")} />;
}

/** The eye. The one control that hides anything, wherever it appears. */
export function EyeButton({
  hidden,
  onClick,
  what,
}: {
  hidden: boolean;
  onClick: () => void;
  what: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={hidden}
      title={hidden ? `Show ${what}` : `Hide ${what}`}
      className="grid h-6 w-6 shrink-0 place-items-center rounded text-[#6A736F] transition-colors hover:bg-[#F0EDE7] hover:text-[#1B1D1C]"
    >
      {hidden ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

/** A handle for dragging, which is the only thing in the editor that drags. */
export function Grip() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-[#9BA29E]" aria-hidden>
      <circle cx="9" cy="5" r="1.7" /><circle cx="15" cy="5" r="1.7" />
      <circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" />
      <circle cx="9" cy="19" r="1.7" /><circle cx="15" cy="19" r="1.7" />
    </svg>
  );
}
