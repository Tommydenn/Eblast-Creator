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
    window.parent.postMessage({type:'eblast-field-edit',field:el.getAttribute('data-field'),value:el.innerText.trim()},'*');
  }
  function stopAll(except){
    document.querySelectorAll('[data-field][contenteditable="true"]').forEach(function(o){ if(o!==except) finish(o); });
  }
  document.querySelectorAll('[data-field]').forEach(function(el){
    el.style.cursor='pointer';
    el.addEventListener('mouseenter',function(){ if(el.contentEditable!=='true'){ el.style.outline='1px dashed rgba(59,130,246,0.45)'; el.style.outlineOffset='3px'; } });
    el.addEventListener('mouseleave',function(){ if(el.contentEditable!=='true') el.style.outline=''; });
    el.addEventListener('click',function(e){
      e.stopPropagation();
      if(el.contentEditable==='true') return;
      stopAll(el);
      el.contentEditable='true'; el.style.outline='2px solid #3b82f6'; el.style.outlineOffset='2px'; el.style.cursor='text';
      el.focus();
      var r=document.createRange(); r.selectNodeContents(el); r.collapse(false); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
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
  // Receive position-control messages from the parent frame.
  window.addEventListener('message',function(e){
    if(!e.data) return;
    if(e.data.type==='eblast-show-original'){
      var imgEl=document.querySelector('[data-img-label="'+e.data.label+'"]');
      if(!imgEl) return;
      var cw=parseInt(imgEl.getAttribute('width'))||imgEl.offsetWidth;
      var ch=parseInt(imgEl.getAttribute('height'))||imgEl.offsetHeight;
      var lbl=e.data.label, xPos=e.data.x, yPos=e.data.y, src=e.data.src;
      // Load original into a temp image to get natural size and normalize colors
      // via Canvas (Canvas compositor converts any color profile to sRGB).
      var tmp=new Image();
      tmp.onload=function(){
        var nw=tmp.naturalWidth, nh=tmp.naturalHeight;
        // Ensure BOTH axes have at least 12% panning room, regardless of aspect ratio.
        var MARGIN=0.12;
        // Normalize colors: draw through Canvas → export as sRGB JPEG.
        var maxSide=1600;
        var nrmW=nw>maxSide?maxSide:nw, nrmH=Math.round(nh*(nrmW/nw));
        var canvas=document.createElement('canvas');
        canvas.width=nrmW; canvas.height=nrmH;
        canvas.getContext('2d').drawImage(tmp,0,0,nrmW,nrmH);
        var normSrc=canvas.toDataURL('image/jpeg',0.92);
        // Scale the normalized image to fill the container with panning room.
        // Must use nrmW/nrmH (not nw/nh) — they differ when the image was downsampled.
        var scaleX=(cw/nrmW)*(1+MARGIN), scaleY=(ch/nrmH)*(1+MARGIN);
        var scale=Math.max(scaleX,scaleY);
        var bgWn=Math.round(nrmW*scale), bgHn=Math.round(nrmH*scale);
        var div=document.createElement('div');
        div.setAttribute('data-img-label',lbl);
        div.setAttribute('data-repo-div','1');
        div.style.cssText='display:inline-block;width:'+cw+'px;height:'+ch+'px;'+
          'background-image:url("'+normSrc+'");'+
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
    htmlDirty, syncHtml, swapSubjectLine,
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

  // ── Send for Approval state ──────────────────────────────────────────────
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalRecipientEmail, setApprovalRecipientEmail] = useState("");
  const [approvalNotifyEmail, setApprovalNotifyEmail] = useState("");
  const [approvalSending, setApprovalSending] = useState(false);
  const [approvalSent, setApprovalSent] = useState<{ token: string; to: string } | null>(null);
  const [approvalSendError, setApprovalSendError] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<{ decision: string; editNotes: string | null; recipientName: string | null } | null>(null);

  // Load persisted emails from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const re = localStorage.getItem("approvalRecipientEmail");
    const ne = localStorage.getItem("approvalNotifyEmail");
    if (re) setApprovalRecipientEmail(re);
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
    localStorage.setItem("approvalRecipientEmail", approvalRecipientEmail);
    localStorage.setItem("approvalNotifyEmail", approvalNotifyEmail);
    setApprovalSending(true);
    setApprovalSendError(null);
    try {
      const sender = selected.senders[0];
      const res = await fetch("/api/draft-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedDraftId: currentDraftId,
          communitySlug: selected.slug,
          recipientEmail: approvalRecipientEmail,
          recipientName: sender?.name ?? null,
          notifyEmail: approvalNotifyEmail || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setApprovalSent({ token: data.token, to: approvalRecipientEmail });
        setApprovalStatus({ decision: "pending", editNotes: null, recipientName: sender?.name ?? null });
      } else {
        setApprovalSendError(data.error ?? "Unknown error");
      }
    } catch (e: any) {
      setApprovalSendError(String(e));
    } finally {
      setApprovalSending(false);
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
      if (!e.data || e.data.type !== 'eblast-image-select') return;
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
      const original = getOriginalForSlot(next.slot, next.galleryIdx);
      if (original && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'eblast-show-original', label, src: original, x: 50, y: 50 },
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

                {/* Placed images — shows current slots with remove controls */}
                <PlacedImagesPanel
                  heroImageUrl={heroImageUrl}
                  secondaryImageUrl={secondaryImageUrl}
                  galleryImageUrls={galleryImageUrls}
                  onRemove={removeImage}
                />

                {/* Image bank — collapsible; always shown when a draft exists so images can be uploaded */}
                {extracted && (
                  <ImageBankPanel
                    imageUrls={allExtractedImageUrls}
                    onSwap={(slot, url) => swapImage(slot, url, undefined, 'center')}
                    onAddImage={addToImageBank}
                  />
                )}

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
                    specialist={subjectSpecialist as any}
                    currentSubject={extracted.subject}
                    onPickAlternative={swapSubjectLine}
                  />
                )}

                {/* Intelligence applied */}
                <IntelligenceApplied
                  drafterRationale={extracted.drafterRationale}
                  pastSends={pastSendsContext as any}
                  findings={review?.findings as any}
                />

                {/* Push */}
                <Button
                  onClick={pushDraft}
                  disabled={stage === "pushing"}
                  loading={stage === "pushing"}
                  size="lg"
                  variant="primary"
                  className="bg-clay-500 hover:bg-clay-600 active:bg-clay-700"
                >
                  {stage === "pushing" ? "Pushing to HubSpot…" : "Push draft to HubSpot"}
                </Button>

                {/* Send for Approval */}
                <Button
                  onClick={() => { setApprovalSent(null); setApprovalSendError(null); setApprovalModalOpen(true); }}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-sand-950/40 backdrop-blur-sm">
                  <div className="w-full max-w-md rounded-xl border border-sand-200 bg-white p-6 shadow-xl">
                    <h2 className="mb-1 font-serif text-xl text-sand-900">Send for Approval</h2>
                    <p className="mb-4 text-sm text-sand-500">
                      An email with the full draft will be sent. The recipient can approve (which pushes to HubSpot)
                      or submit edit notes.
                    </p>

                    {approvalSent ? (
                      <div className="rounded-md border border-forest-200 bg-forest-50 p-4 text-sm text-forest-800">
                        <p className="font-medium">Approval email sent!</p>
                        <p className="mt-1 text-forest-700">Sent to {approvalSent.to}</p>
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
                              value={approvalRecipientEmail}
                              onChange={(e) => setApprovalRecipientEmail(e.target.value)}
                              placeholder="salesperson@example.com"
                              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm text-sand-900 outline-none focus:border-clay-400 focus:ring-1 focus:ring-clay-200"
                            />
                            <p className="mt-1 text-[11px] text-sand-400">
                              {selected?.senders[0]?.name
                                ? `Greeting will address ${selected.senders[0].name.split(" ")[0]} by name.`
                                : ""}
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
                              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm text-sand-900 outline-none focus:border-clay-400 focus:ring-1 focus:ring-clay-200"
                            />
                            <p className="mt-1 text-[11px] text-sand-400">Saved automatically for next time.</p>
                          </div>
                        </div>

                        {approvalSendError && (
                          <p className="mt-3 text-xs text-clay-600">{approvalSendError}</p>
                        )}

                        <div className="mt-5 flex gap-3">
                          <Button
                            onClick={sendForApproval}
                            disabled={approvalSending || !approvalRecipientEmail}
                            loading={approvalSending}
                            size="sm"
                            variant="primary"
                            className="bg-clay-500 hover:bg-clay-600"
                          >
                            {approvalSending ? "Sending…" : "Send Approval Email"}
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

                    {approvalSent && (
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
                        <Button size="sm" variant="secondary" onClick={syncHtml}>
                          Sync preview
                        </Button>
                      )}
                      {!currentDraftSaved && (
                        <>
                          <Button size="sm" variant="secondary" onClick={saveDraft}>
                            Save draft
                          </Button>
                          <Button size="sm" variant="destructive" onClick={discardDraft}>
                            Discard
                          </Button>
                        </>
                      )}
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
                <CardContent className="p-3">
                  <p className={`mb-2 text-center text-[11px] ${htmlDirty ? "font-medium text-clay-600" : "text-sand-400"}`}>
                    {htmlDirty
                      ? "Unsaved edits — click Sync preview to apply them."
                      : "Hover to identify sections · Click any text to edit it inline"}
                  </p>
                  <iframe
                    ref={iframeRef}
                    srcDoc={html}
                    onLoad={() => {
                      const doc = iframeRef.current?.contentDocument;
                      if (!doc?.body) return;
                      const s = doc.createElement("script");
                      s.textContent = EBLAST_EDIT_SCRIPT;
                      doc.body.appendChild(s);
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
                    className="block h-[820px] min-h-[480px] w-full resize-y overflow-auto rounded-sm border-0 bg-white transition-opacity duration-200"
                    style={{ opacity: stage === "refining" ? 0.55 : 1 }}
                    title="Eblast preview"
                  />
                </CardContent>
              </Card>
            </div>

            {confirmExit && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-sand-900/40 px-4"
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
          <div className="mt-8">
            <div
              className={`rounded-md border-l-4 px-4 py-3 ${
                pushResult.ok ? "border-forest-600 bg-forest-50/60" : "border-clay-600 bg-clay-50/60"
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
