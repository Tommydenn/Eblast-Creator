"use client";

import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useDraft } from "@/context/DraftContext";
import type { EditorSection } from "@/context/DraftContext";
import { buildEblastHtml } from "@/lib/render-email";

const PREVIEW_SCRIPT = /* javascript */`(function(){
  document.addEventListener('mouseover',function(e){
    var el=e.target;
    while(el&&el!==document.body){
      if(el.dataset&&el.dataset.section){ break; }
      el=el.parentElement;
    }
    if(!el||el===document.body) return;
    document.querySelectorAll('[data-section]').forEach(function(s){
      s.style.outline='';s.style.cursor='';
    });
    el.style.outline='2px solid rgba(31,69,56,0.35)';
    el.style.outlineOffset='0px';
    el.style.cursor='pointer';
  },true);

  document.addEventListener('mouseleave',function(){
    document.querySelectorAll('[data-section]').forEach(function(s){s.style.outline='';s.style.cursor='';});
  },true);

  document.addEventListener('click',function(e){
    var el=e.target;
    while(el&&el!==document.body){
      if(el.dataset&&el.dataset.section){ break; }
      el=el.parentElement;
    }
    if(!el||el===document.body) return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({type:'section-click',section:el.dataset.section},'*');
  },true);
})();`;

const SECTION_MAP: Record<string, EditorSection> = {
  "Header": "hero",
  "Hero": "hero",
  "Story": "story",
  "Secondary Image": "story",
  "Photo Gallery": "images",
  "Call to Action": "cta",
  "Footer": "cta",
};

function injectScript(doc: Document) {
  if (doc.body.querySelector("[data-preview-script]")) return;
  const s = doc.createElement("script");
  s.setAttribute("data-preview-script", "1");
  s.textContent = PREVIEW_SCRIPT;
  doc.body.appendChild(s);
}

function resizeIframe(iframe: HTMLIFrameElement) {
  const doc = iframe.contentDocument;
  if (!doc?.body) return;
  const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
  if (h > 0) iframe.style.height = h + "px";
}

export default function PreviewPanel() {
  const { setActiveSection, fields, images, community } = useDraft();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const html = useMemo(() => {
    if (!fields || !community) return "";
    return buildEblastHtml(fields, community as any, {
      heroImageUrl: images.hero?.url,
      secondaryImageUrl: images.secondary?.url,
      galleryImageUrls: images.gallery.map((g) => g.url),
    });
  }, [fields, images, community]);

  // srcDoc is set once when the draft first loads, then never changed via React.
  // Subsequent updates go directly into the iframe DOM to avoid reload flicker.
  const [initSrc, setInitSrc] = useState("");
  const initDone = useRef(false);
  useEffect(() => {
    if (html && !initDone.current) {
      initDone.current = true;
      setInitSrc(html);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!html]);

  // Patch the iframe body in-place whenever html changes (debounced 150ms so
  // fast typing doesn't thrash, but changes appear nearly instantly).
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
      resizeIframe(iframe);
    } catch {}
  }, []);

  useEffect(() => {
    if (!initDone.current) return; // don't patch before first load
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = setTimeout(() => patchIframe(html), 150);
    return () => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    };
  }, [html, patchIframe]);

  // Handle section-click messages from the iframe
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (!e.data || e.data.type !== "section-click") return;
      const section = SECTION_MAP[e.data.section as string];
      if (section) setActiveSection(section);
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [setActiveSection]);

  function handleLoad() {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body || !iframe) return;
    resizeIframe(iframe);
    injectScript(doc);
  }

  if (!initSrc) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[#9aaba4]">
        Preview will appear here
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={initSrc}
      title="Email preview"
      className="w-full bg-white"
      style={{ minHeight: 600, height: "1200px", display: "block" }}
      sandbox="allow-same-origin allow-scripts"
      onLoad={handleLoad}
      scrolling="no"
    />
  );
}
