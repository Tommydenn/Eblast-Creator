"use client";

import { useState } from "react";
import { Badge } from "./ui/Badge";

interface PastSend {
  subject: string;
  sentAt: string | null;
  recipientCount: number | null;
  openCount: number | null;
  openRatePct: number | null;
  clickRatePct: number | null;
  fromName: string | null;
}

interface CriticFinding {
  severity: "blocker" | "important" | "nice_to_have";
  category:
    | "voice" | "brand" | "field_completeness" | "subject_line" | "preview_text"
    | "cta" | "structure" | "compliance" | "send_strategy" | "image_quality" | "craft";
  field?: string;
  issue: string;
  suggestion?: string;
  rationale: string;
}

export interface IntelligenceAppliedProps {
  drafterRationale?: string;
  pastSends?: PastSend[];
  findings?: CriticFinding[];
}

export function IntelligenceApplied({ drafterRationale, pastSends, findings }: IntelligenceAppliedProps) {
  const [open, setOpen] = useState(false);

  const sendStrategyFindings = (findings ?? []).filter((f) => f.category === "send_strategy");
  const craftFindings = (findings ?? []).filter((f) => f.category === "craft");
  const hasAnything =
    !!drafterRationale ||
    (pastSends && pastSends.length > 0) ||
    sendStrategyFindings.length > 0 ||
    craftFindings.length > 0;

  if (!hasAnything) return null;

  return (
    <div className="rounded-lg border border-sand-200 bg-white shadow-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2.5">
          <span className="font-serif text-base font-medium text-sand-900">Intelligence applied</span>
          <Badge variant="success">Memory · Past sends</Badge>
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
        <div className="space-y-5 border-t border-sand-200 px-5 pb-5 pt-4">
          {drafterRationale && (
            <div>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">
                Why this draft was written this way
              </p>
              <p className="rounded-md border border-forest-200 bg-forest-50/50 px-3 py-2.5 text-sm leading-relaxed text-sand-800">
                {drafterRationale}
              </p>
            </div>
          )}

          {sendStrategyFindings.length > 0 && (
            <div>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">
                What history influenced
              </p>
              <ul className="space-y-1.5">
                {sendStrategyFindings.map((f, i) => (
                  <li key={i} className="rounded-md border border-sand-200 bg-sand-50/40 px-3 py-2">
                    <p className="text-xs font-medium text-sand-800">{f.issue}</p>
                    {f.suggestion && (
                      <p className="mt-1 text-xs text-sand-600">→ {f.suggestion}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {craftFindings.length > 0 && (
            <div>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">
                Polish suggestions
              </p>
              <ul className="space-y-1.5">
                {craftFindings.map((f, i) => (
                  <li key={i} className="rounded-md border border-sand-200 bg-sand-50/40 px-3 py-2">
                    <p className="text-xs font-medium text-sand-800">{f.issue}</p>
                    {f.suggestion && (
                      <p className="mt-1 text-xs text-sand-600">→ {f.suggestion}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pastSends && pastSends.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">
                Past sends seen by the agents ({pastSends.length})
              </p>
              <ul className="divide-y divide-sand-100 rounded-md border border-sand-200">
                {pastSends.slice(0, 8).map((s, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sand-900" title={s.subject}>{s.subject}</p>
                      <p className="mt-0.5 text-[11px] text-sand-500">
                        {s.sentAt ?? "no date"}{s.fromName ? ` · ${s.fromName}` : ""}
                      </p>
                    </div>
                    {s.openRatePct !== null && (
                      <span className={`shrink-0 tabular-nums text-xs font-semibold ${
                        s.openRatePct >= 40
                          ? "text-forest-700"
                          : s.openRatePct >= 25
                            ? "text-sand-700"
                            : "text-clay-700"
                      }`}>
                        {s.openRatePct}% open
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {pastSends.length > 8 && (
                <p className="mt-1 text-[11px] text-sand-500">
                  + {pastSends.length - 8} more in context
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
