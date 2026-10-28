"use client";

import React, { useEffect, useRef, useState } from "react";
import { useDraft } from "@/context/DraftContext";
import { SECTION_LABELS, type EblastSection } from "@/lib/eblast-sections";

/**
 * The AI, along the foot of the preview.
 *
 * It used to be a tab in the sidebar, which meant asking for a change hid the
 * fields the change was about. Down here it sits under the email at all times,
 * beside the section being worked on rather than instead of it.
 *
 * It follows that section. Clicking the hero in the preview, or opening the
 * Hero tab, points this at the hero — so "make it shorter" means the thing in
 * front of you, and nothing outside it is allowed to move. The scope is a
 * button, because some instructions really are about the whole email.
 *
 * Undo and redo used to live here, when they only covered what the AI had
 * done. They cover every edit now, so they belong with the other things that
 * act on the whole draft rather than in the box that asks for one kind of
 * change.
 */
export function AiBar() {
  const { refine, isRefining, refineError, refineNote, changedFields, activeSection, fields } = useDraft();

  const [instruction, setInstruction] = useState("");
  const [wholeEmail, setWholeEmail] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A new section is a new subject; last time's result is about the old one.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(true); }, [activeSection]);
  useEffect(() => { if (isRefining) setDismissed(false); }, [isRefining]);

  if (!fields) return null;

  const section = activeSection as EblastSection;
  const scopeLabel = wholeEmail ? "Whole email" : SECTION_LABELS[section] ?? "Whole email";

  async function handleRefine() {
    const asked = instruction.trim();
    if (!asked || isRefining) return;
    setInstruction("");
    await refine(asked, wholeEmail ? null : section);
    inputRef.current?.focus();
  }

  const result = !dismissed && !isRefining && (refineError || refineNote);

  return (
    <div className="shrink-0 border-t border-[#e8e3dc] bg-white">
      {result && (
        <div className="px-4 pt-2.5 flex items-start gap-2">
          {refineError ? (
            <p className="text-xs text-[#b3312c]">{refineError}</p>
          ) : (
            <p className="text-xs text-[#5a6b63]">
              {refineNote}
              {changedFields.length > 0 && (
                <span className="text-[#9aaba4]"> &mdash; changed {changedFields.join(", ").toLowerCase()}</span>
              )}
            </p>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto shrink-0 text-[#b0a89f] hover:text-[#5a6b63] transition-colors"
            title="Dismiss"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="px-4 py-2.5 flex items-center gap-2">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1F4538" strokeWidth="2" className="shrink-0">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>

        <button
          onClick={() => setWholeEmail((w) => !w)}
          title={wholeEmail ? "Limit this to the section you are working on" : "Let this reach the whole email"}
          className={[
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
            wholeEmail
              ? "bg-[#f0ede7] text-[#7a8c85] hover:bg-[#e8e3dc]"
              : "bg-[#f0f5f2] text-[#1F4538] hover:bg-[#e3ede8]",
          ].join(" ")}
        >
          {scopeLabel}
        </button>

        <textarea
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); }
          }}
          rows={1}
          disabled={isRefining}
          placeholder={
            wholeEmail
              ? "Ask for a change anywhere in the email…"
              : `Ask for a change to the ${scopeLabel.toLowerCase()}…`
          }
          className="flex-1 min-w-0 resize-none rounded-lg border border-[#ddd8d0] bg-[#faf9f6] px-3 py-1.5 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] disabled:opacity-50"
        />

        <button
          onClick={handleRefine}
          disabled={!instruction.trim() || isRefining}
          className="shrink-0 rounded-lg bg-[#1F4538] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[#173829] transition-colors disabled:opacity-40"
        >
          {isRefining ? (
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : "Go"}
        </button>

      </div>
    </div>
  );
}
