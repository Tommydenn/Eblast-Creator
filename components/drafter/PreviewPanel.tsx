"use client";

import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useDraft } from "@/context/DraftContext";
import { buildEblastHtml } from "@/lib/render-email";
import { IMAGE_LOADING_PLACEHOLDER } from "@/lib/image-bank";

/**
 * The email, which is also the way around it.
 *
 * There used to be four things a click in here could mean — open a tab, open
 * a colour picker, open a link box, or hide a line — decided by which of four
 * data attributes happened to be nearest the cursor. Three of them were
 * invisible until hovered, so the only way to learn any of it was by accident.
 *
 * A click means one thing now: open this part of the email in the panel.
 * Everything that was reachable only from here — colour, photo links, hiding
 * a line — is in that panel, named, where it can be read without hovering
 * anything.
 */
const PREVIEW_SCRIPT = /* javascript */`(function(){
  var style=document.createElement('style');
  style.textContent=
    '[data-section]{cursor:pointer}'+
    '[data-section][data-hover]{outline:2px solid rgba(31,69,56,0.30);outline-offset:-2px}'+
    '[data-section][data-selected]{outline:2px solid #1F4538;outline-offset:-2px}';
  // The head survives the body being replaced on every edit, so this is
  // written once and never has to be put back.
  (document.head||document.documentElement).appendChild(style);

  function sectionAt(target){
    var el=target;
    while(el&&el!==document.body){
      if(el.dataset&&el.dataset.section) return el;
      el=el.parentElement;
    }
    return null;
  }

  var hovered=null;
  function hover(el){
    if(hovered===el) return;
    if(hovered&&hovered.isConnected) hovered.removeAttribute('data-hover');
    hovered=el;
    if(el) el.setAttribute('data-hover','');
  }

  document.addEventListener('mousemove',function(e){
    hover(sectionAt(document.elementFromPoint(e.clientX,e.clientY)));
  },true);

  document.addEventListener('mouseleave',function(){ hover(null); },true);

  document.addEventListener('click',function(e){
    // Nothing in the editor's copy of the email navigates. A linked photo is
    // an <a>, and following it here would replace the preview with the
    // community's website.
    e.preventDefault();
    e.stopPropagation();
    var el=sectionAt(e.target);
    window.parent.postMessage({type:'section-click',section:el?el.dataset.section:null},'*');
  },true);
})();`;

function injectScript(doc: Document) {
  // Guarded on the Document itself (not a node under <body>) because the body
  // is replaced wholesale on every edit, which would otherwise make this look
  // uninjected again and stack a second copy of the listeners. The listeners
  // are on `document`, which survives that swap, so once is enough.
  if ((doc as any).__glmPreviewScriptInjected) return;
  (doc as any).__glmPreviewScriptInjected = true;
  const s = doc.createElement("script");
  s.setAttribute("data-preview-script", "1");
  s.textContent = PREVIEW_SCRIPT;
  doc.body.appendChild(s);
}

/** The email's fixed design width, matching the 600px shell in render-email.ts. */
const EMAIL_WIDTH = 600;

/**
 * Size the iframe to its content, then scale the whole thing down if the
 * column is narrower than the email.
 *
 * Done imperatively rather than through React state because it has to run in
 * the same frame as the height measurement; going through state left the
 * transform a render behind and it never applied.
 */
function resizeIframe(iframe: HTMLIFrameElement) {
  const doc = iframe.contentDocument;
  if (!doc?.body) return;
  // Measured from the body, not documentElement. documentElement.scrollHeight
  // is never less than the iframe is tall, so once the frame had been sized it
  // could only ever report that size back — the height ratcheted up and never
  // came down. The body is a plain block with no height of its own, so it
  // measures its contents.
  const h = doc.body.scrollHeight || doc.documentElement.scrollHeight;
  if (h > 0) iframe.style.height = h + "px";

  const container = iframe.parentElement;
  if (!container) return;
  const available = container.clientWidth;
  if (!available) return;
  const scale = Math.min(1, available / EMAIL_WIDTH);
  iframe.style.transform = scale < 1 ? `scale(${scale})` : "";
  // The iframe is EMAIL_WIDTH wide and scaled visually, so the container has
  // to be told the post-scale height or it reserves the unscaled space.
  container.style.height = h > 0 ? `${Math.ceil(h * scale)}px` : "";
}

/** Draw the selection on whichever row of the email it belongs to. */
function markSelected(doc: Document | null | undefined, selected: string | null) {
  if (!doc?.body) return;
  doc.querySelectorAll("[data-selected]").forEach((el) => el.removeAttribute("data-selected"));
  if (!selected) return;
  doc.querySelectorAll("[data-section]").forEach((el) => {
    if ((el as HTMLElement).dataset.section === selected) el.setAttribute("data-selected", "");
  });
}

export default function PreviewPanel({
  layoutSignal,
  selected,
  onSelect,
  onDrawn,
  scrollerRef,
}: {
  layoutSignal?: unknown;
  /** The section the panel is showing, outlined here so the two agree. */
  selected?: string | null;
  onSelect?: (section: string | null) => void;
  /**
   * What the email actually drew this time, by section and by field.
   *
   * Whether a thing is in the email is a question only the email can answer,
   * and it answers it for more reasons than the panel could keep a list of: a
   * field can be empty, or hidden, or perfectly full and still not drawn
   * because the band it sits inside needs a date. Reading it back means the
   * panel is never a second opinion about what was rendered.
   */
  onDrawn?: (drawn: { sections: string[]; fields: string[] }) => void;
  /** The column this scrolls in, so selecting a section can bring it into view. */
  scrollerRef?: React.RefObject<HTMLElement>;
} = {}) {
  const { fields, images, community, imagesLoading } = useDraft();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // The message handler below is registered once, so it reads the callback
  // through a ref rather than closing over whichever one it first saw.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onDrawnRef = useRef(onDrawn);
  onDrawnRef.current = onDrawn;

  const reportDrawn = useCallback((doc: Document | null | undefined) => {
    if (!doc?.body) return;
    const sections = new Set<string>();
    doc.querySelectorAll("[data-section]").forEach((el) => {
      const name = (el as HTMLElement).dataset.section;
      if (name) sections.add(name);
    });

    const fields = new Set<string>();
    // A field is here when it has words. The date band tags its date line
    // whether or not there is a date in it, so the tag alone would say a date
    // was drawn when only the time was.
    doc.querySelectorAll("[data-field]").forEach((el) => {
      const name = (el as HTMLElement).dataset.field;
      if (name && el.textContent?.trim()) fields.add(name);
    });
    // Buttons carry no words of the draft's own — the phone number and the
    // website come from the community — so they are counted by being here.
    doc.querySelectorAll("[data-deletefield]").forEach((el) => {
      const name = (el as HTMLElement).dataset.deletefield;
      if (name) fields.add(name);
    });

    onDrawnRef.current?.({ sections: [...sections], fields: [...fields] });
  }, []);

  const html = useMemo(() => {
    if (!fields || !community) return "";
    // A slot whose photo is still downloading gets a plain grey block, so the
    // eblast keeps its real shape and nothing shifts when the photo lands.
    // Preview only — a send always waits for the real photos.
    const stand = (url?: string) => (!url && imagesLoading ? IMAGE_LOADING_PLACEHOLDER : url);
    return buildEblastHtml(fields, community as any, {
      heroImageUrl: stand(images.hero?.url),
      secondaryImageUrl: stand(images.secondary?.url),
      galleryImageUrls: images.gallery.map((g) => stand(g.url) ?? ""),
      forPreview: true,
    });
  }, [fields, images, community, imagesLoading]);

  // srcDoc is set once when the draft first loads, then never changed via
  // React. Later updates go straight into the iframe DOM to avoid reloading.
  const [initSrc, setInitSrc] = useState("");
  const initDone = useRef(false);
  useEffect(() => {
    if (html && !initDone.current) {
      initDone.current = true;
      setInitSrc(html);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!html]);

  const selectedRef = useRef<string | null>(selected ?? null);
  selectedRef.current = selected ?? null;

  // Patch the iframe body in place whenever the html changes (debounced 150ms
  // so fast typing doesn't thrash, but changes appear nearly instantly).
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchIframe = useCallback((newHtml: string) => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body || !iframe || !newHtml) return;
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(newHtml, "text/html");
      doc.body.innerHTML = parsed.body.innerHTML;
      injectScript(doc);
      // The selection lived on a node in the body that was just replaced.
      markSelected(doc, selectedRef.current);
      reportDrawn(doc);
      resizeIframe(iframe);
    } catch {}
  }, [reportDrawn]);

  useEffect(() => {
    if (!initDone.current) return; // don't patch before first load
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = setTimeout(() => patchIframe(html), 150);
    return () => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    };
  }, [html, patchIframe]);

  useEffect(() => {
    function handler(e: MessageEvent) {
      if (!e.data || e.data.type !== "section-click") return;
      onSelectRef.current?.((e.data.section as string | null) ?? null);
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Outline the selected section, and bring it into view when the selection
  // came from somewhere other than a click on the email itself.
  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    markSelected(doc, selected ?? null);
    if (!selected || !doc || !iframe) return;
    const el = doc.querySelector(`[data-section="${selected.replace(/"/g, '\\"')}"]`) as HTMLElement | null;
    const scroller = scrollerRef?.current;
    if (!el || !scroller) return;
    const scale = iframe.getBoundingClientRect().width / (iframe.offsetWidth || EMAIL_WIDTH);
    const top = iframe.offsetTop + el.offsetTop * scale;
    const bottom = top + el.offsetHeight * scale;
    if (top < scroller.scrollTop || bottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTo({ top: Math.max(0, top - 24), behavior: "smooth" });
    }
  }, [selected, scrollerRef]);

  function handleLoad() {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body || !iframe) return;
    resizeIframe(iframe);
    injectScript(doc);
    markSelected(doc, selectedRef.current);
    reportDrawn(doc);

    // A single point-in-time measurement isn't enough: images can still be
    // decoding after this call returns, and every edit replaces every <img>,
    // re-entering that same decode race. Watching doc.body keeps the height
    // continuously accurate instead. doc.body itself survives patchIframe
    // (only its children are replaced), so this attaches once per real load.
    resizeObserverRef.current?.disconnect();
    const ro = new ResizeObserver(() => resizeIframe(iframe));
    ro.observe(doc.body);
    resizeObserverRef.current = ro;
  }

  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

  // Re-scale when the column width changes. Content-height changes are already
  // covered by the ResizeObserver on doc.body in handleLoad. Depends on
  // initSrc: before the first draft loads this renders a placeholder and
  // containerRef is null, so an empty dep array would attach nothing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rescale = () => {
      const iframe = iframeRef.current;
      if (iframe) resizeIframe(iframe);
    };
    const ro = new ResizeObserver(rescale);
    // Watch the column the preview sits in, not just the container: rescale
    // sets the container's own height, and an observer on an element its
    // callback resizes gets its notifications suppressed as a loop.
    ro.observe(container);
    if (container.parentElement) ro.observe(container.parentElement);
    window.addEventListener("resize", rescale);
    rescale();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", rescale);
    };
  }, [initSrc]);

  // Told directly when the surrounding layout changes — opening the flyer
  // beside the preview narrows this column, and the email is a fixed 600px
  // that has to scale down or it is clipped on the right, which is the exact
  // bug this scaling exists to prevent. Measured a few times rather than once:
  // the first read can land before the new widths have settled, and
  // resizeIframe is idempotent so repeating it costs nothing.
  useEffect(() => {
    const timers = [0, 80, 250, 600].map((delay) =>
      setTimeout(() => {
        const iframe = iframeRef.current;
        if (iframe) resizeIframe(iframe);
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [layoutSignal]);

  if (!initSrc) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-[#6A736F]">
        The email will appear here
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/*
        The email is a fixed EMAIL_WIDTH design. The iframe is that width
        exactly and is scaled down when the surrounding column is narrower,
        rather than being given a percentage width — a percentage width inside
        an overflow-hidden box silently cut the right-hand side off.
      */}
      <iframe
        ref={iframeRef}
        srcDoc={initSrc}
        title="Email preview"
        className="bg-white"
        style={{
          width: EMAIL_WIDTH,
          minHeight: 600,
          height: "1200px",
          display: "block",
          // transform is set imperatively by resizeIframe.
          transformOrigin: "top left",
        }}
        sandbox="allow-same-origin allow-scripts"
        onLoad={handleLoad}
        scrolling="no"
      />
    </div>
  );
}
