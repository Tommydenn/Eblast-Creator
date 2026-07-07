"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useDraft } from "@/context/DraftContext";
import EditorPanel from "./EditorPanel";
import PreviewPanel from "./PreviewPanel";

function TopBar() {
  const { community, fields, isSaving, isPushing, pushResult, pushError, save, push, discard, dismissPushResult } = useDraft();

  return (
    <div className="h-14 flex items-center justify-between px-5 bg-white border-b border-[#e8e3dc] shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 mr-1">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#1F4538] text-[10px] font-bold uppercase tracking-wider text-white">E</span>
          <span className="text-xs font-semibold text-[#1a1a1a] hidden sm:inline">Eblast Drafter</span>
        </Link>

        <span className="text-[#e0dbd3] text-xs">|</span>

        <button
          onClick={discard}
          className="text-xs text-[#9aaba4] hover:text-[#5a6b63] transition-colors flex items-center gap-1.5"
          title="Start over"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          New draft
        </button>

        {community && (
          <>
            <span className="text-[#e0dbd3] text-xs">·</span>
            <span className="text-xs font-medium text-[#5a6b63] truncate max-w-[180px]">{community.displayName}</span>
          </>
        )}

        {fields?.subject && (
          <>
            <span className="text-[#e0dbd3] text-xs hidden sm:inline">·</span>
            <span className="text-xs text-[#9aaba4] truncate max-w-[240px] hidden sm:inline">{fields.subject}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/communities"
          className="text-xs text-[#9aaba4] hover:text-[#1F4538] transition-colors px-2 py-1 rounded"
        >
          Communities
        </Link>
        <span className="text-[#e0dbd3] text-xs">|</span>

        {pushResult && !pushError && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Pushed to HubSpot
            <button onClick={dismissPushResult} className="ml-1 text-emerald-500 hover:text-emerald-700">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {pushError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 max-w-[220px] truncate" title={pushError}>
            {pushError}
          </div>
        )}

        <button
          onClick={save}
          disabled={isSaving}
          className="text-xs font-medium text-[#5a6b63] hover:text-[#1F4538] border border-[#ddd8d0] hover:border-[#1F4538]/40 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 bg-white"
        >
          {isSaving ? "Saving…" : "Save draft"}
        </button>

        <button
          onClick={push}
          disabled={isPushing}
          className="text-xs font-semibold text-white bg-[#1F4538] hover:bg-[#173829] rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {isPushing ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6"/></svg>
              Pushing…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Push to HubSpot
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function EditorLayout() {
  const [previewWidth, setPreviewWidth] = useState<"half" | "full">("half");

  return (
    <div className="h-screen flex flex-col bg-[#f5f3ef]">
      <TopBar />

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
          {/* Preview toolbar */}
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

          {/* Preview iframe container */}
          <div className="flex-1 overflow-y-auto bg-[#e8e3dc] flex justify-center py-6 px-4">
            <div className="w-full max-w-[640px] shadow-xl rounded-lg overflow-hidden">
              <PreviewPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
