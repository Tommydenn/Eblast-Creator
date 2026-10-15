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
export function FlyerPanel({ draftId }: { draftId: string }) {
  const url = `/api/drafts/${draftId}/flyer`;

  return (
    <div className="h-full flex flex-col border-l border-[#e8e3dc] bg-[#f0ede7]">
      <div className="h-9 flex items-center justify-between px-3 border-b border-[#e8e3dc] shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4]">Flyer</span>
        {/* No close button: "Hide flyer" in the preview header already does
            that, and two controls for one panel read as two. No zoom buttons
            either — see below. */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors"
        >
          Open in a tab
        </a>
      </div>
      {/* The browser's own PDF viewer, with its toolbar turned off.

          That toolbar neither wraps nor collapses, and it is wider than this
          panel wants to be, so when it did not fit the viewer scrolled its
          whole body sideways and took the flyer with it. Chromium parses
          toolbar=0 out of the fragment and draws the page alone; view=FitH
          fits that page to the panel, including after the panel is dragged.

          Zoom is left to the viewer: ctrl+wheel and pinch are its own, and
          they keep working with the toolbar hidden, which only takes away
          the buttons. Driving zoom from here meant a zoom parameter in the
          fragment, and the only way to be sure it was picked up was to
          reload the frame — which is what made zooming flicker, and what
          pinned it to whichever steps this file happened to list.

          A browser that cannot draw a PDF inline shows its own empty frame
          here; an iframe, unlike an object, cannot declare a fallback. The
          tab link above is the way out, and it is there either way. */}
      <div className="flex-1 min-h-0">
        <iframe
          src={`${url}#toolbar=0&view=FitH`}
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
