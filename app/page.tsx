"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
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
  type SavedDraft,
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
    im.style.cursor='help';
    im.addEventListener('mouseenter',function(){ im.style.outline='2px solid rgba(59,130,246,0.6)'; im.style.outlineOffset='2px'; });
    im.addEventListener('mouseleave',function(){ im.style.outline=''; });
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
      if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); el.blur(); }
      if(e.key==='Escape'){ el.contentEditable='false'; el.style.outline=''; el.blur(); }
    });
  });
  document.addEventListener('click',function(){ stopAll(null); });
})();`;

// ─── Display maps ─────────────────────────────────────────────────────────────

// Keys must match ReviewVerdict values from lib/critic.ts.
const verdictBadge: Record<ReviewVerdict, { label: string; variant: "success" | "warning" | "danger" }> = {
  ready: { label: "Ready to send", variant: "success" },
  needs_revision: { label: "Needs revision", variant: "warning" },
  blocking_issues: { label: "Blocking issues", variant: "danger" },
};

// ─── Saved Drafts Panel ───────────────────────────────────────────────────────

function SavedDraftsPanel({
  drafts,
  onLoad,
  onDelete,
}: {
  drafts: SavedDraft[];
  onLoad: (d: SavedDraft) => void;
  onDelete: (id: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  if (drafts.length === 0) return null;
  return (
    <details className="group mt-6 rounded-md border border-sand-200 bg-sand-50/60">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sand-600 group-open:text-sand-900">
          Recently saved drafts
        </span>
        <Badge variant="outline">{drafts.length}</Badge>
      </summary>
      <ul className="divide-y divide-sand-100 border-t border-sand-200">
        {drafts.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-sand-900">{d.subject}</p>
                <p className="mt-0.5 text-[11px] text-sand-500">
                  {d.communityName} ·{" "}
                  {new Date(d.savedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => onLoad(d)}>
                  Load
                </Button>
                <button
                  onClick={() => setPendingDelete(d.id)}
                  className="rounded p-1 text-sand-400 hover:bg-sand-100 hover:text-clay-600"
                  title="Delete draft"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                    <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66H14.5a.5.5 0 0 0 0-1h-.996a.59.59 0 0 0-.01 0H11Z" />
                  </svg>
                </button>
              </div>
            </div>
            {pendingDelete === d.id && (
              <div className="mt-2 flex items-center gap-3 rounded-md border border-clay-200 bg-clay-50/60 px-3 py-2 text-xs text-clay-800">
                <span className="flex-1">This will also remove it from the community page.</span>
                <button
                  onClick={() => { onDelete(d.id); setPendingDelete(null); }}
                  className="shrink-0 rounded bg-clay-600 px-2.5 py-1 font-medium text-white hover:bg-clay-700"
                >
                  Delete permanently
                </button>
                <button
                  onClick={() => setPendingDelete(null)}
                  className="shrink-0 text-sand-500 underline underline-offset-2 hover:text-sand-800"
                >
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Image Bank Panel ─────────────────────────────────────────────────────────

function ImageBankPanel({
  imageUrls,
  onSwap,
}: {
  imageUrls: string[];
  onSwap: (slot: 'hero' | 'secondary' | 'gallery', url: string) => void;
}) {
  if (imageUrls.length === 0) return null;
  return (
    <details open className="mt-4 rounded-md border border-sand-200 bg-sand-50/60">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sand-600">
          Image bank
        </span>
        <span className="text-[11px] text-sand-500">{imageUrls.length} image{imageUrls.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="flex flex-wrap gap-3 border-t border-sand-200 px-4 py-3">
        {imageUrls.map((url, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <img
              src={url}
              alt={`Extracted image ${i + 1}`}
              style={{ maxWidth: 80, maxHeight: 80, objectFit: "cover", borderRadius: 4 }}
              className="border border-sand-200"
            />
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSwap('hero', url)}
                className="rounded border border-sand-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-sand-700 hover:border-clay-300 hover:bg-clay-50/40"
              >
                Hero
              </button>
              <button
                onClick={() => onSwap('secondary', url)}
                className="rounded border border-sand-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-sand-700 hover:border-clay-300 hover:bg-clay-50/40"
              >
                Sec.
              </button>
              <button
                onClick={() => onSwap('gallery', url)}
                className="rounded border border-sand-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-sand-700 hover:border-clay-300 hover:bg-clay-50/40"
                title="Add to gallery"
              >
                +
              </button>
            </div>
          </div>
        ))}
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
    savedDrafts, communityDrafts, currentDraftSaved, saveNotice,
    htmlDirty, syncHtml, swapSubjectLine,
    allExtractedImageUrls, swapImage,
    handleFileChange, clearInputs,
    generateDraft, cancelGeneration,
    refineDraft, undoRefine, redoRefine, canUndoRefine, canRedoRefine, lastRefineInstruction, redoRefineInstruction,
    saveDraft, discardDraft,
    loadSavedDraft, deleteSavedDraft, deleteCommunityDraft,
    pushDraft,
    dismissDuplicateWarning,
  } = useDraft();

  const [reviewerOpen, setReviewerOpen] = useState(true);
  const [confirmExit, setConfirmExit] = useState(false);
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

        {/* Saved drafts */}
        <SavedDraftsPanel drafts={savedDrafts} onLoad={loadSavedDraft} onDelete={deleteSavedDraft} />

        {/* Image bank — shown when images are available and a draft is in view */}
        {extracted && allExtractedImageUrls.length > 0 && (
          <ImageBankPanel
            imageUrls={allExtractedImageUrls}
            onSwap={(slot, url) => { swapImage(slot, url); }}
          />
        )}

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
              </div>

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
                    srcDoc={html}
                    onLoad={(e) => {
                      const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
                      if (!doc?.body) return;
                      const s = doc.createElement("script");
                      s.textContent = EBLAST_EDIT_SCRIPT;
                      doc.body.appendChild(s);
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
