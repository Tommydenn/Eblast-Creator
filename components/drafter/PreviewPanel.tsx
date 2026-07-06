"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { useDraft } from "@/context/DraftContext";
import type { EditorSection } from "@/context/DraftContext";

// Minimal script injected into the preview iframe.
// ONLY purpose: highlight sections on hover and send a single message when
// the user clicks a section. No editing happens here.
const PREVIEW_SCRIPT = /* javascript */`(function(){
  var lastSection = null;
  var overlay = document.createElement('div');
  overlay.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:9999;';
  document.body.appendChild(overlay);

  function clearHighlight(){
    document.querySelectorAll('[data-section]').forEach(function(el){
      el.style.outline='';
      el.style.cursor='';
    });
  }

  document.addEventListener('mouseover',function(e){
    var el=e.target;
    while(el&&el!==document.body){
      if(el.dataset&&el.dataset.section){ break; }
      el=el.parentElement;
    }
    if(!el||el===document.body) return;
    clearHighlight();
    el.style.outline='2px solid rgba(31,69,56,0.35)';
    el.style.outlineOffset='0px';
    el.style.cursor='pointer';
    lastSection=el.dataset.section;
  },true);

  document.addEventListener('mouseleave',function(){ clearHighlight(); lastSection=null; },true);

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

export default function PreviewPanel() {
  const { buildHtml, setActiveSection, fields, images, community } = useDraft();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // fields/images/community are real state — they trigger re-renders and
  // thus re-run this memo. buildHtml reads from refs for synchronous access,
  // so we just need these state values as the dependency signal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(), [buildHtml, fields, images, community]);

  // Handle section-click messages from the preview iframe
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (!e.data || e.data.type !== "section-click") return;
      const section = SECTION_MAP[e.data.section as string];
      if (section) setActiveSection(section);
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [setActiveSection]);

  // Inject the hover/click script after each load
  function handleLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    if (doc.body.querySelector('script[data-preview-script]')) return;
    const s = doc.createElement("script");
    s.setAttribute("data-preview-script", "1");
    s.textContent = PREVIEW_SCRIPT;
    doc.body.appendChild(s);
  }

  if (!html) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[#9aaba4]">
        Preview will appear here
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title="Email preview"
      className="w-full bg-white"
      style={{ minHeight: 800, height: "auto", display: "block" }}
      sandbox="allow-same-origin allow-scripts"
      onLoad={handleLoad}
      scrolling="no"
    />
  );
}
