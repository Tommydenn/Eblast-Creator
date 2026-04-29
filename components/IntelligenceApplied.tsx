// Post-draft "what the agents actually used" panel. Shown in the reviewer
// sidebar after the loop converges. Three sections:
//   1. Drafter's own rationale — 1-2 sentences from the drafter explaining
//      which patterns/rules it applied.
//   2. Past sends in context — the slim list shown to the agents this round.
//   3. Send-strategy findings — pulled out of the general findings list
//      because they cite past performance directly.

import { Card, CardContent, CardHeader, CardTitle, CardDescription, SectionLabel } from "./ui/Card";
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
    | "voice"
    | "brand"
    | "field_completeness"
    | "subject_line"
    | "preview_text"
    | "cta"
    | "structure"
    | "compliance"
    | "send_strategy"
    | "image_quality"
    | "craft";
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
  const sendStrategyFindings = (findings ?? []).filter((f) => f.category === "send_strategy");
  const craftFindings = (findings ?? []).filter((f) => f.category === "craft");
  const hasAnything =
    !!drafterRationale ||
    (pastSends && pastSends.length > 0) ||
    sendStrategyFindings.length > 0 ||
    craftFindings.length > 0;

  if (!hasAnything) return null;

  return (
    <Card className="eb-rise border-l-4 border-l-forest-600">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Intelligence applied</CardTitle>
          <Badge variant="success">Memory · Past sends</Badge>
        </div>
        <CardDescription>How prior eblasts shaped this draft.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {drafterRationale && (
          <div>
            <SectionLabel className="mb-1.5">Drafter rationale</SectionLabel>
            <p className="rounded-md border border-forest-200 bg-forest-50/40 px-3 py-2.5 text-sm leading-relaxed text-sand-800">
              {drafterRationale}
            </p>
          </div>
        )}

        {craftFindings.length > 0 && (
          <FindingGroup
            label="Craft elevation"
            sublabel="Where this draft can be sharpened toward best-in-class."
            categoryLabel="craft"
            findings={craftFindings}
          />
        )}

        {sendStrategyFindings.length > 0 && (
          <FindingGroup
            label="Performance signals from history"
            sublabel="What the critic noticed against this community's track record."
            categoryLabel="send strategy"
            findings={sendStrategyFindings}
          />
        )}

        {pastSends && pastSends.length > 0 && (
          <div>
            <SectionLabel className="mb-1.5">
              Past sends seen by the agents · {pastSends.length}
            </SectionLabel>
            <ul className="divide-y divide-sand-100 rounded-md border border-sand-200">
              {pastSends.slice(0, 8).map((s, i) => (
                <li key={i} className="px-3 py-2 text-xs leading-snug">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sand-900" title={s.subject}>
                        {s.subject}
                      </p>
                      <p className="mt-0.5 text-[11px] text-sand-500">
                        {s.sentAt ?? "(no date)"}
                        {s.fromName ? ` · ${s.fromName}` : ""}
                      </p>
                    </div>
                    {s.openRatePct !== null && (
                      <span
                        className={`shrink-0 tabular-nums text-xs font-medium ${
                          s.openRatePct >= 40
                            ? "text-forest-700"
                            : s.openRatePct >= 25
                            ? "text-sand-700"
                            : "text-clay-700"
                        }`}
                      >
                        {s.openRatePct}%
                      </span>
                    )}
                  </div>
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
      </CardContent>
    </Card>
  );
}

function FindingGroup({
  label,
  sublabel,
  categoryLabel,
  findings,
}: {
  label: string;
  sublabel?: string;
  categoryLabel: string;
  findings: CriticFinding[];
}) {
  return (
    <div>
      <SectionLabel className="mb-0.5">{label}</SectionLabel>
      {sublabel && <p className="mb-2 text-[11px] text-sand-500">{sublabel}</p>}
      <ul className="space-y-2">
        {findings.map((f, i) => (
          <li key={i} className="rounded-md border border-sand-200 bg-white p-3">
            <div className="mb-1 flex items-center gap-2">
              <Badge
                variant={
                  f.severity === "blocker"
                    ? "danger"
                    : f.severity === "important"
                    ? "warning"
                    : "neutral"
                }
              >
                {f.severity === "blocker"
                  ? "Blocker"
                  : f.severity === "important"
                  ? "Important"
                  : "Polish"}
              </Badge>
              <span className="text-[10px] uppercase tracking-[0.12em] text-sand-500">{categoryLabel}</span>
              {f.field && <span className="text-[10px] text-sand-400">· {f.field}</span>}
            </div>
            <p className="text-sm text-sand-900">{f.issue}</p>
            {f.suggestion && (
              <p className="mt-1.5 rounded border border-dashed border-clay-300 bg-clay-50/40 px-2 py-1.5 text-xs leading-relaxed text-sand-800">
                → {f.suggestion}
              </p>
            )}
            {f.rationale && (
              <p className="mt-1.5 text-xs italic leading-relaxed text-sand-500">{f.rationale}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
