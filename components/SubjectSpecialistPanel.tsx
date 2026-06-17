"use client";

import { useState } from "react";
import { Badge } from "./ui/Badge";

interface SubjectCandidate {
  subject: string;
  previewText: string;
  approach: string;
  charCount: number;
  rationale: string;
}

interface SubjectSpecialistResult {
  winner: SubjectCandidate;
  alternatives: SubjectCandidate[];
  chosenRationale: string;
}

const APPROACH_LABEL: Record<string, string> = {
  "specificity-led": "Specificity",
  "time-led": "Time-led",
  "question": "Question",
  "surprise": "Surprise",
  "benefit-led": "Benefit",
  "story-tease": "Story",
  "warmth-led": "Warmth",
  "data-led": "Data",
  "drafter-original": "Original",
};

export function SubjectSpecialistPanel({
  specialist,
  currentSubject,
  onPickAlternative,
}: {
  specialist: SubjectSpecialistResult;
  currentSubject: string;
  onPickAlternative: (subject: string, previewText: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Flatten all candidates — winner first, then alternatives.
  // "Recommended" badge follows the specialist's winner regardless of which is in use.
  // "In use" badge tracks currentSubject.
  const allCandidates = [specialist.winner, ...specialist.alternatives];
  const total = allCandidates.length;
  const inUseSubject = currentSubject;

  return (
    <div className="rounded-lg border border-sand-200 bg-white shadow-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2.5">
          <span className="font-serif text-base font-medium text-sand-900">Subject specialist</span>
          <Badge variant="warning">{total} candidates</Badge>
        </div>
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 shrink-0 text-sand-300 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4 border-t border-sand-200 px-5 pb-5 pt-4">
          {specialist.chosenRationale && (
            <p className="text-xs leading-relaxed text-sand-600">{specialist.chosenRationale}</p>
          )}

          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">
              All candidates — click any to use it
            </p>
            <ul className="space-y-2">
              {allCandidates.map((c, i) => {
                const isInUse = c.subject === inUseSubject;
                const isRecommended = i === 0; // winner is always first
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => !isInUse && onPickAlternative(c.subject, c.previewText)}
                      disabled={isInUse}
                      className={`block w-full rounded-md border p-3 text-left transition-colors ${
                        isInUse
                          ? "cursor-default border-forest-200 bg-forest-50/50"
                          : "border-sand-200 bg-white hover:border-clay-300 hover:bg-clay-50/30"
                      }`}
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">
                          {APPROACH_LABEL[c.approach] ?? c.approach}
                        </Badge>
                        {isRecommended && (
                          <Badge variant="neutral">Specialist pick</Badge>
                        )}
                        {isInUse && (
                          <Badge variant="success">In use</Badge>
                        )}
                      </div>
                      <p className={`text-sm ${isInUse ? "font-semibold text-sand-900" : "text-sand-800"}`}>
                        {c.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-sand-500">{c.previewText}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
