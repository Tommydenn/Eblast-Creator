"use client";

import React, { useEffect, useState } from "react";
import { useDraft } from "@/context/DraftContext";

/**
 * The flyer this draft was written from, beside the eblast preview.
 *
 * Purely for reference — nothing here edits anything. It sits next to the
 * preview so the copy can be checked against its source without leaving the
 * page, which is what the second browser tab was doing badly: browsers won't
 * open a tab behind the current one, so it stole focus every time.
 *
 * Renders nothing at all when the draft has no flyer, which covers drafts
 * written from pasted details and everything made before flyers were kept.
 */
/** Zoom steps. 1 is fit-to-width, which is where the panel opens. */
const ZOOMS = [1, 1.25, 1.5, 2];

export function FlyerPanel({ draftId }: { draftId: string }) {
  const url = `/api/drafts/${draftId}/flyer`;
  const [step, setStep] = useState(0);
  const zoom = ZOOMS[step];

  return (
    <div className="h-full flex flex-col border-l border-[#e8e3dc] bg-[#f0ede7]">
      <div className="h-9 flex items-center justify-between px-3 border-b border-[#e8e3dc] shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4]">Flyer</span>
        {/* The viewer's own toolbar is turned off below, so the few controls
            worth having live here, at the panel's width rather than the
            toolbar's. No close button: "Hide flyer" in the preview header
            already does that, and two controls for one panel read as two. */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStep((i) => Math.max(0, i - 1))}
            disabled={step === 0}
            title="Zoom out"
            className="w-5 h-5 flex items-center justify-center rounded text-[#7a8c85] hover:text-[#1F4538] hover:bg-[#e8e3dc] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <span className="text-[10px] font-medium tabular-nums text-[#9aaba4] w-8 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setStep((i) => Math.min(ZOOMS.length - 1, i + 1))}
            disabled={step === ZOOMS.length - 1}
            title="Zoom in"
            className="w-5 h-5 flex items-center justify-center rounded text-[#7a8c85] hover:text-[#1F4538] hover:bg-[#e8e3dc] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-[10px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors"
          >
            Open in a tab
          </a>
        </div>
      </div>
      {/* The browser's own PDF viewer, with its toolbar turned off.

          That toolbar neither wraps nor collapses, and it is wider than this
          panel wants to be, so when it did not fit the viewer scrolled its
          whole body sideways and took the flyer with it. Chromium parses
          toolbar=0 out of the fragment and draws the page alone; view=FitH
          then fits that page to whatever width the panel has.

          Zoom is ours rather than the viewer's: the iframe is made wider than
          this box and fit-to-width does the rest, so the page grows and this
          box scrolls. Asking the viewer to zoom would mean changing the
          fragment and trusting it to notice.

          The message underneath shows through only if nothing renders over
          it, which is the fallback an iframe cannot declare for itself. */}
      <div className="relative flex-1 overflow-x-auto overflow-y-hidden">
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-xs text-[#7a8c85]">
            This browser won&rsquo;t display PDFs inline.{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#1F4538] underline">
              Open the flyer in a tab
            </a>
            .
          </p>
        </div>
        <iframe
          src={`${url}#toolbar=0&view=FitH`}
          title="The flyer this eblast was written from"
          className="relative block h-full border-0"
          style={{ width: `${zoom * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Whether this draft has a flyer worth showing.
 *
 * Asked with ?exists=1 so a multi-megabyte PDF is not downloaded merely to
 * find out whether the button should appear.
 *
 * Asked again whenever a flyer is attached. A hand-uploaded flyer is staged
 * before the draft has an id and claimed once it does, so a draft generated
 * from one answers "no" for the moment between the two — and used to go on
 * answering "no", leaving the button hidden until the page was reloaded.
 */
export function useHasFlyer(draftId: string | null): boolean {
  const { flyerAttachedAt } = useDraft();
  const [hasFlyer, setHasFlyer] = useState(false);

  useEffect(() => {
    if (!draftId) { setHasFlyer(false); return; }
    let cancelled = false;
    fetch(`/api/drafts/${draftId}/flyer?exists=1`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setHasFlyer(!!d?.hasFlyer); })
      .catch(() => { if (!cancelled) setHasFlyer(false); });
    return () => { cancelled = true; };
  }, [draftId, flyerAttachedAt]);

  return hasFlyer;
}
