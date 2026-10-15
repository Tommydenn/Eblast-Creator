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
/**
 * Zoom percentages, as the viewer understands them: 100 is the page at its
 * own size, not the size it happens to fit the panel at.
 */
const ZOOMS = [25, 50, 75, 100, 125, 150, 200];

export function FlyerPanel({ draftId }: { draftId: string }) {
  const url = `/api/drafts/${draftId}/flyer`;
  // null is fit-to-width, which is what the panel opens at and what it
  // returns to after being dragged wider or narrower.
  const [pct, setPct] = useState<number | null>(null);

  const zoomOut = () =>
    setPct((z) => (z === null ? 50 : ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)]));
  const zoomIn = () =>
    setPct((z) => (z === null ? 125 : ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)]));

  // Fit re-fits whenever the panel changes width; a percentage is absolute
  // and deliberately does not.
  const fragment = pct === null ? `#toolbar=0&view=FitH` : `#toolbar=0&zoom=${pct}`;

  const btn =
    "w-5 h-5 flex items-center justify-center rounded text-[#7a8c85] hover:text-[#1F4538] hover:bg-[#e8e3dc] disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

  return (
    <div className="h-full flex flex-col border-l border-[#e8e3dc] bg-[#f0ede7]">
      <div className="h-9 flex items-center justify-between px-3 border-b border-[#e8e3dc] shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4]">Flyer</span>
        {/* The viewer's own toolbar is turned off below, so the few controls
            worth having live here, at the panel's width rather than the
            toolbar's. No close button: "Hide flyer" in the preview header
            already does that, and two controls for one panel read as two. */}
        <div className="flex items-center gap-1.5">
          <button onClick={zoomOut} disabled={pct === ZOOMS[0]} title="Zoom out" className={btn}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button
            onClick={() => setPct(null)}
            disabled={pct === null}
            title="Fit to the panel"
            className="text-[10px] font-medium tabular-nums text-[#7a8c85] hover:text-[#1F4538] disabled:text-[#9aaba4] disabled:hover:text-[#9aaba4] w-9 text-center transition-colors"
          >
            {pct === null ? "Fit" : `${pct}%`}
          </button>
          <button onClick={zoomIn} disabled={pct === ZOOMS[ZOOMS.length - 1]} title="Zoom in" className={btn}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1.5 text-[10px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors"
          >
            Open in a tab
          </a>
        </div>
      </div>
      {/* The browser's own PDF viewer, with its toolbar turned off.

          That toolbar neither wraps nor collapses, and it is wider than this
          panel wants to be, so when it did not fit the viewer scrolled its
          whole body sideways and took the flyer with it. Chromium parses
          toolbar=0 out of the fragment and draws the page alone.

          Zoom is the viewer's own, through the zoom parameter, so the page
          scales inside a viewer that stays exactly the size of this panel.
          The iframe is always full width: sizing it was how zoom used to
          work here, and it moved the panel around as well as the flyer.

          The key remounts the frame when the fragment changes. Whether this
          viewer re-reads a fragment it has already loaded is not something
          its documentation settles, and a remount does not depend on it —
          the PDF is served cacheable, so it costs a cache hit.

          A browser that cannot draw a PDF inline shows its own empty frame
          here; an iframe, unlike an object, cannot declare a fallback. The
          tab link above is the way out, and it is there either way. */}
      <div className="flex-1 min-h-0">
        <iframe
          key={fragment}
          src={`${url}${fragment}`}
          title="The flyer this eblast was written from"
          className="block w-full h-full border-0"
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
