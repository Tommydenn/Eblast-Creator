"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { CommunityIntelligence } from "@/components/CommunityIntelligence";
import { IntelligenceApplied } from "@/components/IntelligenceApplied";
import { SubjectSpecialistPanel } from "@/components/SubjectSpecialistPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, SectionLabel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";

interface Community {
  slug: string;
  displayName: string;
  shortName: string;
  type: string;
  brand: { primary: string; accent: string; background: string };
  senders: Array<{ id: string; name: string; email: string; isPrimary: boolean }>;
  hubspot: { listId?: number };
  trackingPhone?: string | null;
  templates: string[];
}

interface ExtractedFlyer {
  subject: string;
  previewText: string;
  eyebrow: string;
  headline: string;
  scriptSubheadline?: string;
  heroHook: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  storyEyebrow: string;
  storyScriptTitle?: string;
  bodyParagraphs: string[];
  pullQuoteEyebrow?: string;
  pullQuote?: string;
  pullQuoteAttribution?: string;
  ctaEyebrow: string;
  ctaHeadline: string;
  ctaSubline: string;
  ctaButtonLabel: string;
  ctaButtonHref: string;
  heroImageAlt: string;
  heroImageDescription: string;
  audienceHints: string[];
  drafterRationale?: string;
}

interface PastSendForContext {
  subject: string;
  sentAt: string | null;
  recipientCount: number | null;
  openCount: number | null;
  clickCount?: number | null;
  openRatePct: number | null;
  clickRatePct: number | null;
  fromName: string | null;
}

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

type Stage = "idle" | "drafting" | "preview" | "refining" | "pushing" | "done";

interface RefinementEntry {
  instruction: string;
  ok: boolean;
}

type ReviewVerdict = "ready" | "needs_revision" | "blocking_issues";
type FindingSeverity = "blocker" | "important" | "nice_to_have";
type FindingCategory =
  | "voice"
  | "brand"
  | "field_completeness"
  | "subject_line"
  | "preview_text"
  | "cta"
  | "structure"
  | "compliance"
  | "send_strategy"
  | "image_quality";

interface CriticFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  field?: string;
  issue: string;
  suggestion?: string;
  rationale: string;
}

interface DraftReview {
  verdict: ReviewVerdict;
  summary: string;
  findings: CriticFinding[];
  subjectLineAlternatives?: string[];
  sendTimeRecommendation?: string;
  recipientListNote?: string;
}

type StopReason = "ready" | "max_iterations" | "no_progress" | "regressed";

interface AgentLoopIterationSummary {
  round: number;
  verdict: ReviewVerdict;
  summary: string;
  findingsCount: number;
  appliedSuggestions: string[];
  droppedImageSlots: string[];
}

interface AgentLoopSummary {
  stoppedReason: StopReason;
  totalRounds: number;
  imagesExcluded: number;
  iterations: AgentLoopIterationSummary[];
}

const verdictBadge: Record<ReviewVerdict, { label: string; variant: "success" | "warning" | "danger" }> = {
  ready: { label: "Ready to push", variant: "success" },
  needs_revision: { label: "Needs revision", variant: "warning" },
  blocking_issues: { label: "Blocking issues", variant: "danger" },
};

const severityBadge: Record<FindingSeverity, { label: string; variant: "danger" | "warning" | "neutral" }> = {
  blocker: { label: "Blocker", variant: "danger" },
  important: { label: "Important", variant: "warning" },
  nice_to_have: { label: "Polish", variant: "neutral" },
};

export default function Home() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [pdf, setPdf] = useState<File | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [extracted, setExtracted] = useState<ExtractedFlyer | null>(null);
  const [html, setHtml] = useState<string>("");
  const [heroImageUrl, setHeroImageUrl] = useState<string | undefined>();
  const [secondaryImageUrl, setSecondaryImageUrl] = useState<string | undefined>();
  const [galleryImageUrls, setGalleryImageUrls] = useState<string[]>([]);
  const [imageCount, setImageCount] = useState<number>(0);

  const [refineInput, setRefineInput] = useState("");
  const [refineHistory, setRefineHistory] = useState<RefinementEntry[]>([]);

  const [review, setReview] = useState<DraftReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [agentLoop, setAgentLoop] = useState<AgentLoopSummary | null>(null);

  const [pushResult, setPushResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  /** Past sends the agents saw — echoed back from /api/draft-from-pdf so we can show them in the post-draft sidebar. */
  const [pastSendsContext, setPastSendsContext] = useState<PastSendForContext[]>([]);
  /** Subject specialist's full output (winner + alternatives + reasoning). */
  const [subjectSpecialist, setSubjectSpecialist] = useState<SubjectSpecialistResult | null>(null);

  useEffect(() => {
    fetch("/api/communities")
      .then((r) => r.json())
      .then((d) => {
        setCommunities(d.communities);
        if (d.communities.length > 0) setSelectedSlug(d.communities[0].slug);
      });
  }, []);

  const selected = communities.find((c) => c.slug === selectedSlug);

  async function generateDraft() {
    if (!pdf || !selectedSlug) return;
    setStage("drafting");
    setError(null);
    setExtracted(null);
    setHtml("");
    setPushResult(null);
    setRefineHistory([]);
    setReview(null);
    setReviewError(null);
    setAgentLoop(null);
    setPastSendsContext([]);
    setSubjectSpecialist(null);

    const fd = new FormData();
    fd.append("file", pdf);
    fd.append("communitySlug", selectedSlug);

    try {
      const res = await fetch("/api/draft-from-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Draft failed");
        setStage("idle");
        return;
      }
      setExtracted(data.extracted);
      setHtml(data.html);
      setHeroImageUrl(data.heroImageUrl);
      setSecondaryImageUrl(data.secondaryImageUrl);
      setGalleryImageUrls(data.galleryImageUrls ?? []);
      setImageCount(data.imageCount ?? 0);
      setReview(data.review ?? null);
      setAgentLoop(data.agentLoop ?? null);
      setPastSendsContext(data.pastSendsContext ?? []);
      setSubjectSpecialist(data.subjectSpecialist ?? null);
      setStage("preview");
    } catch (e: any) {
      setError(String(e));
      setStage("idle");
    }
  }

  async function runReview(targetExtracted?: ExtractedFlyer, targetSlug?: string) {
    const flyer = targetExtracted ?? extracted;
    const slug = targetSlug ?? selectedSlug;
    if (!flyer || !slug) return;
    setReviewing(true);
    setReviewError(null);
    setReview(null);
    try {
      const res = await fetch("/api/critique-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted: flyer, communitySlug: slug }),
      });
      const data = await res.json();
      if (data.ok) setReview(data.review);
      else setReviewError(data.error ?? "Review failed");
    } catch (e: any) {
      setReviewError(String(e));
    } finally {
      setReviewing(false);
    }
  }

  async function refineDraft() {
    if (!extracted || !refineInput.trim() || !selectedSlug) return;
    const instruction = refineInput.trim();
    setStage("refining");
    setError(null);
    setRefineInput("");

    try {
      const res = await fetch("/api/refine-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current: extracted,
          instruction,
          communitySlug: selectedSlug,
          heroImageUrl,
          secondaryImageUrl,
          galleryImageUrls,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Refinement failed");
        setRefineHistory((h) => [...h, { instruction, ok: false }]);
        setStage("preview");
        return;
      }
      setExtracted(data.extracted);
      setHtml(data.html);
      setRefineHistory((h) => [...h, { instruction, ok: true }]);
      setStage("preview");
      runReview(data.extracted, selectedSlug);
    } catch (e: any) {
      setError(String(e));
      setRefineHistory((h) => [...h, { instruction, ok: false }]);
      setStage("preview");
    }
  }

  async function pushDraft() {
    if (!extracted || !html || !selectedSlug) return;
    setStage("pushing");
    setError(null);

    try {
      const res = await fetch("/api/push-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communitySlug: selectedSlug,
          subject: extracted.subject,
          previewText: extracted.previewText,
          html,
        }),
      });
      const data = await res.json();
      setPushResult(data);
      setStage("done");
    } catch (e: any) {
      setError(String(e));
      setStage("preview");
    }
  }

  return (
    <>
      <Header active="drafter" />
      <main className="mx-auto max-w-[1240px] px-6 pb-24 pt-10">
        {/* Page intro */}
        <div className="mb-8 max-w-3xl">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-clay-600">Drafter</p>
          <h1 className="mt-1 font-serif text-[40px] leading-tight text-sand-900">
            Drop a flyer. The agents draft, critique, and converge.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-sand-600">
            Upload one PDF. The drafter writes from the community's brand guide and the last 365 days of
            performance data. The critic reviews — including the actual images — and pushes back until the
            draft is ready. You see the preview only after they agree.
          </p>
        </div>

        {/* Two-column layout: inputs+intelligence on the left, agent activity feeds in below */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Inputs */}
          <Card className="eb-rise">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Generate eblast</CardTitle>
                <Badge variant="outline">Step 1</Badge>
              </div>
              <CardDescription>Pick a community and upload the flyer PDF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="community">Community</Label>
                <Select id="community" value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}>
                  {communities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.displayName}
                    </option>
                  ))}
                </Select>
              </div>

              {selected && (
                <div className="grid grid-cols-3 gap-3 rounded-md border border-sand-200 bg-sand-50/60 p-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-sand-500">Sender</p>
                    <p className="mt-0.5 text-xs font-medium text-sand-900 truncate">
                      {selected.senders[0]?.name ?? <span className="text-clay-600">none</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-sand-500">List ID</p>
                    <p className="mt-0.5 text-xs font-medium text-sand-900">
                      {selected.hubspot.listId ?? <span className="text-clay-600">not set</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-sand-500">Tracking #</p>
                    <p className="mt-0.5 text-xs font-medium text-sand-900 tabular-nums">
                      {selected.trackingPhone ?? <span className="text-clay-600">not set</span>}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="pdf">Flyer PDF</Label>
                <Input
                  id="pdf"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                  className="h-auto py-2 file:mr-3 file:rounded file:border-0 file:bg-sand-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-sand-700 hover:file:bg-sand-200"
                />
              </div>

              <Button
                onClick={generateDraft}
                disabled={!pdf || !selectedSlug || stage === "drafting"}
                loading={stage === "drafting"}
                size="lg"
                className="w-full"
              >
                {stage === "drafting" ? "Drafter & critic working…" : "Generate eblast draft"}
              </Button>

              {stage === "drafting" && (
                <div className="rounded-md border border-sand-200 bg-sand-50/60 p-3 text-xs leading-relaxed text-sand-600">
                  <p className="eb-fade-pulse">
                    Drafter reading the flyer and pulling images. Critic reviewing each round — if it flags issues,
                    drafter applies the fixes and the critic re-reviews. Up to 3 rounds.
                  </p>
                  <p className="mt-2 text-[11px] text-sand-500">Typically 30–90 seconds.</p>
                </div>
              )}

              {error && (
                <div className="rounded-md border border-clay-200 bg-clay-50/60 px-3 py-2.5 text-xs text-clay-700">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Intelligence */}
          {selectedSlug && <CommunityIntelligence communitySlug={selectedSlug} />}
        </div>

        {/* Preview + reviewer */}
        {extracted && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
            {/* Reviewer + refine + push column */}
            <div className="flex flex-col gap-5">
              {/* Reviewer card */}
              <Card className="eb-rise">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Reviewer</CardTitle>
                    {review && (
                      <Badge variant={verdictBadge[review.verdict].variant}>
                        {verdictBadge[review.verdict].label}
                      </Badge>
                    )}
                  </div>
                  {agentLoop && (
                    <CardDescription>
                      Agents converged in {agentLoop.totalRounds} round{agentLoop.totalRounds === 1 ? "" : "s"}
                      {agentLoop.imagesExcluded > 0 && (
                        <>
                          {" · "}
                          <span className="text-clay-600">{agentLoop.imagesExcluded} image{agentLoop.imagesExcluded === 1 ? "" : "s"} dropped</span>
                        </>
                      )}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {reviewing && !review && (
                    <p className="eb-fade-pulse text-sm text-sand-600">Re-reviewing the refined draft…</p>
                  )}
                  {reviewError && (
                    <div className="rounded-md border border-clay-200 bg-clay-50 px-3 py-2 text-xs text-clay-700">
                      {reviewError}
                    </div>
                  )}

                  {review && (
                    <>
                      <p className="text-sm leading-relaxed text-sand-800">{review.summary}</p>

                      {agentLoop && agentLoop.iterations.length > 1 && (
                        <details className="group rounded-md border border-sand-200 bg-sand-50/60 px-3 py-2">
                          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.12em] text-sand-600 group-open:text-sand-900">
                            How they got here · {agentLoop.totalRounds} rounds
                          </summary>
                          <ol className="mt-3 space-y-3 text-xs text-sand-700">
                            {agentLoop.iterations.map((it) => (
                              <li key={it.round} className="space-y-1">
                                <p className="text-sand-900">
                                  <span className="font-medium">Round {it.round}:</span>{" "}
                                  <span className="italic text-sand-600">
                                    {it.verdict.replace(/_/g, " ")}, {it.findingsCount} finding{it.findingsCount === 1 ? "" : "s"}
                                  </span>
                                </p>
                                {it.droppedImageSlots.length > 0 && (
                                  <p className="text-clay-700">↳ Dropped: {it.droppedImageSlots.join("; ")}</p>
                                )}
                                {it.appliedSuggestions.length > 0 && (
                                  <ul className="ml-4 list-disc space-y-0.5 text-sand-600">
                                    {it.appliedSuggestions.map((s, i) => (
                                      <li key={i}>{s}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}

                      {review.findings.length === 0 ? (
                        <p className="rounded-md border border-dashed border-forest-200 bg-forest-50/50 px-3 py-2.5 text-xs text-forest-700">
                          No findings. Reviewer thinks this is clean.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {review.findings.map((f, i) => (
                            <li key={i} className="rounded-md border border-sand-200 bg-white p-3">
                              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                <Badge variant={severityBadge[f.severity].variant}>{severityBadge[f.severity].label}</Badge>
                                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-sand-500">
                                  {f.category.replace(/_/g, " ")}
                                </span>
                                {f.field && <span className="text-[10px] text-sand-400">· {f.field}</span>}
                              </div>
                              <p className="text-sm text-sand-900">{f.issue}</p>
                              {f.suggestion && (
                                <button
                                  onClick={() => setRefineInput(f.suggestion!)}
                                  title="Click to load this into the refine box"
                                  className="mt-2 w-full rounded border border-dashed border-clay-300 bg-clay-50/40 px-3 py-2 text-left text-xs leading-relaxed text-sand-800 hover:border-clay-400 hover:bg-clay-50/70"
                                >
                                  → {f.suggestion}
                                </button>
                              )}
                              <p className="mt-2 text-xs italic text-sand-500">{f.rationale}</p>
                            </li>
                          ))}
                        </ul>
                      )}

                      {review.subjectLineAlternatives && review.subjectLineAlternatives.length > 0 && (
                        <details className="rounded-md border border-sand-200 px-3 py-2">
                          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.12em] text-sand-600">
                            Alternative subject lines
                          </summary>
                          <ul className="mt-2 space-y-1.5">
                            {review.subjectLineAlternatives.map((alt, i) => (
                              <li key={i}>
                                <button
                                  onClick={() => setRefineInput(`Change the subject line to: "${alt}"`)}
                                  className="w-full rounded border border-dashed border-sand-300 px-3 py-2 text-left text-xs text-sand-700 hover:border-forest-400 hover:bg-forest-50/40"
                                >
                                  → {alt}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {review.sendTimeRecommendation && (
                        <div className="border-t border-sand-100 pt-3 text-xs leading-relaxed text-sand-600">
                          <span className="font-medium text-sand-800">Send-time hint:</span> {review.sendTimeRecommendation}
                        </div>
                      )}
                      {review.recipientListNote && (
                        <div className="text-xs text-clay-700">
                          <span className="font-medium">List:</span> {review.recipientListNote}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Subject specialist — winner + alternatives, click to swap */}
              {subjectSpecialist && (
                <SubjectSpecialistPanel
                  specialist={subjectSpecialist}
                  currentSubject={extracted.subject}
                  onPickAlternative={(subject, previewText) => {
                    setRefineInput(
                      `Change the subject line to: "${subject}" and the preview text to: "${previewText}"`,
                    );
                  }}
                />
              )}

              {/* Intelligence applied — what past sends actually shaped this draft */}
              <IntelligenceApplied
                drafterRationale={extracted.drafterRationale}
                pastSends={pastSendsContext}
                findings={review?.findings}
              />

              {/* Refine */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Refine with a prompt</CardTitle>
                  <CardDescription>e.g. "tighten the headline", "less salesy", "swap the CTA to call".</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={refineInput}
                    onChange={(e) => setRefineInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey)) refineDraft();
                    }}
                    placeholder="What should change?"
                    rows={3}
                    disabled={stage === "refining"}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      onClick={refineDraft}
                      disabled={!refineInput.trim() || stage === "refining"}
                      loading={stage === "refining"}
                      variant="secondary"
                      size="sm"
                    >
                      {stage === "refining" ? "Refining…" : "Apply change"}
                    </Button>
                    {refineHistory.length > 0 && (
                      <span className="text-[11px] text-sand-500">
                        {refineHistory.length} refinement{refineHistory.length === 1 ? "" : "s"} applied
                      </span>
                    )}
                  </div>
                  {refineHistory.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.12em] text-sand-500">
                        History
                      </summary>
                      <ol className="mt-2 list-decimal pl-5 text-xs leading-relaxed text-sand-600">
                        {refineHistory.map((r, i) => (
                          <li key={i} className={r.ok ? "" : "text-clay-700"}>
                            {r.instruction}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </CardContent>
              </Card>

              {/* Push */}
              <Button
                onClick={pushDraft}
                disabled={stage === "pushing"}
                loading={stage === "pushing"}
                size="lg"
                variant="primary"
                className="bg-clay-500 hover:bg-clay-600 active:bg-clay-700"
              >
                {stage === "pushing" ? "Pushing to HubSpot…" : "Push draft to HubSpot"}
              </Button>
            </div>

            {/* Preview pane */}
            <Card className="eb-rise overflow-hidden p-0">
              <CardHeader className="flex flex-row items-center justify-between border-b border-sand-200 bg-sand-50/50">
                <div>
                  <CardTitle className="text-base">Email preview</CardTitle>
                  <CardDescription>
                    Subject:{" "}
                    <span className="text-sand-900 font-medium">{extracted.subject}</span>
                    {imageCount > 0 && (
                      <span className="ml-2 text-sand-500">· {imageCount} image{imageCount === 1 ? "" : "s"} extracted</span>
                    )}
                  </CardDescription>
                </div>
                {stage === "refining" && (
                  <p className="eb-pulse-row text-sand-500">
                    <span className="eb-pulse-dot" />
                    <span className="eb-pulse-dot" />
                    <span className="eb-pulse-dot" />
                  </p>
                )}
              </CardHeader>
              <CardContent className="p-3">
                <iframe
                  srcDoc={html}
                  className="block h-[820px] w-full rounded-sm border-0 bg-white transition-opacity duration-200"
                  style={{ opacity: stage === "refining" ? 0.55 : 1 }}
                  title="Email preview"
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Push result */}
        {pushResult && (
          <div className="mt-8">
            <div
              className={`rounded-md border-l-4 px-4 py-3 ${
                pushResult.ok
                  ? "border-forest-600 bg-forest-50/60"
                  : "border-clay-600 bg-clay-50/60"
              }`}
            >
              <p className="font-medium text-sand-900">
                {pushResult.ok ? "Draft created in HubSpot" : "Push failed"}
              </p>
              {pushResult.summary?.emailId && (
                <p className="mt-1 text-xs text-sand-600">
                  {pushResult.summary.community} · ID <code className="rounded bg-sand-100 px-1 py-0.5 font-mono text-[11px]">{pushResult.summary.emailId}</code> · State{" "}
                  <code className="rounded bg-sand-100 px-1 py-0.5 font-mono text-[11px]">{pushResult.summary.state}</code>
                </p>
              )}
            </div>

            {!pushResult.ok && Array.isArray(pushResult.steps) && pushResult.steps.length > 0 && (
              <div className="mt-3 space-y-2">
                {pushResult.steps.map((s: any, i: number) => (
                  <details key={i} open={!s.ok} className="rounded-md border border-sand-200 bg-white">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-sand-800">
                      <span
                        className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${
                          s.ok ? "bg-forest-600" : "bg-clay-600"
                        }`}
                      />
                      Step {i + 1} · {s.step} · HTTP {s.status} {s.ok ? "OK" : "FAIL"}
                    </summary>
                    <pre className="overflow-auto rounded-b-md bg-sand-50 px-3 py-2 text-[10.5px] leading-relaxed text-sand-700">
                      {JSON.stringify(s.body, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
