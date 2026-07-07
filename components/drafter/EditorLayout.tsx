"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useDraft } from "@/context/DraftContext";
import { FormatToolbar } from "@/components/drafter/RichEditor";
import EditorPanel from "./EditorPanel";
import PreviewPanel from "./PreviewPanel";
import ApprovalModal from "./ApprovalModal";

// Error code generator — gives each error a short stable identifier
function errorCode(msg: string): string {
  let h = 0;
  for (let i = 0; i < msg.length; i++) h = (Math.imul(31, h) + msg.charCodeAt(i)) | 0;
  return "ERR_" + Math.abs(h).toString(36).toUpperCase().slice(0, 5);
}

function TopBar({ onApproval, autoSaveLabel }: { onApproval: () => void; autoSaveLabel: string | null }) {
  const {
    community,
    fields,
    isSaving,
    saveError,
    isPushing,
    pushResult,
    pushError,
    approvalStatus,
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
          onClick={discard}
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
            {isSaving ? "Saving…" : savedFlash ? (
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

        {/* Send for Approval button */}
        <button
          onClick={onApproval}
          className={[
            "text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors",
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
                Pushing…
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
  const [previewWidth, setPreviewWidth] = useState<"half" | "full">("half");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null);
  const { isSaving, fields, autoSave, lastEditTimestamp, activeEditorRef, activeEditorCallback, community } = useDraft();

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
      <TopBar onApproval={() => setApprovalOpen(true)} autoSaveLabel={autoSaveLabel} />

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
          <div className="h-9 flex items-center justify-between px-4 bg-[#f0ede7] border-b border-[#e8e3dc] shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4]">Live Preview</span>
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

          {/* Formatting toolbar — always visible above the email preview */}
          <div className="border-b border-[#e8e3dc] bg-white px-3 py-1.5 shrink-0">
            <FormatToolbar
              editorRef={activeEditorRef}
              brandColors={brandColors}
              brandFonts={brandFonts}
              onInput={() => activeEditorCallback.current?.()}
              className="flex items-center gap-0.5 flex-wrap"
            />
          </div>

          {/* Preview iframe container */}
          <div className="flex-1 overflow-y-auto bg-[#e8e3dc] py-6 px-4">
            <div className="w-full max-w-[640px] mx-auto shadow-xl rounded-lg overflow-hidden">
              <PreviewPanel />
            </div>
          </div>
        </div>
      </div>

      {approvalOpen && <ApprovalModal onClose={() => setApprovalOpen(false)} />}
    </div>
  );
}
