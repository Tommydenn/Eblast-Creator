"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDraft } from "@/context/DraftContext";
import { FormatToolbar } from "@/components/drafter/RichEditor";
import { AiBar } from "@/components/drafter/AiBar";
import { DeleteConfirmPopover } from "@/components/drafter/DeleteConfirmPopover";
import EditorPanel from "./EditorPanel";
import PreviewPanel from "./PreviewPanel";
import ApprovalModal from "./ApprovalModal";
import { CopyPromptModal } from "./CopyPromptModal";
import { FlyerPanel, useHasFlyer } from "./FlyerPanel";

// Error code generator — gives each error a short stable identifier
function errorCode(msg: string): string {
  let h = 0;
  for (let i = 0; i < msg.length; i++) h = (Math.imul(31, h) + msg.charCodeAt(i)) | 0;
  return "ERR_" + Math.abs(h).toString(36).toUpperCase().slice(0, 5);
}

function TopBar({ onApproval, onTestApproval, autoSaveLabel }: { onApproval: () => void; onTestApproval: () => void; autoSaveLabel: string | null }) {
  const router = useRouter();
  const {
    community,
    fields,
    isSaving,
    saveError,
    isPushing,
    pushResult,
    pushError,
    approvalStatus,
    imagesLoading,
    waitingForImages,
    save,
    push,
    discard,
    dismissPushResult,
  } = useDraft();

  // ── Button flash states ────────────────────────────────────────────────────
  const [savedFlash, setSavedFlash] = useState(false);
  const [pushFlash, setPushFlash] = useState(false);
  const [approvalFlash, setApprovalFlash] = useState(false);

  // ── Error auto-dismiss (4.5s) ─────────────────────────────────────────────
  const [hideSaveError, setHideSaveError] = useState(false);
  const [hidePushError, setHidePushError] = useState(false);

  useEffect(() => {
    if (!saveError) { setHideSaveError(false); return; }
    setHideSaveError(false);
    const id = setTimeout(() => setHideSaveError(true), 4500);
    return () => clearTimeout(id);
  }, [saveError]);

  useEffect(() => {
    if (!pushError) { setHidePushError(false); return; }
    setHidePushError(false);
    const id = setTimeout(() => setHidePushError(true), 4500);
    return () => clearTimeout(id);
  }, [pushError]);

  // Track isSaving transitions to detect successful saves
  const prevIsSaving = useRef(false);
  useEffect(() => {
    if (prevIsSaving.current && !isSaving && !saveError) {
      setSavedFlash(true);
      const id = setTimeout(() => setSavedFlash(false), 2500);
      return () => clearTimeout(id);
    }
    prevIsSaving.current = isSaving;
  }, [isSaving, saveError]);

  // Track isPushing transitions to detect successful pushes
  const prevIsPushing = useRef(false);
  useEffect(() => {
    if (prevIsPushing.current && !isPushing && !pushError) {
      setPushFlash(true);
      const id = setTimeout(() => setPushFlash(false), 2500);
      return () => clearTimeout(id);
    }
    prevIsPushing.current = isPushing;
  }, [isPushing, pushError]);

  // Track approvalStatus transitions to detect successful approval sends
  const prevApprovalStatus = useRef(approvalStatus);
  useEffect(() => {
    if (!prevApprovalStatus.current && approvalStatus) {
      setApprovalFlash(true);
      const id = setTimeout(() => setApprovalFlash(false), 2500);
      return () => clearTimeout(id);
    }
    prevApprovalStatus.current = approvalStatus;
  }, [approvalStatus]);

  return (
    <div className="h-14 flex items-center justify-between px-4 bg-white border-b border-[#e8e3dc] shrink-0 gap-3">
      {/* Left: logo + New Draft button + community name / subject */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Link href="/" className="shrink-0">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#1F4538] text-[10px] font-bold uppercase tracking-wider text-white">E</span>
        </Link>

        <div className="w-px h-5 bg-[#e8e3dc] shrink-0" />

        <button
          onClick={() => { discard(); router.push("/"); }}
          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-[#1F4538] border border-[#1F4538]/30 hover:bg-[#1F4538] hover:text-white rounded-lg px-3 py-1.5 transition-all"
          title="Discard and start a new draft"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Draft
        </button>

        {community && (
          <div className="flex flex-col min-w-0 leading-none">
            <span className="text-xs font-semibold text-[#1a1a1a] truncate">{community.displayName}</span>
            {fields?.subject && (
              <span className="text-[10.5px] text-[#9aaba4] truncate mt-0.5 max-w-[280px]">{fields.subject}</span>
            )}
          </div>
        )}

        {autoSaveLabel && (
          <span className="text-xs text-[#7a8c85] italic shrink-0 flex items-center gap-1.5 bg-[#f0ede7] border border-[#e8e3dc] rounded-md px-2.5 py-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10"/>
            </svg>
            {autoSaveLabel}
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Reopened drafts pull their photos in after the text, so say so
            rather than letting the eblast look like it has none. */}
        {imagesLoading && (
          <span className="flex items-center gap-1.5 text-xs text-[#7a8c85]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10"/></svg>
            Loading photos…
          </span>
        )}
        {/* Push success banner */}
        {pushResult && !pushError && !pushFlash && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Pushed to HubSpot
            <button onClick={dismissPushResult} className="ml-1 text-emerald-500 hover:text-emerald-700">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Save Draft button + error */}
        <div className="relative">
          <button
            onClick={save}
            disabled={isSaving}
            className={[
              "text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 bg-white",
              savedFlash
                ? "text-emerald-700 border-emerald-300 bg-emerald-50"
                : "text-[#5a6b63] hover:text-[#1F4538] border-[#ddd8d0] hover:border-[#1F4538]/40",
            ].join(" ")}
          >
            {waitingForImages ? "Adding photos…" : isSaving ? "Saving…" : savedFlash ? (
              <span className="flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Saved
              </span>
            ) : "Save Draft"}
          </button>
          {saveError && !hideSaveError && (
            <div className="absolute top-full right-0 mt-1.5 z-50 bg-red-50 border border-red-200 rounded-lg px-3 py-2 shadow-md w-64 animate-fade-out">
              <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-0.5">{errorCode(saveError)}</p>
              <p className="text-xs text-red-700">{saveError}</p>
            </div>
          )}
        </div>

        {/* Send for Approval button. Held while the flyer's date and its
            weekday disagree: a wrong date is the one mistake in an eblast that
            cannot be fixed after it has gone out. */}
        <button
          onClick={onApproval}
          disabled={!!fields?.dateConflict}
          title={fields?.dateConflict ? "Check the event date first — see the Hero tab" : undefined}
          className={[
            "text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            approvalFlash
              ? "text-emerald-700 border-emerald-300 bg-emerald-50"
              : "text-[#1F4538] border-[#1F4538]/40 hover:bg-[#1F4538]/5",
          ].join(" ")}
        >
          {approvalFlash ? (
            <span className="flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Sent
            </span>
          ) : "Send for Approval"}
        </button>

        {/* Test run of the same flow — nothing it does is recorded. */}
        <button
          onClick={onTestApproval}
          title="Send yourself the approval email and walk the whole flow. Approving it creates a [TEST] email in HubSpot but changes nothing in the drafter."
          className="text-xs font-medium border border-dashed border-[#9aaba4] text-[#5a6b63] rounded-lg px-3 py-1.5 hover:bg-[#5a6b63]/5 transition-colors"
        >
          Send Test
        </button>

        {/* Push to HubSpot button + error */}
        <div className="relative">
          <button
            onClick={push}
            disabled={isPushing}
            className={[
              "text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 flex items-center gap-1.5",
              pushFlash
                ? "text-emerald-700 border border-emerald-300 bg-emerald-50"
                : "text-white bg-[#1F4538] hover:bg-[#173829]",
            ].join(" ")}
          >
            {isPushing ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10"/></svg>
                {waitingForImages ? "Adding photos…" : "Pushing…"}
              </>
            ) : pushFlash ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Pushed
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Push to HubSpot
              </>
            )}
          </button>
          {pushError && !hidePushError && (
            <div className="absolute top-full right-0 mt-1.5 z-50 bg-red-50 border border-red-200 rounded-lg px-3 py-2 shadow-md w-72">
              <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-0.5">{errorCode(pushError)}</p>
              <p className="text-xs text-red-700">{pushError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EditorLayout() {
  const router = useRouter();
  const [previewWidth, setPreviewWidth] = useState<"half" | "full">("half");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"real" | "test">("real");
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null);
  const {
    isSaving, fields, autoSave, lastEditTimestamp, activeEditorRef, activeEditorCallback, activeFieldNameRef, community,
    lockInfo, copyPromptOpen, isMakingCopy, makeCopy, cancelCopyPrompt, draftId, resetColors,
  } = useDraft();

  // The flyer this draft was written from, for checking the copy against.
  // Hidden until asked for, so the preview keeps its full width by default.
  const hasFlyer = useHasFlyer(draftId);
  const [flyerOpen, setFlyerOpen] = useState(false);

  // How wide the flyer panel has been dragged, or null for its default share.
  // Kept so it survives moving between drafts — having to drag it back every
  // time would make the handle worth less than the trouble.
  const flyerRef = useRef<HTMLDivElement>(null);
  const [flyerWidth, setFlyerWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resetColorsOpen, setResetColorsOpen] = useState(false);
  const FLYER_MIN = 360;
  // What the preview keeps for itself no matter how far the handle is dragged.
  const PREVIEW_MIN = 280;

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("eblast_flyerWidth"));
      if (saved >= FLYER_MIN) setFlyerWidth(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startFlyerResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = flyerRef.current;
    const row = el?.parentElement;
    if (!el || !row) return;

    // Capture the pointer on the handle. Without it the drag is followed on
    // the window, and the moment the cursor crosses the flyer the events go to
    // the PDF viewer's own document instead — including the release, so the
    // drag never ended and the panel kept following the cursor afterwards.
    // Capture keeps every event for this pointer on the handle, iframe or not.
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startWidth = el.offsetWidth;
    // Dragging left widens the panel, so the delta is subtracted.
    const ceiling = Math.max(FLYER_MIN, row.clientWidth - PREVIEW_MIN);
    let latest = startWidth;
    setResizing(true);

    const onMove = (ev: PointerEvent) => {
      latest = Math.min(Math.max(startWidth - (ev.clientX - startX), FLYER_MIN), ceiling);
      setFlyerWidth(latest);
    };
    const stop = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      try { handle.releasePointerCapture(e.pointerId); } catch {}
      setResizing(false);
      try { localStorage.setItem("eblast_flyerWidth", String(Math.round(latest))); } catch {}
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", stop);
    // A cancelled pointer — the window losing focus mid-drag, say — has to end
    // it too, or the panel is left following a cursor that is no longer down.
    handle.addEventListener("pointercancel", stop);
  }

  // Opening the flyer narrows the preview column, and the email is a fixed
  // 600px that has to scale down to fit or it gets clipped on the right.
  // The preview re-measures on window resize, so say so once the new layout
  // has actually settled — measuring in the same tick reads the old width.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))),
    );
    return () => cancelAnimationFrame(id);
  }, [flyerOpen]);

  const isSavingRef = useRef(isSaving);
  const fieldsRef2 = useRef(fields);
  const autoSaveRef = useRef(autoSave);
  isSavingRef.current = isSaving;
  fieldsRef2.current = fields;
  autoSaveRef.current = autoSave;

  // Auto-save: fires 5 seconds AFTER the last user edit (debounce).
  useEffect(() => {
    if (!lastEditTimestamp) return;
    const id = setTimeout(async () => {
      if (!isSavingRef.current && fieldsRef2.current) {
        setAutoSaveLabel("Auto-saving…");
        const start = Date.now();
        await autoSaveRef.current();
        const elapsed = Date.now() - start;
        if (elapsed < 1000) {
          await new Promise<void>((r) => setTimeout(r, 1000 - elapsed));
        }
        setAutoSaveLabel(null);
      }
    }, 5000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEditTimestamp]);

  // All brand colors: primary, accent, background, secondary, plus supporting[]
  const brandColors = [
    community?.brand?.primary,
    community?.brand?.accent,
    community?.brand?.background,
    community?.brand?.secondary,
    ...(community?.brand?.supporting ?? []),
  ].filter(Boolean) as string[];

  // Brand fonts: headline + body from community profile
  const brandFonts = [
    community?.brand?.fontHeadline,
    community?.brand?.fontBody,
    community?.brand?.fonts?.script?.name,
  ].filter(Boolean) as string[];

  return (
    <div className="h-screen flex flex-col bg-[#f5f3ef]">
      <TopBar
        onApproval={() => { setApprovalMode("real"); setApprovalOpen(true); }}
        onTestApproval={() => { setApprovalMode("test"); setApprovalOpen(true); }}
        autoSaveLabel={autoSaveLabel}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: editor panel */}
        <div
          className={[
            "h-full overflow-hidden transition-all duration-300",
            previewWidth === "full" ? "w-0 opacity-0 pointer-events-none" : "w-[400px] min-w-[340px] max-w-[460px]",
          ].join(" ")}
        >
          <EditorPanel />
        </div>

        {/* Right: preview */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Preview header */}
          <div className="h-9 relative flex items-center justify-between px-4 bg-[#f0ede7] border-b border-[#e8e3dc] shrink-0">
            {/* The control that collapses the editor sits against the editor,
                at this header's left edge, with its chevron pointing at the
                panel it hides. It used to sit at the far right, the width of
                the preview away from what it acted on. */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPreviewWidth((w) => (w === "full" ? "half" : "full"))}
                className="text-[10px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors flex items-center gap-1"
              >
                {previewWidth === "full" ? (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    Show editor
                  </>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                    Full preview
                  </>
                )}
              </button>
            </div>
            {/* Centred on the header itself rather than placed between the two
                groups of buttons, so it stays put as their labels change
                length — "Show flyer" to "Hide flyer", "Full preview" to
                "Show editor". Not a click target, so it sits above nothing. */}
            <span className="absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4] pointer-events-none">
              Live Preview
            </span>
            <div className="flex items-center gap-4">
            <button
              onClick={() => setResetColorsOpen(true)}
              title="Put every colour back to this community's own"
              className="text-[10px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors flex items-center gap-1"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="13.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="14" r="2.5" />
                <circle cx="8.5" cy="7.5" r="2.5" /><circle cx="6.5" cy="12.5" r="2.5" />
                <path d="M12 2a10 10 0 0 0 0 20c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a6 6 0 0 0 6-6c0-5-4.5-9-10-9z" />
              </svg>
              Reset colors
            </button>
            {hasFlyer && (
              <button
                onClick={() => setFlyerOpen((o) => !o)}
                title="The flyer this eblast was written from"
                className="text-[10px] font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors flex items-center gap-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {flyerOpen ? "Hide flyer" : "Show flyer"}
              </button>
            )}
            </div>
          </div>

          {/* Formatting toolbar — always visible above the email preview */}
          <div className="border-b border-[#e8e3dc] bg-white px-3 py-1.5 shrink-0">
            <FormatToolbar
              editorRef={activeEditorRef}
              brandColors={brandColors}
              brandFonts={brandFonts}
              onInput={() => activeEditorCallback.current?.()}
              activeFieldNameRef={activeFieldNameRef}
              className="flex items-center gap-0.5 flex-wrap"
            />
          </div>

          {/* Preview, with the flyer alongside it when asked for */}
          <div className="flex-1 flex overflow-hidden">
            {/* min-w-0 so this column can actually give way. A flex item
                defaults to min-width:auto and will not shrink past its
                content, which here is a 600px email — without it the flyer
                beside it is pushed out of the row and clipped rather than
                getting the width it asks for. */}
            <div className="eb-scroll flex-1 min-w-0 overflow-y-auto bg-[#e8e3dc] py-6 px-4">
              {/* Exactly the email s width. It was 640 for a 600px email, and
                  the email sits at the left of its box, so the leftover 40px
                  showed as a grey strip down the right-hand side. */}
              {/* Square corners. The rounding was the page decorating the
                  email, and it showed as a curved sliver of grey across the
                  top and bottom of a message that will arrive with neither.
                  What is in this box should be what lands in an inbox. */}
              <div className="w-full max-w-[600px] mx-auto shadow-xl overflow-hidden">
                <PreviewPanel layoutSignal={`${flyerOpen ? "flyer" : "no-flyer"}:${flyerWidth ?? "auto"}`} />
              </div>
            </div>

            {/* The viewer's toolbar is turned off (see FlyerPanel), so this is
                sized for reading a flyer rather than for fitting a toolbar it
                no longer shows. The default is a share of the row; once the
                edge has been dragged it is whatever width was left there, and
                the ceiling class comes off so the drag is not clamped by it. */}
            {hasFlyer && flyerOpen && draftId && (
              <div
                ref={flyerRef}
                className={[
                  "relative h-full shrink-0",
                  flyerWidth == null ? "w-[42%] min-w-[360px] max-w-[620px]" : "",
                ].join(" ")}
                style={flyerWidth == null ? undefined : { width: flyerWidth }}
              >
                {/* Drag the panel's edge to widen it. Sits over the border
                    rather than beside it, so there is nothing to aim at. */}
                <div
                  onPointerDown={startFlyerResize}
                  title="Drag to resize"
                  className="absolute inset-y-0 -left-1 w-2 z-10 cursor-col-resize hover:bg-[#1F4538]/25 active:bg-[#1F4538]/40 transition-colors"
                />
                <FlyerPanel draftId={draftId} />
              </div>
            )}
          </div>

          {/* The AI, under the email rather than in the sidebar, so asking for
              a change no longer hides the fields the change is about. */}
          <AiBar />
        </div>
      </div>

      {resizing && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

      {/* Asked before, not undone after: it reaches the whole eblast, and the
          colours it clears were chosen one at a time. */}
      {resetColorsOpen && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setResetColorsOpen(false)} />
          <div className="fixed top-24 right-6 z-50">
            <DeleteConfirmPopover
              label="colors"
              message={<>Put every color back to <span className="font-semibold">{community?.displayName ?? "this community"}</span>&rsquo;s own?</>}
              footerNote="Colors only — bold, italic and size stay."
              confirmLabel="Reset"
              onConfirm={() => { resetColors(); setResetColorsOpen(false); }}
              onCancel={() => setResetColorsOpen(false)}
            />
          </div>
        </>
      )}

      {approvalOpen && <ApprovalModal mode={approvalMode} onClose={() => setApprovalOpen(false)} />}

      {copyPromptOpen && lockInfo && (
        <CopyPromptModal
          reasons={lockInfo.reasons}
          isMakingCopy={isMakingCopy}
          onMakeCopy={async () => {
            const copyId = await makeCopy();
            if (copyId) router.replace(`/draft/${encodeURIComponent(copyId)}`);
          }}
          onCancel={cancelCopyPrompt}
        />
      )}
    </div>
  );
}
