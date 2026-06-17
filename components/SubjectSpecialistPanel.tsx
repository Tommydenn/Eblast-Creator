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
  const total = 1 + specialist.alternatives.length;

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
          <p className="text-xs leading-relaxed text-sand-600">{specialist.chosenRationale}</p>

          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">
              Current subject line
            </p>
            <div className="rounded-md border border-forest-200 bg-forest-50/40 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge variant="outline">
                  {APPROACH_LABEL[specialist.winner.approach] ?? specialist.winner.approach}
                </Badge>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-forest-700">In use</span>
              </div>
              <p className="text-sm font-medium text-sand-900">{specialist.winner.subject}</p>
              <p className="mt-1 text-xs text-sand-600">{specialist.winner.previewText}</p>
            </div>
          </div>

          {specialist.alternatives.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">
                Alternatives — click to swap
              </p>
              <ul className="space-y-2">
                {specialist.alternatives.map((alt, i) => {
                  const isCurrent = alt.subject === currentSubject;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => onPickAlternative(alt.subject, alt.previewText)}
                        disabled={isCurrent}
                        className={`block w-full rounded-md border p-3 text-left transition-colors ${
                          isCurrent
                            ? "cursor-default border-forest-200 bg-forest-50/40"
                            : "border-sand-200 bg-white hover:border-clay-300 hover:bg-clay-50/40"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <Badge variant="outline">
                            {APPROACH_LABEL[alt.approach] ?? alt.approach}
                          </Badge>
                          {isCurrent && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-forest-700">
                              in use
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-sand-900">{alt.subject}</p>
                        <p className="mt-0.5 text-xs text-sand-500">{alt.previewText}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
