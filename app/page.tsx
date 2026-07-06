"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { CommunityIntelligence } from "@/components/CommunityIntelligence";
import { IntelligenceApplied } from "@/components/IntelligenceApplied";
import { SubjectSpecialistPanel } from "@/components/SubjectSpecialistPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Label, Select, Textarea } from "@/components/ui/Input";
import {
  useDraft,
  type ReviewVerdict,
} from "@/context/DraftContext";

// ─── Interactive preview script ───────────────────────────────────────────────
// Injected into the iframe after load. Adds floating section labels on hover
// and makes data-field elements editable on click, posting changes back via
// window.parent.postMessage({ type: 'eblast-field-edit', field, value }).

const EBLAST_EDIT_SCRIPT = `(function(){
  var lb=document.createElement('div');
  lb.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.85);color:#fff;font:700 10px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:9999;white-space:nowrap;';
  document.body.appendChild(lb);
  function labelFor(t){
    if(!t||!t.closest) return null;
    var im=t.closest('[data-img-label]');
    if(im) return im.getAttribute('data-img-label');
    var sec=t.closest('[data-section]');
    if(sec) return sec.getAttribute('data-section');
    return null;
  }
  document.addEventListener('mouseover',function(e){
    var name=labelFor(e.target);
    if(name){ lb.textContent=name; lb.style.opacity='1'; } else { lb.style.opacity='0'; }
  });
  document.addEventListener('mouseout',function(e){
    if(!labelFor(e.relatedTarget)) lb.style.opacity='0';
  });
  document.querySelectorAll('[data-img-label]').forEach(function(im){
    im.style.cursor='pointer';
    im.addEventListener('mouseenter',function(){ im.style.outline='2px solid rgba(59,130,246,0.6)'; im.style.outlineOffset='2px'; });
    im.addEventListener('mouseleave',function(){ im.style.outline=''; });
    im.addEventListener('click',function(e){ e.stopPropagation(); window.parent.postMessage({type:'eblast-image-select',label:im.getAttribute('data-img-label')},'*'); });
  });
  function finish(el){
    if(el.contentEditable!=='true') return;
    el.contentEditable='false'; el.style.outline=''; el.style.cursor='pointer';
    window.parent.postMessage({type:'eblast-field-edit',field:el.getAttribute('data-field'),value:el.innerText.trim(),html:el.innerHTML},'*');
  }
  function stopAll(except){
    document.querySelectorAll('[data-field][contenteditable="true"]').forEach(function(o){ if(o!==except) finish(o); });
  }
  document.querySelectorAll('[data-field]').forEach(function(el){
    el.style.cursor='pointer';
    el.addEventListener('mouseenter',function(){ if(el.contentEditable!=='true'){ el.style.outline='1px dashed rgba(59,130,246,0.45)'; el.style.outlineOffset='3px'; } });
    el.addEventListener('mouseleave',function(){ if(el.contentEditable!=='true') el.style.outline=''; });
    // Activate on mousedown so the browser can place the cursor where the user clicked.
    el.addEventListener('mousedown',function(e){
      if(e.target&&(e.target.closest('[data-img-label]')||e.target.tagName==='IMG')) return;
      if(el.contentEditable==='true') return;
      stopAll(el);
      el.contentEditable='true'; el.style.outline='2px solid #3b82f6'; el.style.outlineOffset='2px'; el.style.cursor='text';
    });
    el.addEventListener('click',function(e){
      if(e.target&&(e.target.closest('[data-img-label]')||e.target.tagName==='IMG')) return;
      e.stopPropagation(); el.focus({preventScroll:true});
    });
    el.addEventListener('blur',function(){ finish(el); });
    el.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){
        if(el.getAttribute('data-field')==='bodyParagraphs') return;
        e.preventDefault(); el.blur();
      }
      if(e.key==='Escape'){ el.contentEditable='false'; el.style.outline=''; el.blur(); }
    });
  });
  document.addEventListener('click',function(){ stopAll(null); });
  // Make non-data-field text elements editable (full HTML sync on blur).
  document.querySelectorAll('p,h1,h2,h3').forEach(function(el){
    if(el.getAttribute('data-field')) return;
    if(el.closest('a')) return;
    var txt=el.textContent.trim();
    if(!txt||el.style.maxHeight==='0px'||el.style.fontSize==='1px') return;
    el.style.cursor='pointer';
    el.addEventListener('mouseenter',function(){
      if(el.contentEditable!=='true'){el.style.outline='1px dashed rgba(59,130,246,0.3)';el.style.outlineOffset='3px';}
    });
    el.addEventListener('mouseleave',function(){
      if(el.contentEditable!=='true') el.style.outline='';
    });
    // Activate on mousedown so the browser places the cursor at the exact click position.
    el.addEventListener('mousedown',function(e){
      if(e.target&&(e.target.closest('[data-img-label]')||e.target.tagName==='IMG')) return;
      if(el.contentEditable==='true') return;
      el.contentEditable='true';
      el.style.outline='2px solid #3b82f6';el.style.outlineOffset='2px';el.style.cursor='text';
    });
    el.addEventListener('click',function(e){
      if(e.target&&(e.target.closest('[data-img-label]')||e.target.tagName==='IMG')) return;
      e.stopPropagation(); el.focus({preventScroll:true});
    });
    el.addEventListener('blur',function(){
      if(el.contentEditable!=='true') return;
      el.contentEditable='false';el.style.outline='';el.style.cursor='pointer';
      (function(){
        var hmsg={type:'eblast-html-edit'};
        try{
          var fe=el;
          while(fe&&fe!==document.body){if(fe.dataset&&fe.dataset.field)break;fe=fe.parentNode;}
          if(fe&&fe.dataset&&fe.dataset.field){hmsg.field=fe.dataset.field;hmsg.html=fe.innerHTML;}
        }catch(ex){}
        window.parent.postMessage(hmsg,'*');
      })();
    });
    el.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();el.blur();}
      if(e.key==='Escape'){el.contentEditable='false';el.style.outline='';el.blur();}
    });
  });
  // Track the last selected data-field element and range for cross-frame formatting.
  var _fmtEl=null,_fmtRange=null,_undoStack=[],_redoStack=[];
  document.addEventListener('selectionchange',function(){
    var sel=window.getSelection();
    if(!sel||sel.rangeCount===0) return;
    var r=sel.getRangeAt(0);
    var n=r.commonAncestorContainer;
    var el=n.nodeType===1?n:n.parentElement;
    // Walk up to find any editable element (data-field OR catch-all contenteditable).
    while(el&&el.contentEditable!=='true'&&!el.getAttribute('data-field')) el=el.parentElement;
    if(el){_fmtEl=el;try{_fmtRange=r.cloneRange();}catch(ex){}}
  });
  // Receive position-control messages from the parent frame.
  window.addEventListener('message',function(e){
    if(!e.data) return;
    if(e.data.type==='eblast-format'){
      var cmd=e.data.command;
      // Custom undo/redo — avoids execCommand('undo') reverting contentEditable mutations.
      if(cmd==='undo'){
        if(_undoStack.length>0){var su=_undoStack.pop();if(su.el.isConnected){_redoStack.push({el:su.el,html:su.el.innerHTML});su.el.innerHTML=su.html;}}
        (function(){var fmsg={type:'eblast-format-done'};try{if(_fmtEl&&_fmtEl.dataset&&_fmtEl.dataset.field){fmsg.field=_fmtEl.dataset.field;fmsg.html=_fmtEl.innerHTML;}}catch(ex){}window.parent.postMessage(fmsg,'*');})();
      } else if(cmd==='redo'){
        if(_redoStack.length>0){var sr=_redoStack.pop();if(sr.el.isConnected){_undoStack.push({el:sr.el,html:sr.el.innerHTML});sr.el.innerHTML=sr.html;}}
        (function(){var fmsg={type:'eblast-format-done'};try{if(_fmtEl&&_fmtEl.dataset&&_fmtEl.dataset.field){fmsg.field=_fmtEl.dataset.field;fmsg.html=_fmtEl.innerHTML;}}catch(ex){}window.parent.postMessage(fmsg,'*');})();
      } else {
        // Save snapshot before applying format so undo can restore it.
        if(_fmtEl){_undoStack.push({el:_fmtEl,html:_fmtEl.innerHTML});if(_undoStack.length>50)_undoStack.shift();_redoStack=[];}
        if(_fmtEl&&_fmtEl.contentEditable!=='true'){_fmtEl.contentEditable='true';_fmtEl.focus({preventScroll:true});}
        if(_fmtRange){var sel=window.getSelection();sel.removeAllRanges();try{sel.addRange(_fmtRange);}catch(ex){}}
        document.execCommand(cmd,false,e.data.value||null);
        var s2=window.getSelection();
        if(s2&&s2.rangeCount>0){try{_fmtRange=s2.getRangeAt(0).cloneRange();}catch(ex){}}
        (function(){var fmsg={type:'eblast-format-done'};try{var sel2=window.getSelection();if(sel2&&sel2.anchorNode){var node=sel2.anchorNode.nodeType===1?sel2.anchorNode:sel2.anchorNode.parentNode;while(node&&node!==document.body){if(node.dataset&&node.dataset.field)break;node=node.parentNode;}if(node&&node.dataset&&node.dataset.field){fmsg.field=node.dataset.field;fmsg.html=node.innerHTML;}}}catch(ex){}window.parent.postMessage(fmsg,'*');})();
      }
    }
    if(e.data.type==='eblast-show-original'){
      var imgEl=document.querySelector('[data-img-label="'+e.data.label+'"]');
      if(!imgEl) return;
      var cw=parseInt(imgEl.getAttribute('width'))||imgEl.offsetWidth||600;
      var ch=parseInt(imgEl.getAttribute('height'))||imgEl.offsetHeight||400;
      var lbl=e.data.label, xPos=e.data.x, yPos=e.data.y, src=e.data.src;
      // Load image to get natural dimensions for correct background-size scaling.
      // CSS background-image can load cross-origin images without CORS — do NOT use
      // Canvas here (canvas.toDataURL throws SecurityError on cross-origin images).
      var tmp=new Image();
      tmp.onload=function(){
        var nw=tmp.naturalWidth||800, nh=tmp.naturalHeight||600;
        var MARGIN=0.12;
        var scaleX=(cw/nw)*(1+MARGIN), scaleY=(ch/nh)*(1+MARGIN);
        var scale=Math.max(scaleX,scaleY);
        var bgWn=Math.round(nw*scale), bgHn=Math.round(nh*scale);
        var div=document.createElement('div');
        div.setAttribute('data-img-label',lbl);
        div.setAttribute('data-repo-div','1');
        div.style.cssText='display:inline-block;width:'+cw+'px;height:'+ch+'px;'+
          'background-image:url("'+src+'");'+
          'background-size:'+bgWn+'px '+bgHn+'px;'+
          'background-repeat:no-repeat;'+
          'background-position:'+xPos+'% '+yPos+'%;'+
          'cursor:pointer;vertical-align:top;';
        imgEl.parentNode.replaceChild(div,imgEl);
        div.addEventListener('click',function(ev){
          ev.stopPropagation();
          window.parent.postMessage({type:'eblast-image-select',label:lbl},'*');
        });
      };
      tmp.src=src;
    }
    if(e.data.type==='eblast-restore-fields'){
      var flds=e.data.fields;
      if(!flds) return;
      // Build catch-all element list (same filter as captureTextEdits).
      var caEls=[];
      document.querySelectorAll('p,h1,h2,h3').forEach(function(el){
        if(el.getAttribute('data-field')) return;
        if(el.closest('a')) return;
        var txt=el.textContent&&el.textContent.trim();
        if(!txt||el.style.maxHeight==='0px'||el.style.fontSize==='1px') return;
        caEls.push(el);
      });
      Object.keys(flds).forEach(function(k){
        if(k.indexOf('field:')===0){
          var fe=document.querySelector('[data-field="'+k.slice(6)+'"]');
          if(fe) fe.innerHTML=flds[k];
        } else if(k.indexOf('catchall:')===0){
          var ci=parseInt(k.slice(9),10);
          if(caEls[ci]) caEls[ci].innerHTML=flds[k];
        }
      });
      return;
    }
    if(e.data.type==='eblast-reposition'){
      var el=document.querySelector('[data-img-label="'+e.data.label+'"][data-repo-div]');
      if(el) el.style.backgroundPosition=e.data.x+'% '+e.data.y+'%';
    }
  });
})();`;

// ─── Display maps ─────────────────────────────────────────────────────────────

// Keys must match ReviewVerdict values from lib/critic.ts.
const verdictBadge: Record<ReviewVerdict, { label: string; variant: "success" | "warning" | "danger" }> = {
  ready: { label: "Ready to send", variant: "success" },
  needs_revision: { label: "Needs revision", variant: "warning" },
  blocking_issues: { label: "Blocking issues", variant: "danger" },
};


// ─── Image Bank Panel ─────────────────────────────────────────────────────────

// ─── Placed Images Panel ──────────────────────────────────────────────────────

function PlacedImagesPanel({
  heroImageUrl,
  secondaryImageUrl,
  galleryImageUrls,
  onRemove,
}: {
  heroImageUrl?: string;
  secondaryImageUrl?: string;
  galleryImageUrls: string[];
  onRemove: (slot: 'hero' | 'secondary' | 'gallery', galleryIdx?: number) => Promise<void>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const hasAny = heroImageUrl || secondaryImageUrl || galleryImageUrls.length > 0;
  if (!hasAny) return null;

  async function handleRemove(slot: 'hero' | 'secondary' | 'gallery', galleryIdx?: number) {
    const key = slot === 'gallery' ? `gallery-${galleryIdx}` : slot;
    setRemoving(key);
    await onRemove(slot, galleryIdx);
    setRemoving(null);
  }

  const TRASH = (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5l.5-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="rounded-md border border-sand-200 bg-white">
      <div className="border-b border-sand-100 px-3.5 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sand-500">Placed images</span>
      </div>
      <div className="divide-y divide-sand-100">
        {heroImageUrl && (
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="h-9 w-14 shrink-0 overflow-hidden rounded border border-sand-200 bg-sand-100">
              <img src={heroImageUrl} alt="Hero" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sand-800">Hero</p>
              <p className="text-[10px] text-sand-400">Top banner image</p>
            </div>
            <button
              onClick={() => handleRemove('hero')}
              disabled={removing === 'hero'}
              title="Remove hero image"
              className="shrink-0 rounded p-1.5 text-sand-400 transition-colors hover:bg-clay-50 hover:text-clay-600 disabled:opacity-40"
            >
              {TRASH}
            </button>
          </div>
        )}
        {secondaryImageUrl && (
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="h-9 w-14 shrink-0 overflow-hidden rounded border border-sand-200 bg-sand-100">
              <img src={secondaryImageUrl} alt="Secondary" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sand-800">Secondary</p>
              <p className="text-[10px] text-sand-400">Inline story image</p>
            </div>
            <button
              onClick={() => handleRemove('secondary')}
              disabled={removing === 'secondary'}
              title="Remove secondary image"
              className="shrink-0 rounded p-1.5 text-sand-400 transition-colors hover:bg-clay-50 hover:text-clay-600 disabled:opacity-40"
            >
              {TRASH}
            </button>
          </div>
        )}
        {galleryImageUrls.length > 0 && (
          <div className="px-3.5 py-2.5">
            <p className="mb-2 text-xs font-medium text-sand-800">
              Gallery <span className="font-normal text-sand-400">({galleryImageUrls.length} image{galleryImageUrls.length === 1 ? "" : "s"})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {galleryImageUrls.map((url, idx) => (
                <div key={idx} className="group relative h-14 w-[72px] overflow-hidden rounded border border-sand-200 bg-sand-100">
                  <img src={url} alt={`Gallery ${idx + 1}`} className="h-full w-full object-cover" />
                  <button
                    onClick={() => handleRemove('gallery', idx)}
                    disabled={removing === `gallery-${idx}`}
                    title={`Remove gallery image ${idx + 1}`}
                    className="absolute inset-0 flex items-center justify-center bg-white/0 transition-all group-hover:bg-white/60 disabled:opacity-40"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[11px] text-clay-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                      ×
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Image Bank Panel ─────────────────────────────────────────────────────────

function ImageBankPanel({
  imageUrls,
  onSwap,
  onAddImage,
}: {
  imageUrls: string[];
  onSwap: (slot: 'hero' | 'secondary' | 'gallery', url: string) => void;
  onAddImage: (dataUri: string) => void;
}) {
  const [swapping, setSwapping] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSwap(slot: 'hero' | 'secondary' | 'gallery', url: string, i: number) {
    setSwapping(i);
    await onSwap(slot, url);
    setSwapping(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onAddImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <details className="rounded-md border border-sand-200 bg-sand-50/60" open={imageUrls.length === 0}>
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sand-600">Image bank</span>
        <span className="text-[11px] text-sand-500">{imageUrls.length} image{imageUrls.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="border-t border-sand-200 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileSelect}
        />
        {imageUrls.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <p className="text-[11px] text-sand-400">No images extracted from PDF</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded border border-sand-300 bg-white px-3 py-1.5 text-[11px] font-medium text-sand-600 transition-colors hover:border-clay-300 hover:text-clay-700"
            >
              Upload image
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {imageUrls.map((url, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div
                    className="relative overflow-hidden rounded border border-sand-200 bg-sand-100"
                    style={{ aspectRatio: '4/3' }}
                  >
                    <img src={url} alt={`Image ${i + 1}`} className="h-full w-full object-cover" />
                    {swapping === i && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <span className="text-[10px] text-sand-500">Placing…</span>
                      </div>
                    )}
                  </div>
                  <select
                    value=""
                    disabled={swapping === i}
                    onChange={(e) => {
                      const slot = e.target.value as 'hero' | 'secondary' | 'gallery';
                      if (!slot) return;
                      handleSwap(slot, url, i);
                      e.currentTarget.value = '';
                    }}
                    className="w-full rounded border border-sand-200 bg-white px-1 py-[3px] text-[9px] text-sand-600 transition-colors hover:border-clay-300 focus:outline-none disabled:opacity-40 cursor-pointer"
                  >
                    <option value="">Place image…</option>
                    <option value="hero">Set as Hero</option>
                    <option value="secondary">Set as Secondary</option>
                    <option value="gallery">Add to Gallery</option>
                  </select>
                </div>
              ))}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded border border-dashed border-sand-300 py-1.5 text-[11px] text-sand-400 transition-colors hover:border-clay-300 hover:text-clay-600"
            >
              + Upload image
            </button>
          </>
        )}
      </div>
    </details>
  );
}

// ─── Formatting Toolbar ───────────────────────────────────────────────────────

type BrandColor = { label: string; color: string };

function ColorPickerPopover({
  enabled,
  brandColors,
  onColor,
}: {
  enabled: boolean;
  brandColors: BrandColor[];
  onColor: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'brand' | 'custom'>('brand');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [hasEyeDropper, setHasEyeDropper] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasEyeDropper('EyeDropper' in window);
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function applyColor(color: string) {
    setSelectedColor(color);
    onColor(color);
    setOpen(false);
  }

  async function pickFromScreen() {
    setOpen(false);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await new (window as any).EyeDropper().open();
      applyColor(result.sRGBHex);
    } catch { /* user cancelled */ }
  }

  const btnBase = 'rounded border border-sand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sand-700 transition-colors hover:border-sand-300 hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={!enabled}
        onClick={() => setOpen((o) => !o)}
        className={`${btnBase} flex items-center gap-1.5`}
        title="Text color"
      >
        <span>Color</span>
        <span className="h-4 w-4 rounded border border-sand-300" style={{ background: selectedColor }} />
        <svg viewBox="0 0 8 5" className="h-2 w-2 fill-sand-400"><path d="M0 0l4 5 4-5z" /></svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-sand-200 bg-white p-3 shadow-lg">
          <div className="mb-2.5 flex gap-3 border-b border-sand-100 pb-2">
            <button type="button" onClick={() => setTab('brand')} className={`text-[11px] font-medium transition-colors ${tab === 'brand' ? 'text-sand-900' : 'text-sand-400 hover:text-sand-600'}`}>Brand colors</button>
            <button type="button" onClick={() => setTab('custom')} className={`text-[11px] font-medium transition-colors ${tab === 'custom' ? 'text-sand-900' : 'text-sand-400 hover:text-sand-600'}`}>Custom</button>
          </div>

          {tab === 'brand' && (
            brandColors.length === 0
              ? <p className="text-[11px] text-sand-400">Select a community to see its colors.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {brandColors.map((bc) => (
                    <button
                      key={bc.color + bc.label}
                      type="button"
                      title={`${bc.label}: ${bc.color}`}
                      onClick={() => applyColor(bc.color)}
                      className="group relative h-8 w-8 rounded border-2 border-transparent transition-all hover:scale-110 hover:border-sand-400"
                      style={{ background: bc.color }}
                    >
                      <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-sand-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 group-hover:opacity-100 transition-opacity">{bc.label}</span>
                    </button>
                  ))}
                </div>
              )
          )}

          {tab === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-sand-200 p-0.5"
              />
              <button type="button" onClick={() => applyColor(selectedColor)} className={btnBase}>Apply</button>
            </div>
          )}

          {hasEyeDropper && (
            <button
              type="button"
              onClick={pickFromScreen}
              className="mt-2.5 flex w-full items-center gap-2 rounded border border-sand-200 px-2.5 py-1.5 text-[11px] text-sand-600 transition-colors hover:border-sand-300 hover:bg-sand-50"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M11.5 1.5l3 3L7 12l-1.5.5.5-1.5 6-9z" />
                <path d="M9.5 3.5l3 3" />
                <path d="M2 14l2-2 1 1-2 2-1-1z" />
              </svg>
              Pick color from email
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FormattingToolbar({
  iframeRef,
  enabled,
  community,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  enabled: boolean;
  community?: { brand: { primary: string; accent: string; background: string; fontHeadline?: string; fontBody?: string; secondary?: string; supporting?: string[] } } | null;
}) {
  function send(command: string, value?: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'eblast-format', command, value: value ?? null },
      '*',
    );
  }

  const btn = 'rounded border border-sand-200 bg-white px-2.5 py-1.5 text-sm font-medium text-sand-700 transition-colors hover:border-sand-300 hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-40';

  // Community fonts first, then email-safe fallbacks.
  const communityFonts: Array<{ label: string; value: string }> = [];
  if (community?.brand.fontHeadline) communityFonts.push({ label: `${community.brand.fontHeadline} — Headline`, value: community.brand.fontHeadline });
  if (community?.brand.fontBody && community.brand.fontBody !== community.brand.fontHeadline) communityFonts.push({ label: `${community.brand.fontBody} — Body`, value: community.brand.fontBody });

  const standardFonts = [
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
    { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
    { label: 'Courier New', value: "'Courier New', monospace" },
  ];

  // Brand color palette from selected community.
  const brandColors: BrandColor[] = [];
  if (community?.brand) {
    const b = community.brand;
    if (b.primary) brandColors.push({ label: 'Primary', color: b.primary });
    if (b.accent) brandColors.push({ label: 'Accent', color: b.accent });
    if (b.background) brandColors.push({ label: 'Background', color: b.background });
    if (b.secondary) brandColors.push({ label: 'Secondary', color: b.secondary });
    (b.supporting ?? []).forEach((c, i) => brandColors.push({ label: `Supporting ${i + 1}`, color: c }));
  }

  return (
    <div className="border-t border-sand-200 bg-sand-50/50 px-4 py-3">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sand-500">
        Text formatting — click any text in the preview, select it, then apply
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button disabled={!enabled} onClick={() => send('undo')} className={btn} title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7H10a3 3 0 0 1 0 6H7"/><path d="M3 7l3-3-3-3"/></svg>
          </button>
          <button disabled={!enabled} onClick={() => send('redo')} className={btn} title="Redo (Ctrl+Y)">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 7H6a3 3 0 0 0 0 6h3"/><path d="M13 7l-3-3 3-3"/></svg>
          </button>
        </div>

        <div className="mx-2 h-5 w-px bg-sand-200/80 self-center" />

        <div className="flex items-center gap-1">
          <button disabled={!enabled} onClick={() => send('bold')} className={btn} style={{ fontWeight: 700 }} title="Bold">B</button>
          <button disabled={!enabled} onClick={() => send('italic')} className={btn} style={{ fontStyle: 'italic' }} title="Italic">I</button>
          <button disabled={!enabled} onClick={() => send('underline')} className={btn + ' underline'} title="Underline">U</button>
        </div>

        <div className="mx-2 h-5 w-px bg-sand-200/80 self-center" />

        <select
          disabled={!enabled}
          defaultValue=""
          onChange={(e) => { if (e.target.value) { send('fontName', e.target.value); e.target.value = ''; } }}
          className="rounded border border-sand-200 bg-white px-2 py-1.5 text-xs text-sand-700 focus:outline-none disabled:opacity-40 cursor-pointer"
        >
          <option value="">Font…</option>
          {communityFonts.length > 0 && (
            <optgroup label="Community fonts">
              {communityFonts.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
          )}
          <optgroup label="Standard">
            {standardFonts.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </optgroup>
        </select>

        <select
          disabled={!enabled}
          defaultValue=""
          onChange={(e) => { if (e.target.value) { send('fontSize', e.target.value); e.target.value = ''; } }}
          className="rounded border border-sand-200 bg-white px-2 py-1.5 text-xs text-sand-700 focus:outline-none disabled:opacity-40 cursor-pointer"
        >
          <option value="">Size…</option>
          <option value="1">Extra small</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Large</option>
          <option value="5">X-Large</option>
          <option value="6">XX-Large</option>
        </select>

        <div className="mx-2 h-5 w-px bg-sand-200/80 self-center" />

        <ColorPickerPopover enabled={enabled} brandColors={brandColors} onColor={(color) => send('foreColor', color)} />

        <div className="mx-2 h-5 w-px bg-sand-200/80 self-center" />

        <button
          disabled={!enabled}
          onClick={() => send('removeFormat')}
          className={btn + ' text-xs text-clay-600 hover:text-clay-800 hover:border-clay-200 hover:bg-clay-50/40'}
        >
          Clear formatting
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const {
    communities, selectedSlug, setSelectedSlug,
    pdf,
    stage,
    extracted, html,
    heroImageUrl, secondaryImageUrl, galleryImageUrls, imageCount,
    refineInput, setRefineInput,
    refineHistory,
    review, reviewing, reviewError,
    agentLoop,
    pushResult, error,
    pastSendsContext, subjectSpecialist,
    duplicateWarning,
    currentDraftSaved, currentDraftId, saveNotice,
    htmlDirty, syncHtml, mergeFieldOverrides, updateHtml, swapSubjectLine,
    allExtractedImageUrls, swapImage, repositionImage, removeImage, addToImageBank,
    heroOriginalUrl, secondaryOriginalUrl, galleryOriginalUrls,
    handleFileChange, clearInputs,
    generateDraft, cancelGeneration,
    refineDraft, undoRefine, redoRefine, canUndoRefine, canRedoRefine, lastRefineInstruction, redoRefineInstruction,
    saveDraft, discardDraft,
    pushDraft,
    dismissDuplicateWarning,
  } = useDraft();

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Read current iframe HTML then save — avoids stale `html` state from context.
  function handleSaveDraft() {
    const iframeHtml = iframeRef.current?.contentDocument?.documentElement.outerHTML;
    saveDraft(iframeHtml);
  }

  // Re-render from the template while preserving all field edits.
  // Reading the iframe DOM directly captures any in-progress edits that haven't fired
  // eblast-field-edit yet (e.g. an active field not yet blurred), then syncHtml regenerates
  // clean HTML — avoiding double-script injection caused by capturing documentElement.outerHTML.
  async function handleSyncPreview() {
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const fresh: Record<string, string> = {};
      doc.querySelectorAll('[data-field]').forEach((el) => {
        const k = el.getAttribute('data-field');
        if (k) fresh[k] = el.innerHTML;
      });
      if (Object.keys(fresh).length > 0) mergeFieldOverrides(fresh);
    }
    await syncHtml();
  }
  const [reviewerOpen, setReviewerOpen] = useState(true);
  const [confirmExit, setConfirmExit] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ slot: 'hero' | 'secondary' | 'gallery'; galleryIdx?: number; label: string } | null>(null);
  const selectedImageRef = useRef<typeof selectedImage>(null);
  const [imageOffset, setImageOffset] = useState({ x: 50, y: 50 });
  const imageOffsetRef = useRef({ x: 50, y: 50 });
  const imageOffsetChangedRef = useRef(false);
  const [repositioning, setRepositioning] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTextEditsRef = useRef<Record<string, string> | null>(null);

  // ── Send for Approval state ──────────────────────────────────────────────
  type ApprovalSendState =
    | { status: 'idle' }
    | { status: 'sending' }
    | { status: 'sent'; token: string; to: string }
    | { status: 'error'; message: string };

  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalRecipientEmail, setApprovalRecipientEmail] = useState("");
  const [approvalRecipientName, setApprovalRecipientName] = useState("");
  const [approvalNotifyEmail, setApprovalNotifyEmail] = useState("");
  const [approvalSendState, setApprovalSendState] = useState<ApprovalSendState>({ status: 'idle' });
  const [approvalStatus, setApprovalStatus] = useState<{ decision: string; editNotes: string | null; recipientName: string | null } | null>(null);

  // Load persisted emails from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const re = localStorage.getItem("approvalRecipientEmail");
    const rn = localStorage.getItem("approvalRecipientName");
    const ne = localStorage.getItem("approvalNotifyEmail");
    if (re) setApprovalRecipientEmail(re);
    if (rn) setApprovalRecipientName(rn);
    if (ne) setApprovalNotifyEmail(ne);
  }, []);

  // When a saved draft is loaded/saved, check its approval status.
  useEffect(() => {
    if (!currentDraftId) { setApprovalStatus(null); return; }
    fetch(`/api/draft-approval?savedDraftId=${encodeURIComponent(currentDraftId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok || !Array.isArray(d.approvals) || d.approvals.length === 0) {
          setApprovalStatus(null);
          return;
        }
        // Most recent approval
        const latest = d.approvals[d.approvals.length - 1];
        setApprovalStatus({
          decision: latest.decision,
          editNotes: latest.editNotes ?? null,
          recipientName: latest.recipientName ?? null,
        });
      })
      .catch(() => setApprovalStatus(null));
  }, [currentDraftId]);

  async function sendForApproval() {
    if (!currentDraftId || !selected || !approvalRecipientEmail) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(approvalRecipientEmail)) {
      setApprovalSendState({ status: 'error', message: 'Please enter a valid email address.' });
      return;
    }
    localStorage.setItem("approvalRecipientEmail", approvalRecipientEmail);
    localStorage.setItem("approvalRecipientName", approvalRecipientName);
    localStorage.setItem("approvalNotifyEmail", approvalNotifyEmail);
    setApprovalSendState({ status: 'sending' });
    try {
      const res = await fetch("/api/draft-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedDraftId: currentDraftId,
          communitySlug: selected.slug,
          recipientEmail: approvalRecipientEmail,
          recipientName: approvalRecipientName.trim() || null,
          notifyEmail: approvalNotifyEmail || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setApprovalSendState({ status: 'sent', token: data.token, to: approvalRecipientEmail });
        setApprovalStatus({ decision: "pending", editNotes: null, recipientName: approvalRecipientName.trim() || null });
      } else {
        setApprovalSendState({ status: 'error', message: data.error ?? 'Unknown error' });
      }
    } catch (e: unknown) {
      setApprovalSendState({ status: 'error', message: String(e) });
    }
  }

  // Keep refs in sync with state so async/closure callbacks see fresh values.
  useEffect(() => { selectedImageRef.current = selectedImage; }, [selectedImage]);
  useEffect(() => { imageOffsetRef.current = imageOffset; }, [imageOffset]);

  function getOriginalForSlot(slot: 'hero' | 'secondary' | 'gallery', galleryIdx?: number): string | undefined {
    if (slot === 'hero') return heroOriginalUrl;
    if (slot === 'secondary') return secondaryOriginalUrl;
    if (slot === 'gallery' && galleryIdx !== undefined) return galleryOriginalUrls[galleryIdx];
    return undefined;
  }

  function applyMove(dx: number, dy: number) {
    const newX = Math.max(0, Math.min(100, imageOffsetRef.current.x + dx));
    const newY = Math.max(0, Math.min(100, imageOffsetRef.current.y + dy));
    imageOffsetRef.current = { x: newX, y: newY };
    setImageOffset({ x: newX, y: newY });
    imageOffsetChangedRef.current = true;
    const si = selectedImageRef.current;
    if (si && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'eblast-reposition', label: si.label, x: newX, y: newY },
        '*',
      );
    }
  }

  function startHold(dx: number, dy: number) {
    applyMove(dx, dy);
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => applyMove(dx, dy), 80);
    }, 350);
  }

  function stopHold() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }

  function captureTextEdits(): Record<string, string> {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return {};
    const fields: Record<string, string> = {};
    // Capture named data-field elements.
    doc.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
      const k = el.getAttribute('data-field');
      if (k) fields[`field:${k}`] = el.innerHTML;
    });
    // Capture catch-all text elements by position index.
    let catchallIdx = 0;
    doc.querySelectorAll<HTMLElement>('p,h1,h2,h3').forEach((el) => {
      if (el.getAttribute('data-field')) return;
      if (el.closest('a')) return;
      const txt = el.textContent?.trim();
      if (!txt || el.style.maxHeight === '0px' || el.style.fontSize === '1px') return;
      fields[`catchall:${catchallIdx}`] = el.innerHTML;
      catchallIdx++;
    });
    return fields;
  }

  async function commitReposition() {
    const si = selectedImageRef.current;
    if (!si || !imageOffsetChangedRef.current) return;
    setRepositioning(true);
    await repositionImage(si.slot, imageOffsetRef.current.x, imageOffsetRef.current.y, si.galleryIdx);
    setRepositioning(false);
  }

  // Listen for image clicks from the iframe and initialize repositioning.
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (!e.data) return;
      if (e.data.type === 'eblast-format-done' || e.data.type === 'eblast-html-edit') {
        // Changes already applied to iframe DOM — don't update srcDoc (that reloads
        // the iframe and loses scroll position + focus). HTML is captured from the
        // iframe DOM at save time via handleSaveDraft().
        return;
      }
      if (e.data.type !== 'eblast-image-select') return;
      const label: string = e.data.label ?? '';
      let next: typeof selectedImage = null;
      if (label === 'Hero image') {
        next = { slot: 'hero', label };
      } else if (label === 'Secondary image') {
        next = { slot: 'secondary', label };
      } else if (label.startsWith('Gallery image ')) {
        const idx = parseInt(label.replace('Gallery image ', ''), 10) - 1;
        next = { slot: 'gallery', galleryIdx: isNaN(idx) ? 0 : idx, label };
      }
      if (!next) return;
      // Reset offset for the new selection.
      imageOffsetRef.current = { x: 50, y: 50 };
      imageOffsetChangedRef.current = false;
      setImageOffset({ x: 50, y: 50 });
      setSelectedImage(next);
      // Show the original in the iframe for live CSS positioning.
      // Fall back to the current placed <img> src if the unmodified original
      // isn't stored locally (e.g. different device, cleared localStorage).
      const original = getOriginalForSlot(next.slot, next.galleryIdx);
      const fallbackSrc = iframeRef.current?.contentDocument
        ?.querySelector<HTMLImageElement>(`img[data-img-label="${label}"]`)?.src;
      const srcToSend = original || fallbackSrc;
      if (srcToSend && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'eblast-show-original', label, src: srcToSend, x: 50, y: 50 },
          '*',
        );
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroOriginalUrl, secondaryOriginalUrl, galleryOriginalUrls]);
  const selected = communities.find((c) => c.slug === selectedSlug);

  return (
    <>
      <Header active="drafter" />
      <main className="mx-auto max-w-[1240px] px-6 pb-24 pt-10">
        {/* Page intro */}
        <div className="mb-8 max-w-3xl">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-clay-600">Drafter</p>
          <h1 className="mt-1 font-serif text-[40px] leading-tight text-sand-900">
            Drop a flyer. The agents draft, critique, and converge.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-sand-600">
            Upload one PDF. The drafter writes from the community's brand guide and the last 365 days of
            performance data. The critic reviews — including the actual images — and pushes back until the
            draft is ready. You see the preview only after they agree.
          </p>
        </div>

        {/* Two-column layout: inputs + intelligence */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Generate card */}
          <Card className="eb-rise">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Generate eblast</CardTitle>
                <Badge variant="outline">Step 1</Badge>
              </div>
              <CardDescription>Pick a community and upload the flyer PDF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="community">Community</Label>
                <Select id="community" value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)} disabled={stage === "drafting"}>
                  <option value="">Select a community…</option>
                  {communities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.displayName}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="pdf">Flyer PDF</Label>
                {/* State-driven picker: the shown filename comes from `pdf` state,
                    not the native widget, so cancelling the file dialog can never
                    clear the current file. */}
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="pdf"
                    className={`inline-flex shrink-0 items-center rounded-md border border-sand-300 bg-sand-100 px-3 py-2 text-xs font-medium text-sand-700 ${
                      stage === "drafting" ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-sand-200"
                    }`}
                  >
                    Choose file
                  </label>
                  <span className="min-w-0 flex-1 truncate text-xs text-sand-600">
                    {pdf ? pdf.name : "No file selected"}
                  </span>
                  <input
                    id="pdf"
                    type="file"
                    accept="application/pdf"
                    disabled={stage === "drafting"}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileChange(file);
                      // Reset the native value so re-picking the same file still
                      // fires onChange and so we never rely on its own display.
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {selected && (
                <div className="grid grid-cols-3 gap-3 rounded-md border border-sand-200 bg-sand-50/60 p-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-sand-500">Sender</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-sand-900">
                      {selected.senders[0]?.name ?? <span className="text-clay-600">none</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-sand-500">Segments</p>
                    <p className="mt-0.5 text-xs font-medium text-sand-900">
                      {(() => {
                        const incl = selected.hubspot.includedListIds?.length ?? 0;
                        const excl = selected.hubspot.excludedListIds?.length ?? 0;
                        if (incl === 0 && excl === 0) return <span className="text-clay-600">not set</span>;
                        return (
                          <span title={selected.hubspot.acronym ? `HubSpot acronym: ${selected.hubspot.acronym}` : undefined}>
                            {incl} incl · {excl} excl
                          </span>
                        );
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-sand-500">Tracking #</p>
                    <p className="mt-0.5 tabular-nums text-xs font-medium text-sand-900">
                      {selected.trackingPhone ?? <span className="text-clay-600">not set</span>}
                    </p>
                  </div>
                </div>
              )}

              {duplicateWarning && (
                <div className="flex items-center gap-2.5 rounded border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-700">
                  <span className="shrink-0 text-amber-400">⚠</span>
                  <span className="leading-snug">
                    Duplicate — already generated{" "}
                    {new Date(duplicateWarning.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {duplicateWarning.community !== selectedSlug ? " for another community" : ""}
                  </span>
                  <button
                    className="ml-auto shrink-0 font-medium text-amber-600 hover:text-amber-900"
                    onClick={dismissDuplicateWarning}
                  >
                    Generate anyway
                  </button>
                </div>
              )}

              <Button
                onClick={generateDraft}
                disabled={!pdf || !selectedSlug || stage === "drafting" || !!duplicateWarning}
                loading={stage === "drafting"}
                size="lg"
                className="w-full"
              >
                {stage === "drafting" ? "Drafter & critic working…" : "Generate eblast draft"}
              </Button>

              {(selectedSlug || pdf) && stage !== "drafting" && (
                <button
                  onClick={clearInputs}
                  className="mx-auto block text-[11px] text-sand-500 underline underline-offset-2 hover:text-clay-600"
                >
                  Clear community &amp; file
                </button>
              )}

              {stage === "drafting" && (
                <div className="rounded-md border border-sand-200 bg-sand-50/60 p-3 text-xs leading-relaxed text-sand-600">
                  <p className="eb-fade-pulse">
                    Drafter reading the flyer and pulling images. Critic reviewing each round — if it flags
                    issues, drafter applies the fixes and the critic re-reviews. Up to 2 rounds.
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[11px] text-sand-500">Typically 30–60 seconds. Safe to switch tabs.</p>
                    <button
                      onClick={cancelGeneration}
                      className="text-[11px] text-clay-600 underline underline-offset-2 hover:text-clay-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-md border border-clay-200 bg-clay-50/60 px-3 py-2.5 text-xs text-clay-700">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Intelligence */}
          {selectedSlug ? (
            <CommunityIntelligence communitySlug={selectedSlug} />
          ) : (
            <Card className="eb-rise flex items-center justify-center border-dashed">
              <CardContent className="px-6 py-10 text-center">
                <p className="text-sm text-sand-500">
                  Select a community to see its intelligence — brand voice, past sends, and performance.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Preview + reviewer */}
        {extracted && (
          <>
            <div className="mt-8 grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
              {/* Controls column */}
              <div className="flex flex-col gap-5">

                {/* Refine — at the top so it's immediately accessible */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Refine with a prompt</CardTitle>
                    <CardDescription>
                      e.g. &ldquo;tighten the headline&rdquo;, &ldquo;less salesy&rdquo;, &ldquo;swap the CTA to call&rdquo;.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={refineInput}
                      onChange={(e) => setRefineInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey)) refineDraft();
                      }}
                      placeholder="What should change?"
                      rows={3}
                      disabled={stage === "refining"}
                      className="rounded-lg"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={refineDraft}
                          disabled={!refineInput.trim() || stage === "refining"}
                          loading={stage === "refining"}
                          variant="secondary"
                          size="sm"
                        >
                          {stage === "refining" ? "Refining…" : "Apply change"}
                        </Button>
                        <button
                          type="button"
                          onClick={undoRefine}
                          disabled={!canUndoRefine || stage === "refining"}
                          title={canUndoRefine && lastRefineInstruction ? `Undo: "${lastRefineInstruction}"` : "Nothing to undo"}
                          className="inline-flex items-center gap-1.5 rounded-md border border-sand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sand-700 hover:border-clay-300 hover:bg-clay-50/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-sand-300 disabled:hover:bg-white"
                        >
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M3 8a5 5 0 1 1 1.5 3.5M3 8V4.5M3 8h3.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Undo
                        </button>
                        <button
                          type="button"
                          onClick={redoRefine}
                          disabled={!canRedoRefine || stage === "refining"}
                          title={canRedoRefine && redoRefineInstruction ? `Redo: "${redoRefineInstruction}"` : "Nothing to redo"}
                          className="inline-flex items-center gap-1.5 rounded-md border border-sand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sand-700 hover:border-clay-300 hover:bg-clay-50/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-sand-300 disabled:hover:bg-white"
                        >
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M13 8a5 5 0 1 0-1.5 3.5M13 8V4.5M13 8h-3.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Redo
                        </button>
                      </div>
                      {refineHistory.length > 0 && (
                        <span className="text-[11px] text-sand-500">
                          {refineHistory.length} refinement{refineHistory.length === 1 ? "" : "s"} applied
                        </span>
                      )}
                    </div>
                    {(() => {
                      // Immediate feedback on the last refine — especially when
                      // nothing changed, so a no-op never looks like a silent success.
                      const last = refineHistory[refineHistory.length - 1];
                      if (!last || !last.ok || (!last.note && !last.noChange)) return null;
                      return (
                        <div
                          className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${
                            last.noChange
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-sand-200 bg-sand-50 text-sand-700"
                          }`}
                        >
                          {last.noChange
                            ? last.note ??
                              "No change was applied. Try rephrasing — name the specific text or photo you want changed."
                            : last.note}
                        </div>
                      );
                    })()}
                    {refineHistory.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.12em] text-sand-500">
                          History
                        </summary>
                        <ol className="mt-2 list-decimal pl-5 text-xs leading-relaxed text-sand-600 space-y-1">
                          {refineHistory.map((r, i) => {
                            const parts = [...(r.changedFields ?? [])];
                            if (r.imagesChanged) parts.push("Photos");
                            return (
                              <li key={i} className={r.ok ? "" : "text-clay-700"}>
                                <span>{r.instruction}</span>
                                {r.ok && parts.length > 0 && (
                                  <span className="ml-1.5 text-[10px] font-medium text-sand-400">
                                    → {parts.join(", ")}
                                  </span>
                                )}
                                {r.ok && r.noChange && (
                                  <span className="ml-1.5 text-[10px] font-medium text-amber-600">
                                    → no change applied
                                  </span>
                                )}
                                {!r.ok && (
                                  <span className="ml-1.5 text-[10px] font-medium text-clay-600">→ failed</span>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      </details>
                    )}
                  </CardContent>
                </Card>

                {/* Image panels — placed images and image bank */}
                <PlacedImagesPanel
                  heroImageUrl={heroImageUrl}
                  secondaryImageUrl={secondaryImageUrl}
                  galleryImageUrls={galleryImageUrls}
                  onRemove={async (slot, galleryIdx) => {
                    const edits = captureTextEdits();
                    if (Object.keys(edits).length) pendingTextEditsRef.current = edits;
                    await removeImage(slot, galleryIdx);
                  }}
                />
                <ImageBankPanel
                  imageUrls={allExtractedImageUrls}
                  onSwap={(slot, url) => {
                    const edits = captureTextEdits();
                    if (Object.keys(edits).length) pendingTextEditsRef.current = edits;
                    swapImage(slot, url, undefined, 'center');
                  }}
                  onAddImage={addToImageBank}
                />

                {/* Reviewer — collapsible, open by default */}
                <div className="rounded-lg border border-sand-200 bg-white shadow-card">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                    onClick={() => setReviewerOpen((o) => !o)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-serif text-base font-medium text-sand-900">Reviewer</span>
                      {review && (
                        <Badge variant={verdictBadge[review.verdict]?.variant ?? "neutral"}>
                          {verdictBadge[review.verdict]?.label ?? review.verdict}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {reviewing && (
                        <span className="text-[11px] italic text-sand-400">reviewing…</span>
                      )}
                      {agentLoop && (
                        <span className="text-[11px] text-sand-400">
                          {agentLoop.totalRounds} round{agentLoop.totalRounds === 1 ? "" : "s"}
                          {agentLoop.imagesExcluded > 0
                            ? ` · ${agentLoop.imagesExcluded} image${agentLoop.imagesExcluded === 1 ? "" : "s"} dropped`
                            : ""}
                        </span>
                      )}
                      <svg
                        viewBox="0 0 16 16"
                        className={`h-3.5 w-3.5 shrink-0 text-sand-300 transition-transform ${reviewerOpen ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" strokeWidth="2"
                      >
                        <path d="M4 6l4 4 4-4" />
                      </svg>
                    </div>
                  </button>

                  {reviewerOpen && (
                    <div className="space-y-3 border-t border-sand-200 px-5 pb-5 pt-4">
                      {reviewing && !review && (
                        <p className="eb-fade-pulse text-sm text-sand-600">Reviewing draft…</p>
                      )}
                      {reviewError && (
                        <div className="rounded-md border border-clay-200 bg-clay-50 px-3 py-2 text-xs text-clay-700">
                          {reviewError}
                        </div>
                      )}

                      {review && (
                        <>
                          {/* Verdict summary */}
                          <div className={`rounded-md border px-3 py-2.5 ${
                            review.verdict === "ready"
                              ? "border-forest-200 bg-forest-50/60"
                              : review.verdict === "needs_revision"
                                ? "border-amber-200 bg-amber-50/50"
                                : "border-clay-200 bg-clay-50/50"
                          }`}>
                            <p className="text-sm leading-relaxed text-sand-800">{review.summary}</p>
                          </div>

                          {/* Findings — send_strategy and craft are shown in Intelligence Applied, not here.
                              Alt-text / image-direction findings are also dropped: alt text isn't visible or
                              editable in the app, so flagging it is a dead end (also scrubs stale saved drafts). */}
                          {(() => {
                            const ALT_FIELDS = ["heroImageAlt", "secondaryImageAlt", "heroImageDescription", "secondaryImageDescription"];
                            const reviewerFindings = review.findings.filter(
                              (f) =>
                                f.category !== "send_strategy" &&
                                f.category !== "craft" &&
                                !(f.category === "image_quality" && f.field && ALT_FIELDS.includes(f.field))
                            );
                            return reviewerFindings.length === 0 ? (
                            <p className="rounded-md border border-dashed border-forest-200 bg-forest-50/50 px-3 py-2.5 text-xs text-forest-700">
                              No issues found — reviewer thinks this draft is clean.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {reviewerFindings.map((f, i) => {
                                const priority =
                                  f.severity === "blocker"
                                    ? { label: "Must fix", cls: "bg-clay-50 text-clay-700 border-clay-300" }
                                    : f.severity === "important"
                                      ? { label: "Should fix", cls: "bg-amber-50 text-amber-700 border-amber-300" }
                                      : { label: "Consider", cls: "bg-sand-100 text-sand-600 border-sand-300" };
                                return (
                                  <li key={i}>
                                    <details className="group overflow-hidden rounded-md border border-sand-200 bg-white">
                                      <summary className="flex cursor-pointer select-none items-start gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                                        <span className={`mt-px shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priority.cls}`}>
                                          {priority.label}
                                        </span>
                                        <span className="flex-1 text-sm leading-snug text-sand-900">{f.issue}</span>
                                        <svg
                                          viewBox="0 0 16 16"
                                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sand-300 transition-transform group-open:rotate-180"
                                          fill="none" stroke="currentColor" strokeWidth="2"
                                        >
                                          <path d="M4 6l4 4 4-4" />
                                        </svg>
                                      </summary>
                                      <div className="space-y-2 border-t border-sand-100 px-3 pb-3 pt-2.5">
                                        {f.suggestion && (
                                          <button
                                            onClick={() => setRefineInput(f.suggestion!)}
                                            title="Click to load this fix into the refine box"
                                            className="w-full rounded border border-dashed border-clay-300 bg-clay-50/40 px-3 py-2 text-left text-xs leading-relaxed text-sand-800 hover:border-clay-400 hover:bg-clay-50/70"
                                          >
                                            Fix: {f.suggestion}
                                          </button>
                                        )}
                                        {f.rationale && (
                                          <p className="text-xs text-sand-500">
                                            <span className="font-medium text-sand-700">Why: </span>{f.rationale}
                                          </p>
                                        )}
                                      </div>
                                    </details>
                                  </li>
                                );
                              })}
                            </ul>
                          );
                          })()}

                          {/* Agent loop trace */}
                          {agentLoop && agentLoop.iterations.length > 1 && (
                            <details className="group rounded-md border border-sand-200 bg-sand-50/60 px-3 py-2">
                              <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.12em] text-sand-600 group-open:text-sand-900">
                                Agent rounds · {agentLoop.totalRounds} total
                              </summary>
                              <ol className="mt-3 space-y-3 text-xs text-sand-700">
                                {agentLoop.iterations.map((it) => (
                                  <li key={it.round} className="space-y-1">
                                    <p className="font-medium text-sand-900">
                                      Round {it.round}:{" "}
                                      <span className="font-normal italic">
                                        {it.verdict.replace(/_/g, " ")},{" "}
                                        {it.findingsCount} finding{it.findingsCount === 1 ? "" : "s"}
                                      </span>
                                    </p>
                                    {it.droppedImageSlots.length > 0 && (
                                      <p className="text-clay-700">↳ Dropped: {it.droppedImageSlots.join("; ")}</p>
                                    )}
                                    {it.appliedSuggestions.length > 0 && (
                                      <ul className="ml-4 list-disc space-y-0.5 text-sand-600">
                                        {it.appliedSuggestions.map((s, idx) => (
                                          <li key={idx}>{s}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </li>
                                ))}
                              </ol>
                            </details>
                          )}

                          {/* Send time / list note */}
                          {(review.sendTimeRecommendation || review.recipientListNote) && (
                            <div className="space-y-1 border-t border-sand-100 pt-3 text-xs">
                              {review.sendTimeRecommendation && (
                                <p className="text-sand-600">
                                  <span className="font-medium text-sand-800">Best send time: </span>
                                  {review.sendTimeRecommendation}
                                </p>
                              )}
                              {review.recipientListNote && (
                                <p className="text-clay-700">
                                  <span className="font-medium">List note: </span>
                                  {review.recipientListNote}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Subject specialist */}
                {subjectSpecialist && (
                  <SubjectSpecialistPanel
                    // SubjectSpecialistResult in DraftContext uses SubjectAlternative (score/reasoning)
                    // while SubjectSpecialistPanel expects SubjectCandidate (approach/charCount/rationale).
                    // The shapes differ — cast is required until the panel prop type is unified.
                    specialist={subjectSpecialist as any}
                    currentSubject={extracted.subject}
                    onPickAlternative={swapSubjectLine}
                  />
                )}

                {/* Intelligence applied */}
                <IntelligenceApplied
                  drafterRationale={extracted.drafterRationale}
                  // PastSendForContext (openRate/clickRate) differs from the panel's PastSend shape
                  // (openRatePct/clickRatePct/recipientCount/fromName) — cast required until unified.
                  pastSends={pastSendsContext as any}
                  findings={review?.findings}
                />

                {/* Push */}
                <Button
                  onClick={pushDraft}
                  disabled={stage === "pushing"}
                  loading={stage === "pushing"}
                  size="lg"
                  variant="primary"
                  className="bg-forest-600 hover:bg-forest-700 active:bg-forest-800"
                >
                  {stage === "pushing" ? "Pushing to HubSpot…" : "Push draft to HubSpot"}
                </Button>

                {/* Send for Approval */}
                <Button
                  onClick={() => { setApprovalSendState({ status: 'idle' }); setApprovalModalOpen(true); }}
                  disabled={!currentDraftId || stage === "pushing"}
                  size="lg"
                  variant="secondary"
                  className="border-sand-300 text-sand-700 hover:border-clay-300 hover:bg-clay-50/40"
                >
                  Send for Approval
                </Button>

                {/* In-app approval status notification */}
                {approvalStatus && approvalStatus.decision === "edits_requested" && approvalStatus.editNotes && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="font-medium text-amber-800">
                      {approvalStatus.recipientName
                        ? `${approvalStatus.recipientName.split(" ")[0]} requested edits`
                        : "Edits requested"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-amber-700">{approvalStatus.editNotes}</p>
                  </div>
                )}
                {approvalStatus && approvalStatus.decision === "approved" && (
                  <div className="rounded-md border border-forest-200 bg-forest-50 p-3 text-sm">
                    <p className="font-medium text-forest-800">
                      ✓ {approvalStatus.recipientName
                        ? `Approved by ${approvalStatus.recipientName.split(" ")[0]}`
                        : "Approved"} — ready to push to HubSpot
                    </p>
                  </div>
                )}
              </div>

              {/* Send for Approval modal */}
              {approvalModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                  <div className="w-full max-w-md rounded-2xl border border-sand-200/60 bg-white/95 backdrop-blur-xl p-7 shadow-float">
                    <h2 className="mb-1 font-serif text-xl text-sand-900">Send for Approval</h2>
                    <p className="mb-4 text-sm text-sand-500">
                      An email with the full draft will be sent. The recipient can approve (which pushes to HubSpot)
                      or submit edit notes.
                    </p>

                    {approvalSendState.status === 'sent' ? (
                      <div className="rounded-md border border-forest-200 bg-forest-50 p-4 text-sm text-forest-800">
                        <p className="font-medium">Approval email sent!</p>
                        <p className="mt-1 text-forest-700">Sent to {approvalSendState.to}</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-4">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-sand-600">
                              Send approval email to
                            </label>
                            <input
                              type="email"
                              pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                              value={approvalRecipientEmail}
                              onChange={(e) => setApprovalRecipientEmail(e.target.value)}
                              placeholder="salesperson@example.com"
                              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm text-sand-900 outline-none focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-sand-600">
                              Recipient name (optional)
                            </label>
                            <input
                              type="text"
                              value={approvalRecipientName}
                              onChange={(e) => setApprovalRecipientName(e.target.value)}
                              placeholder="Sarah Johnson"
                              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm text-sand-900 outline-none focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none"
                            />
                            <p className="mt-1 text-[11px] text-sand-400">
                              Used to personalise the greeting in the approval email.
                            </p>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-sand-600">
                              Notify me at (for edit requests)
                            </label>
                            <input
                              type="email"
                              value={approvalNotifyEmail}
                              onChange={(e) => setApprovalNotifyEmail(e.target.value)}
                              placeholder="you@example.com"
                              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm text-sand-900 outline-none focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none"
                            />
                            <p className="mt-1 text-[11px] text-sand-400">Saved automatically for next time.</p>
                          </div>
                        </div>

                        {approvalSendState.status === 'error' && (
                          <p className="mt-3 text-xs text-clay-600">{approvalSendState.message}</p>
                        )}

                        <div className="mt-5 flex gap-3">
                          <Button
                            onClick={sendForApproval}
                            disabled={approvalSendState.status === 'sending' || !approvalRecipientEmail}
                            loading={approvalSendState.status === 'sending'}
                            size="sm"
                            variant="primary"
                            className="bg-clay-500 hover:bg-clay-600"
                          >
                            {approvalSendState.status === 'sending' ? "Sending…" : "Send Approval Email"}
                          </Button>
                          <Button
                            onClick={() => setApprovalModalOpen(false)}
                            size="sm"
                            variant="secondary"
                            className="border-sand-300 text-sand-600"
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}

                    {approvalSendState.status === 'sent' && (
                      <div className="mt-4">
                        <Button
                          onClick={() => setApprovalModalOpen(false)}
                          size="sm"
                          variant="secondary"
                          className="border-sand-300 text-sand-600"
                        >
                          Close
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Preview pane */}
              <Card className="eb-rise overflow-hidden p-0">
                <CardHeader className="border-b border-sand-200 bg-sand-50/50">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Eblast preview</CardTitle>
                    <div className="flex shrink-0 items-center gap-2">
                      {stage === "refining" && (
                        <p className="eb-pulse-row text-sand-500">
                          <span className="eb-pulse-dot" />
                          <span className="eb-pulse-dot" />
                          <span className="eb-pulse-dot" />
                        </p>
                      )}
                      {htmlDirty && (
                        <Button size="sm" variant="secondary" onClick={handleSyncPreview}>
                          Sync preview
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={handleSaveDraft}>
                        Save draft
                      </Button>
                      <Button size="sm" variant="destructive" onClick={discardDraft}>
                        Discard
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          // Saved drafts can close freely (the saved copy stays in
                          // Saved drafts). An unsaved draft is gone for good, so warn first.
                          if (currentDraftSaved) discardDraft();
                          else setConfirmExit(true);
                        }}
                        title="Close preview"
                        aria-label="Close preview"
                        className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sand-400 hover:bg-sand-100 hover:text-clay-600"
                      >
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <CardDescription className="truncate">
                    Subject:{" "}
                    <span className="font-medium text-sand-900">{extracted.subject}</span>
                  </CardDescription>
                  {selectedImage && (
                    <div className="mt-2 flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-blue-600 shrink-0">
                        {selectedImage.label}
                      </span>
                      {/* D-pad: 3×3 grid, arrows at NSEW, reset in center */}
                      <div className="grid grid-cols-3 gap-px">
                        {[
                          { dx: 0, dy: 0, icon: null },
                          { dx: 0, dy: -3, icon: '↑' },
                          { dx: 0, dy: 0, icon: null },
                          { dx: -3, dy: 0, icon: '←' },
                          { dx: null, dy: null, icon: '·', reset: true },
                          { dx: 3, dy: 0, icon: '→' },
                          { dx: 0, dy: 0, icon: null },
                          { dx: 0, dy: 3, icon: '↓' },
                          { dx: 0, dy: 0, icon: null },
                        ].map((btn, i) => {
                          if (!btn.icon) return <div key={i} />;
                          if (btn.reset) {
                            return (
                              <button
                                key="reset"
                                disabled={repositioning}
                                onMouseDown={() => {
                                  imageOffsetRef.current = { x: 50, y: 50 };
                                  setImageOffset({ x: 50, y: 50 });
                                  imageOffsetChangedRef.current = true;
                                  if (iframeRef.current?.contentWindow) {
                                    iframeRef.current.contentWindow.postMessage(
                                      { type: 'eblast-reposition', label: selectedImage.label, x: 50, y: 50 }, '*',
                                    );
                                  }
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-[16px] leading-none text-blue-400 hover:bg-blue-100 hover:text-blue-600 disabled:opacity-40 select-none"
                                title="Reset to center"
                              >·</button>
                            );
                          }
                          return (
                            <button
                              key={i}
                              disabled={repositioning}
                              onMouseDown={(e) => { e.preventDefault(); startHold(btn.dx!, btn.dy!); }}
                              onMouseUp={stopHold}
                              onMouseLeave={stopHold}
                              className="flex h-6 w-6 items-center justify-center rounded text-[13px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 select-none"
                              title={btn.icon}
                            >
                              {btn.icon}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        disabled={repositioning}
                        onClick={async () => {
                          stopHold();
                          const edits = captureTextEdits();
                          if (Object.keys(edits).length) pendingTextEditsRef.current = edits;
                          await commitReposition();
                          setSelectedImage(null);
                        }}
                        className="ml-auto rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                      >
                        {repositioning ? 'Applying…' : 'Done'}
                      </button>
                    </div>
                  )}
                  {imageCount > 0 && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sand-200 bg-white px-2.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-sand-500">
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="2" y="3" width="12" height="10" rx="1.5" />
                          <circle cx="5.75" cy="6.25" r="1" />
                          <path d="M3 12l3.25-3 2.25 1.75 2-1.5 2.5 2.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {imageCount} image{imageCount === 1 ? "" : "s"} extracted
                      </span>
                    </div>
                  )}
                </CardHeader>
                <FormattingToolbar iframeRef={iframeRef} enabled={!!extracted} community={selected} />
                <CardContent className="p-3">
                  <p className={`mb-2 text-center text-xs ${htmlDirty ? "font-medium text-clay-600" : "text-sand-400"}`}>
                    {htmlDirty
                      ? "Edits are live in the preview — save draft to keep them."
                      : "Hover to identify sections · Click any text to edit it inline"}
                  </p>
                  <iframe
                    ref={iframeRef}
                    srcDoc={html}
                    onLoad={() => {
                      const doc = iframeRef.current?.contentDocument;
                      if (!doc?.body) return;
                      // Guard against double-injection: when handleSyncPreview captures
                      // documentElement.outerHTML the injected script is included in the
                      // serialised HTML. Setting that as srcDoc runs the script once from
                      // the HTML; without this guard, onLoad would inject it a second time,
                      // doubling every event listener and causing duplicate text edits.
                      if (!doc.body.querySelector('script[data-eblast-edit]')) {
                        const s = doc.createElement("script");
                        s.setAttribute('data-eblast-edit', '1');
                        s.textContent = EBLAST_EDIT_SCRIPT;
                        doc.body.appendChild(s);
                      }
                      // Restore text field edits captured before an image-triggered reload.
                      if (pendingTextEditsRef.current) {
                        const edits = pendingTextEditsRef.current;
                        pendingTextEditsRef.current = null;
                        iframeRef.current?.contentWindow?.postMessage(
                          { type: 'eblast-restore-fields', fields: edits },
                          '*',
                        );
                      }
                      // If a reposition overlay is open, re-activate the original view.
                      const si = selectedImageRef.current;
                      if (si) {
                        const original = getOriginalForSlot(si.slot, si.galleryIdx);
                        if (original && iframeRef.current?.contentWindow) {
                          setTimeout(() => {
                            iframeRef.current?.contentWindow?.postMessage(
                              { type: 'eblast-show-original', label: si.label, src: original,
                                x: imageOffsetRef.current.x, y: imageOffsetRef.current.y },
                              '*',
                            );
                          }, 30);
                        }
                      }
                    }}
                    className="block h-[min(820px,80vh)] min-h-[480px] w-full resize-y overflow-auto rounded-sm border-0 bg-white transition-opacity duration-200"
                    style={{ opacity: stage === "refining" ? 0.55 : 1 }}
                    title="Eblast preview"
                  />
                </CardContent>
              </Card>
            </div>


            {confirmExit && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
                onClick={() => setConfirmExit(false)}
              >
                <div
                  className="w-full max-w-sm rounded-lg border border-sand-200 bg-white p-5 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="font-serif text-lg font-medium text-sand-900">Exit without saving?</h3>
                  <p className="mt-2 text-sm leading-relaxed text-sand-600">
                    This draft hasn&apos;t been saved. Exiting now will permanently delete it — it won&apos;t
                    be in your Saved drafts. Save it as a draft first if you want to keep it.
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setConfirmExit(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setConfirmExit(false);
                        discardDraft();
                      }}
                    >
                      Exit without saving
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Push result */}
        {pushResult && (
          <div className="mt-6">
            <div
              className={`rounded-xl border overflow-hidden shadow-sm px-4 py-3 ${
                pushResult.ok ? "border-forest-200 bg-forest-50" : "border-red-200 bg-red-50"
              }`}
            >
              <p className="font-medium text-sand-900">
                {pushResult.ok ? "Draft created in HubSpot" : "Push failed"}
              </p>
              {pushResult.summary?.emailId && (
                <p className="mt-1 text-xs text-sand-600">
                  {pushResult.summary.community} · ID{" "}
                  <code className="rounded bg-sand-100 px-1 py-0.5 font-mono text-[11px]">
                    {pushResult.summary.emailId}
                  </code>{" "}
                  · State{" "}
                  <code className="rounded bg-sand-100 px-1 py-0.5 font-mono text-[11px]">
                    {pushResult.summary.state}
                  </code>
                </p>
              )}
            </div>

            {!pushResult.ok && Array.isArray(pushResult.steps) && pushResult.steps.length > 0 && (
              <div className="mt-3 space-y-2">
                {pushResult.steps.map((s: any, i: number) => (
                  <details key={i} open={!s.ok} className="rounded-md border border-sand-200 bg-white">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-sand-800">
                      <span
                        className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${
                          s.ok ? "bg-forest-600" : "bg-clay-600"
                        }`}
                      />
                      Step {i + 1} · {s.step} · HTTP {s.status} {s.ok ? "OK" : "FAIL"}
                    </summary>
                    <pre className="overflow-auto rounded-b-md bg-sand-50 px-3 py-2 text-[10.5px] leading-relaxed text-sand-700">
                      {JSON.stringify(s.body, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Transient save confirmation — fades in, holds, fades out (~3.5s). */}
      {saveNotice && (
        <div
          key={saveNotice.id}
          role="status"
          aria-live="polite"
          className="eb-toast pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="flex items-center gap-2 rounded-lg bg-forest-700 px-4 py-2.5 text-sm font-medium text-white shadow-xl">
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {saveNotice.text}
          </div>
        </div>
      )}
    </>
  );
}
