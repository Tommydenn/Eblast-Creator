"use client";

import React, { useState, useEffect, useRef } from "react";
import { useDraft } from "@/context/DraftContext";
import type { EditorSection } from "@/context/DraftContext";
import SubjectSection from "./sections/SubjectSection";
import HeroSection from "./sections/HeroSection";
import StorySection from "./sections/StorySection";
import ImagesSection from "./sections/ImagesSection";
import CtaSection from "./sections/CtaSection";
import ApprovalModal from "./ApprovalModal";

type LocalTab = EditorSection | "ai";

const SECTION_TABS: Array<{ id: EditorSection; label: string; icon: React.ReactNode }> = [
  {
    id: "subject",
    label: "Subject",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  },
  {
    id: "hero",
    label: "Hero",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  },
  {
    id: "story",
    label: "Story",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/></svg>,
  },
  {
    id: "images",
    label: "Images",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>,
  },
  {
    id: "cta",
    label: "Footer",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>,
  },
];

const AI_TAB = {
  id: "ai" as const,
  label: "AI",
  icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  ),
};

// ── AI Review panel ───────────────────────────────────────────────────────────

function ReviewPanel() {
  const { review } = useDraft();
  if (!review) return null;
  const [open, setOpen] = useState(true);

  const verdictColor = {
    ready: "text-emerald-700 bg-emerald-50 border-emerald-200",
    needs_revision: "text-amber-700 bg-amber-50 border-amber-200",
    blocking_issues: "text-red-700 bg-red-50 border-red-200",
  }[review.verdict] ?? "text-[#5a6b63] bg-[#f0f5f2] border-[#c8d8d0]";

  const blockers = review.findings.filter((f) => f.severity === "blocker");
  const important = review.findings.filter((f) => f.severity === "important");

  return (
    <div className="rounded-xl border border-[#e8e3dc] bg-white overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#faf9f6] transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">Review results</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${verdictColor}`}>
            {review.verdict.replace("_", " ")}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9aaba4" strokeWidth="2" className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-[#f0ede7]">
          {review.summary && <p className="text-xs text-[#5a6b63] leading-relaxed pt-3">{review.summary}</p>}
          {[...blockers, ...important].map((f, i) => (
            <div key={i} className={`rounded-lg p-2.5 text-xs ${f.severity === "blocker" ? "bg-red-50 border border-red-100" : "bg-amber-50 border border-amber-100"}`}>
              <p className={`font-semibold ${f.severity === "blocker" ? "text-red-700" : "text-amber-700"}`}>{f.issue}</p>
              {f.suggestion && <p className="text-[#5a6b63] mt-0.5">{f.suggestion}</p>}
            </div>
          ))}
          {review.sendTimeRecommendation && (
            <p className="text-xs text-[#7a8c85] italic pt-1">Send: {review.sendTimeRecommendation}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── AI Refine panel ───────────────────────────────────────────────────────────

function RefinePanel() {
  const { refine, isRefining, refineError, canUndo, canRedo, undo, redo, lastRefineInstruction } = useDraft();
  const [instruction, setInstruction] = useState("");
  const [refineHistory, setRefineHistory] = useState<Array<{ instruction: string }>>([]);

  async function handleRefine() {
    if (!instruction.trim() || isRefining) return;
    const inst = instruction.trim();
    setInstruction("");
    await refine(inst);
    setRefineHistory((prev) => [{ instruction: inst }, ...prev.slice(0, 9)]);
  }

  return (
    <div className="rounded-xl border border-[#e8e3dc] bg-white overflow-hidden">
      <div className="px-4 pt-4 pb-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">Refine with AI</p>

        <div className="flex gap-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
            rows={2}
            disabled={isRefining}
            placeholder="e.g. Make the headline more urgent, shorten the body…"
            className="flex-1 rounded-lg border border-[#ddd8d0] bg-[#faf9f6] px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] resize-none disabled:opacity-50"
          />
          <button
            onClick={handleRefine}
            disabled={!instruction.trim() || isRefining}
            className="self-end rounded-lg bg-[#1F4538] text-white text-xs font-semibold px-3 py-2 hover:bg-[#173829] transition-colors disabled:opacity-40"
          >
            {isRefining ? (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10"/>
              </svg>
            ) : "Go"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="text-xs text-[#7a8c85] hover:text-[#1F4538] disabled:opacity-30 transition-colors flex items-center gap-1"
            title={lastRefineInstruction ? `Undo: ${lastRefineInstruction}` : "Nothing to undo"}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h11a5 5 0 0 1 0 10H3"/><polyline points="7 3 3 7 7 11"/></svg>
            Undo
          </button>
          <span className="text-[#e0dbd3] text-xs">|</span>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="text-xs text-[#7a8c85] hover:text-[#1F4538] disabled:opacity-30 transition-colors flex items-center gap-1"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7H10a5 5 0 0 0 0 10h11"/><polyline points="17 3 21 7 17 11"/></svg>
            Redo
          </button>
        </div>

        {refineError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">{refineError}</div>
        )}

        {refineHistory.length > 0 && (
          <div className="pt-1 space-y-1 border-t border-[#f0ede7]">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[#b0a89f] pt-1">Recent</p>
            {refineHistory.slice(0, 3).map((h, i) => (
              <div key={i} className="text-xs text-[#9aaba4] truncate">↳ {h.instruction}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main EditorPanel ──────────────────────────────────────────────────────────

export default function EditorPanel() {
  const { activeSection, setActiveSection, fields, isSaved, saveNotice } = useDraft();
  const [localTab, setLocalTab] = useState<LocalTab>(activeSection);
  const [approvalOpen, setApprovalOpen] = useState(false);

  // Sync localTab → context when the user selects a real section tab
  const localTabRef = useRef(localTab);
  localTabRef.current = localTab;
  useEffect(() => {
    if (localTab !== "ai") setActiveSection(localTab as EditorSection);
  }, [localTab, setActiveSection]);

  // Sync context → localTab when the preview sends a section click (only if not on AI tab)
  useEffect(() => {
    if (localTabRef.current !== "ai" && activeSection !== localTabRef.current) {
      setLocalTab(activeSection);
    }
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!fields) return null;

  const sectionComponent = localTab === "ai" ? null : ({
    subject: <SubjectSection />,
    hero: <HeroSection />,
    story: <StorySection />,
    images: <ImagesSection />,
    cta: <CtaSection />,
  } as Record<EditorSection, React.ReactNode>)[localTab as EditorSection];

  const allTabs = [...SECTION_TABS, AI_TAB];

  return (
    <div className="h-full flex flex-col bg-[#faf9f6] border-r border-[#e8e3dc]">
      {/* Tab bar */}
      <div className="flex border-b border-[#e8e3dc] bg-white shrink-0">
        {allTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setLocalTab(tab.id as LocalTab)}
            className={[
              "flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors",
              localTab === tab.id
                ? tab.id === "ai"
                  ? "text-[#1F4538] border-b-2 border-[#1F4538] bg-[#f0f5f2]"
                  : "text-[#1F4538] border-b-2 border-[#1F4538]"
                : "text-[#9aaba4] hover:text-[#5a6b63]",
            ].join(" ")}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {localTab === "ai" ? (
          <div className="p-4 space-y-3">
            <RefinePanel />
            <ReviewPanel />
            {!isSaved && (
              <button
                onClick={() => setApprovalOpen(true)}
                className="w-full text-left text-xs text-[#7a8c85] hover:text-[#1F4538] transition-colors py-1"
              >
                Send for approval →
              </button>
            )}
            {saveNotice && (
              <div className="text-xs text-emerald-700 font-medium">{saveNotice}</div>
            )}
          </div>
        ) : (
          <div className="p-5">
            {sectionComponent}
          </div>
        )}
      </div>

      {approvalOpen && <ApprovalModal onClose={() => setApprovalOpen(false)} />}
    </div>
  );
}
