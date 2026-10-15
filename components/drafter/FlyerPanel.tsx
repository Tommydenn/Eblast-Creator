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
export function FlyerPanel({ draftId, onClose }: { draftId: string; onClose: () => void }) {
  const url = `/api/drafts/${draftId}/flyer`;
  return (
    <div className="h-full flex flex-col border-l border-[#e8e3dc] bg-[#f0ede7]">
      <div className="h-9 flex items-center justify-between px-3 border-b border-[#e8e3dc] shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4]">Flyer</span>
        <div className="flex items-center gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors"
          >
            Open in a tab
          </a>
          <button
            onClick={onClose}
            title="Hide the flyer"
            className="text-[#b0a89f] hover:text-[#5a6b63] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      {/* The browser's own PDF viewer: scrolling, zoom and page navigation for
          free, and no PDF library shipped to the client.

          An iframe rather than an object. Chrome gives an embedded object its
          cut-down viewer, whose floating toolbar is clipped in a panel this
          size; an iframe gets the same full viewer a PDF opened in a tab does.
          The message underneath shows through only if nothing renders over it,
          which is the fallback an iframe cannot declare for itself. */}
      <div className="relative flex-1 w-full">
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-xs text-[#7a8c85]">
            This browser won&rsquo;t display PDFs inline.{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#1F4538] underline">
              Open the flyer in a tab
            </a>
            .
          </p>
        </div>
        <iframe src={url} title="The flyer this eblast was written from" className="absolute inset-0 w-full h-full border-0" />
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
