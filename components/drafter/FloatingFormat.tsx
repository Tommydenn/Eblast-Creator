"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDraft } from "@/context/DraftContext";
import { FormatToolbar } from "@/components/drafter/RichEditor";

/**
 * Formatting, on the words it formats.
 *
 * The toolbar used to be a permanent bar across the top of the preview: ten
 * controls, always there, almost always doing nothing, because nine times in
 * ten there is no selection for them to act on. Material's own guidance is
 * that a docked toolbar is for what is always available and a floating one
 * for what belongs to a selection — bold belongs to a selection.
 *
 * So it appears beside whatever you are typing in and goes away when you stop.
 * The panel carries none of it, which is ten controls out of a panel that
 * holds five fields.
 */
export function FloatingFormat({ brandColors, brandFonts }: { brandColors: string[]; brandFonts: string[] }) {
  const { activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  const pillRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  const measure = useCallback(() => {
    const el = activeEditorRef.current;
    const active = document.activeElement;
    // The toolbar's own buttons never take focus — they preventDefault on
    // mousedown — but its font-size box does, so focus inside the pill counts
    // as still editing the field the pill is attached to.
    const editing = !!el && (el === active || el.contains(active as Node));
    const inPill = !!pillRef.current && pillRef.current.contains(active as Node);
    if (!el || (!editing && !inPill)) {
      setAt(null);
      return;
    }
    const box = el.getBoundingClientRect();
    const width = pillRef.current?.offsetWidth ?? 380;
    const height = pillRef.current?.offsetHeight ?? 36;
    const left = Math.max(12, Math.min(box.left - 6, window.innerWidth - width - 12));
    const above = box.top - height - 8;
    const next = { left, top: above > 64 ? above : box.bottom + 8 };
    // selectionchange fires on every keystroke, so only move when it has moved.
    setAt((was) => (was && was.left === next.left && was.top === next.top ? was : next));
  }, [activeEditorRef]);

  useEffect(() => {
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    // A blur lands before the next focus, so the answer is only right once the
    // browser has settled on where focus went.
    const later = () => setTimeout(soon, 0);
    document.addEventListener("focusin", soon);
    document.addEventListener("focusout", later);
    document.addEventListener("selectionchange", soon);
    window.addEventListener("scroll", soon, true);
    window.addEventListener("resize", soon);
    soon();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", soon);
      document.removeEventListener("focusout", later);
      document.removeEventListener("selectionchange", soon);
      window.removeEventListener("scroll", soon, true);
      window.removeEventListener("resize", soon);
    };
  }, [measure]);

  if (!at) return null;

  return (
    <div
      ref={pillRef}
      style={{ left: at.left, top: at.top }}
      className="fixed z-50 flex items-center gap-0.5 rounded-full border border-[#E4E0D9] bg-white px-2 py-1 shadow-[0_8px_28px_rgba(27,29,28,0.16)]"
    >
      <FormatToolbar
        editorRef={activeEditorRef}
        brandColors={brandColors}
        brandFonts={brandFonts}
        onInput={() => activeEditorCallback.current?.()}
        activeFieldNameRef={activeFieldNameRef}
        className="flex items-center gap-0.5"
      />
    </div>
  );
}
