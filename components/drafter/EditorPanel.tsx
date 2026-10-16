"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import type { EditorSection } from "@/context/DraftContext";
import SubjectSection from "./sections/SubjectSection";
import HeroSection from "./sections/HeroSection";
import StorySection from "./sections/StorySection";
import ImagesSection from "./sections/ImagesSection";
import CtaSection from "./sections/CtaSection";

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


// ── Main EditorPanel ──────────────────────────────────────────────────────────

export default function EditorPanel() {
  const { activeSection, setActiveSection, fields } = useDraft();

  if (!fields) return null;

  // The tab and the section are now the same thing. They used to be kept
  // apart because the AI was a tab as well, and opening it had to leave the
  // section underneath alone; the AI lives under the preview now, so there is
  // nothing left to hold apart.
  const sectionComponent = ({
    subject: <SubjectSection />,
    hero: <HeroSection />,
    story: <StorySection />,
    images: <ImagesSection />,
    cta: <CtaSection />,
  } as Record<EditorSection, React.ReactNode>)[activeSection];

  return (
    <div className="h-full flex flex-col bg-[#faf9f6] border-r border-[#e8e3dc]">
      {/* Tab bar */}
      <div className="flex border-b border-[#e8e3dc] bg-white shrink-0">
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={[
              "flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors",
              activeSection === tab.id
                ? "text-[#1F4538] border-b-2 border-[#1F4538]"
                : "text-[#9aaba4] hover:text-[#5a6b63]",
            ].join(" ")}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="eb-scroll flex-1 overflow-y-auto">
        <div className="p-5">{sectionComponent}</div>
      </div>

    </div>
  );
}
