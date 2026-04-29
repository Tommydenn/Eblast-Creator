// Subject Specialist surface. Renders the winner + alternatives + the
// specialist's reasoning. Each alternative is one click away from being
// swapped in (sends a refinement instruction through the existing pipe).

"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, SectionLabel } from "./ui/Card";
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
  "drafter-original": "Drafter's original",
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
  return (
    <Card className="eb-rise border-l-4 border-l-clay-500">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Subject specialist</CardTitle>
          <Badge variant="warning">{1 + specialist.alternatives.length} candidates</Badge>
        </div>
        <CardDescription>{specialist.chosenRationale}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <SectionLabel className="mb-0">Winner · in use</SectionLabel>
            <Badge variant="success">{APPROACH_LABEL[specialist.winner.approach] ?? specialist.winner.approach}</Badge>
            <span className="text-[10px] text-sand-400 tabular-nums">{specialist.winner.charCount} chars</span>
          </div>
          <div className="rounded-md border border-forest-200 bg-forest-50/40 p-3">
            <p className="text-sm font-medium text-sand-900">{specialist.winner.subject}</p>
            <p className="mt-1 text-xs text-sand-600">{specialist.winner.previewText}</p>
            <p className="mt-2 text-xs italic text-sand-500">{specialist.winner.rationale}</p>
          </div>
        </div>

        {specialist.alternatives.length > 0 && (
          <div>
            <SectionLabel className="mb-2">Strong alternatives · click to swap</SectionLabel>
            <ul className="space-y-2">
              {specialist.alternatives.map((alt, i) => {
                const isCurrent = alt.subject === currentSubject;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => onPickAlternative(alt.subject, alt.previewText)}
                      disabled={isCurrent}
                      className={`group block w-full rounded-md border p-3 text-left transition-colors ${
                        isCurrent
                          ? "cursor-default border-forest-200 bg-forest-50/40"
                          : "border-sand-200 bg-white hover:border-clay-300 hover:bg-clay-50/40"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline">{APPROACH_LABEL[alt.approach] ?? alt.approach}</Badge>
                        <span className="text-[10px] text-sand-400 tabular-nums">{alt.charCount} chars</span>
                        {isCurrent && (
                          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-forest-700">
                            in use
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-sand-900">{alt.subject}</p>
                      <p className="mt-0.5 text-xs text-sand-600">{alt.previewText}</p>
                      <p className="mt-1.5 text-xs italic text-sand-500">{alt.rationale}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
