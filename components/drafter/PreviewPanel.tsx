"use client";

import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useDraft } from "@/context/DraftContext";
import type { EditorSection } from "@/context/DraftContext";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import { buildEblastHtml } from "@/lib/render-email";
import { ColorPickerPopover } from "@/components/drafter/ColorPickerPopover";
import { DeleteConfirmPopover } from "@/components/drafter/DeleteConfirmPopover";

const PREVIEW_SCRIPT = /* javascript */`(function(){
  // Walk from the event target up to <body>, returning the innermost element
  // matching each of the given dataset keys (bgfield/deletefield checked
  // first/innermost since a button's data-bgfield/data-deletefield sits
  // inside its section's).
  function findAncestors(target, keys){
    var found={};
    var el=target;
    while(el&&el!==document.body){
      for(var i=0;i<keys.length;i++){
        var k=keys[i];
        if(!found[k]&&el.dataset&&el.dataset[k]) found[k]=el;
      }
      el=el.parentElement;
    }
    return found;
  }

  // Floating "x" delete button — appended to <body> directly (not inside the
  // hovered element) since some hovered elements are near-zero-height table
  // rows that can't usefully contain an overlay child.
  var delBtn=null;
  function removeDelBtn(){
    if(delBtn){ delBtn.remove(); delBtn=null; }
  }
  function showDelBtn(target){
    if(delBtn && delBtn.__target===target) return;
    removeDelBtn();
    var rect=target.getBoundingClientRect();
    var btn=document.createElement('div');
    btn.textContent='\\u00d7';
    btn.setAttribute('data-delete-btn','1');
    btn.__target=target;
    btn.style.cssText='position:fixed;left:'+(rect.right-24)+'px;top:'+(rect.top+4)+'px;width:20px;height:20px;line-height:19px;text-align:center;background:#b3312c;color:#fff;border-radius:50%;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;cursor:pointer;z-index:99999;box-shadow:0 1px 3px rgba(0,0,0,0.35);user-select:none;';
    btn.addEventListener('mousedown',function(e){ e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      var r=target.getBoundingClientRect();
      window.parent.postMessage({type:'delete-click',field:target.dataset.deletefield,left:r.left,bottom:r.bottom,top:r.top,width:r.width},'*');
      removeDelBtn();
    });
    document.body.appendChild(btn);
    delBtn=btn;
  }

  document.addEventListener('mouseover',function(e){
    if(e.target&&e.target.getAttribute&&e.target.getAttribute('data-delete-btn')==='1') return;
    var found=findAncestors(e.target,['bgfield','deletefield','section']);
    document.querySelectorAll('[data-section],[data-bgfield],[data-deletefield]').forEach(function(s){
      s.style.outline='';s.style.cursor='';s.style.outlineOffset='';
    });
    if(found.deletefield){ showDelBtn(found.deletefield); } else { removeDelBtn(); }
    if(found.bgfield){
      found.bgfield.style.outline='2px dashed rgba(31,69,56,0.55)';
      found.bgfield.style.outlineOffset='-2px';
      found.bgfield.style.cursor='pointer';
    } else if(found.section){
      found.section.style.outline='2px solid rgba(31,69,56,0.35)';
      found.section.style.outlineOffset='0px';
      found.section.style.cursor='pointer';
    }
  },true);

  document.addEventListener('mouseleave',function(){
    document.querySelectorAll('[data-section],[data-bgfield],[data-deletefield]').forEach(function(s){
      s.style.outline='';s.style.cursor='';s.style.outlineOffset='';
    });
    removeDelBtn();
  },true);

  document.addEventListener('click',function(e){
    if(e.target&&e.target.getAttribute&&e.target.getAttribute('data-delete-btn')==='1') return;
    var found=findAncestors(e.target,['bgfield','section']);
    if(found.bgfield){
      e.preventDefault();
      e.stopPropagation();
      var rect=found.bgfield.getBoundingClientRect();
      window.parent.postMessage({type:'bg-click',field:found.bgfield.dataset.bgfield,left:rect.left,bottom:rect.bottom,top:rect.top,width:rect.width},'*');
      return;
    }
    if(found.section){
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({type:'section-click',section:found.section.dataset.section},'*');
    }
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

// Every clickable background field, its human label, and how to compute its
// current effective value (override if set, else the same brand default
// render-email.ts uses). Kept in sync with lib/render-email.ts by hand — the
// header's true default also factors in a light/dark/gray classifier that's
// approximated here as brand.background, same simplification the sidebar
// pickers already use.
type BgFieldKey =
  | "headerBgColor" | "heroBgColor" | "finalCtaBgColor" | "footerBgColor"
  | "ctaButtonBgColor" | "finalCtaButtonBgColor" | "footerButtonBgColor";

const BG_FIELD_LABELS: Record<BgFieldKey, string> = {
  headerBgColor: "Header Background",
  heroBgColor: "Hero Background",
  finalCtaBgColor: "Call-to-Action Background",
  footerBgColor: "Footer Background",
  ctaButtonBgColor: "Call Button Color",
  finalCtaButtonBgColor: "Call Button Color",
  footerButtonBgColor: "Visit Website Button Color",
};

function defaultForBgField(key: BgFieldKey, community: any): string {
  switch (key) {
    case "headerBgColor": return community?.brand.background ?? "#ffffff";
    case "heroBgColor": return community?.brand.primary ?? "#000000";
    case "finalCtaBgColor": return community?.brand.accent ?? "#000000";
    case "footerBgColor": return "#FFFFFF";
    case "ctaButtonBgColor": return community?.brand.accent ?? "#000000";
    case "finalCtaButtonBgColor": return community?.brand.primary ?? "#000000";
    case "footerButtonBgColor": return community?.brand.primary ?? "#000000";
  }
}

// Every hover-delete target — human label for the confirm popover. Header and
// Footer themselves are intentionally absent (never deletable — branding and
// required sender contact info), but the Footer's own website button is.
type DeleteFieldKey =
  | "heroSectionHidden" | "storySectionHidden" | "secondaryImageSectionHidden" | "gallerySectionHidden"
  | "finalCtaSectionHidden" | "ctaButtonHidden" | "finalCtaButtonHidden" | "footerButtonHidden";

const DELETE_FIELD_LABELS: Record<DeleteFieldKey, string> = {
  heroSectionHidden: "the Hero section",
  storySectionHidden: "the Story section",
  secondaryImageSectionHidden: "the secondary image",
  gallerySectionHidden: "the photo gallery",
  finalCtaSectionHidden: "the Call-to-Action section",
  ctaButtonHidden: "the hero's call button",
  finalCtaButtonHidden: "the bottom call button",
  footerButtonHidden: "the Visit Website button",
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
  const { setActiveSection, fields, setField, images, community } = useDraft();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [bgPopover, setBgPopover] = useState<{ field: BgFieldKey; left: number; top: number } | null>(null);
  const [deletePopover, setDeletePopover] = useState<{ field: DeleteFieldKey; left: number; top: number } | null>(null);

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

  // Handle section-click and bg-click messages from the iframe. bg-click opens
  // the same color picker used in the sidebar, anchored under the clicked
  // element — clicking a section/button background edits its color directly
  // instead of just switching tabs.
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (!e.data) return;
      if (e.data.type === "section-click") {
        const section = SECTION_MAP[e.data.section as string];
        if (section) setActiveSection(section);
        return;
      }
      if (e.data.type === "bg-click") {
        const iframeRect = iframeRef.current?.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!iframeRect || !containerRect) return;
        setBgPopover({
          field: e.data.field as BgFieldKey,
          left: iframeRect.left - containerRect.left + (e.data.left as number),
          top: iframeRect.top - containerRect.top + (e.data.bottom as number),
        });
        return;
      }
      if (e.data.type === "delete-click") {
        const iframeRect = iframeRef.current?.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!iframeRect || !containerRect) return;
        setDeletePopover({
          field: e.data.field as DeleteFieldKey,
          left: iframeRect.left - containerRect.left + (e.data.left as number),
          top: iframeRect.top - containerRect.top + (e.data.bottom as number),
        });
      }
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

  const brandColors = community
    ? ([community.brand.primary, community.brand.accent, community.brand.background, community.brand.secondary, ...(community.brand.supporting ?? [])].filter(Boolean) as string[])
    : [];

  return (
    <div ref={containerRef} className="relative">
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

      {bgPopover && (
        <>
          {/* Click-outside-to-close backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setBgPopover(null)} />
          <div className="absolute z-40" style={{ left: bgPopover.left, top: bgPopover.top + 4 }}>
            <ColorPickerPopover
              brandColors={brandColors}
              currentValue={(fields && (fields as any)[bgPopover.field]) ?? defaultForBgField(bgPopover.field, community)}
              currentLabel={BG_FIELD_LABELS[bgPopover.field]}
              onPick={(hex) => setField(bgPopover.field as keyof ExtractedFlyer, hex as never)}
              onReset={
                fields?.[bgPopover.field]
                  ? () => setField(bgPopover.field as keyof ExtractedFlyer, undefined as never)
                  : undefined
              }
              resetLabel={`Reset ${BG_FIELD_LABELS[bgPopover.field]} to default`}
              onClose={() => setBgPopover(null)}
            />
          </div>
        </>
      )}

      {deletePopover && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setDeletePopover(null)} />
          <div className="absolute z-40" style={{ left: deletePopover.left, top: deletePopover.top + 4 }}>
            <DeleteConfirmPopover
              label={DELETE_FIELD_LABELS[deletePopover.field]}
              onConfirm={() => {
                setField(deletePopover.field as keyof ExtractedFlyer, true as never);
                setDeletePopover(null);
              }}
              onCancel={() => setDeletePopover(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
