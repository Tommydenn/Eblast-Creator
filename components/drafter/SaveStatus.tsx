"use client";

import React, { useEffect, useRef, useState } from "react";
import { useDraft } from "@/context/DraftContext";

/**
 * Whether this draft is safe, in one place.
 *
 * The command bar used to say so three times: a "Save Draft" button, a
 * spinning "Auto-saving…" pill that appeared between the community name and
 * the buttons and pushed them sideways as it came and went, and a green
 * "Saved" flash on the button itself. For a draft that saves itself five
 * seconds after every edit, and again on the way out.
 *
 * So this is a status, not a button — it says what is true and gets out of
 * the way. It is still clickable, because there is one moment where waiting
 * five seconds is not good enough: just before closing the laptop.
 *
 * The draft already tracked all of this. `isSaved` goes false on every edit
 * and true on every save, and was being ignored in favour of three signals
 * invented on the spot.
 */
export function SaveStatus({ autoSaving }: { autoSaving: boolean }) {
  const { isSaved, isSaving, saveError, waitingForImages, save } = useDraft();

  // When the last save landed, so "Saved" can say how long ago.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const wasSaved = useRef(isSaved);
  useEffect(() => {
    if (isSaved && !wasSaved.current) setSavedAt(Date.now());
    wasSaved.current = isSaved;
  }, [isSaved]);

  // Re-read the clock rather than the state: nothing changes except how long
  // ago it was, so this is the only thing that has to tick.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!isSaved) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [isSaved]);

  const busy = isSaving || autoSaving;
  const text = busy
    ? waitingForImages
      ? "Adding photos…"
      : "Saving…"
    : saveError
      ? "Not saved"
      : isSaved
        ? `Saved${savedAt ? ` ${ago(savedAt)}` : ""}`
        : "Unsaved changes";

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      title={busy ? undefined : "Save now"}
      className={[
        "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors",
        saveError ? "text-[#b3312c]" : "text-[#9aaba4] hover:text-[#5a6b63]",
        busy ? "cursor-default" : "hover:bg-[#f0ede7]",
      ].join(" ")}
    >
      {busy ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      ) : (
        // A filled dot while there is something unsaved, a hollow one once
        // there is not. The same mark either way, so the eye only has to
        // notice that it filled in.
        <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden>
          <circle cx="4" cy="4" r="3" fill={isSaved && !saveError ? "none" : "currentColor"} stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      {text}
    </button>
  );
}

/** How long ago, in the words someone would actually use. */
function ago(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
