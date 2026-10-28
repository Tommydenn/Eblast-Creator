"use client";

import React from "react";
import { HideToggle, useHidden } from "@/components/drafter/HideToggle";

/**
 * Where one of the email's sections begins in the sidebar, and the control
 * that hides the whole of it.
 *
 * A tab is not a section. The first tab is the Header and the Hero, the last
 * is the Call to Action and the Footer — which was invisible here, so two
 * neighbouring boxes could belong to different parts of the email with
 * nothing to say so.
 *
 * It also gives a section the one thing it never had: somewhere of its own to
 * be hidden from. Hiding a section used to happen in the preview and be undone
 * from an amber banner at the top of the tab, a second control in a second
 * place with a third appearance. Now it is the same eye as everything else,
 * in the row that names the thing it acts on.
 */
export function SectionHeader({ label, flag }: { label: string; flag: string }) {
  const hidden = useHidden(undefined, flag);

  return (
    <div className="group/hideable flex items-center gap-3 pt-1">
      <span
        className={[
          "text-[10px] font-semibold uppercase tracking-widest transition-colors",
          hidden ? "text-[#c3bdb4]" : "text-[#9aaba4]",
        ].join(" ")}
      >
        {label}
      </span>
      <span className="h-px flex-1 bg-[#e8e3dc]" aria-hidden />
      <HideToggle flag={flag} what={`the ${label} section`} />
    </div>
  );
}
