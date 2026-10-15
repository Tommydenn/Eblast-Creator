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
        {/* No close button here: "Hide flyer" in the preview header already
            does it, and two controls for one panel read as two different ones. */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors"
        >
          Open in a tab
        </a>
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
