"use client";

import { Header } from "@/components/Header";
import { CommunityIntelligence } from "@/components/CommunityIntelligence";
import { IntelligenceApplied } from "@/components/IntelligenceApplied";
import { SubjectSpecialistPanel } from "@/components/SubjectSpecialistPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import {
  useDraft,
  type FindingSeverity,
  type ReviewVerdict,
  type SavedDraft,
} from "@/context/DraftContext";

// ─── Display maps ─────────────────────────────────────────────────────────────

const verdictBadge: Record<ReviewVerdict, { label: string; variant: "success" | "warning" | "danger" }> = {
  ready: { label: "Ready", variant: "success" },
  needs_work: { label: "Needs work", variant: "warning" },
  major_revision: { label: "Major revision", variant: "danger" },
};

const severityBadge: Record<FindingSeverity, { label: string; variant: "danger" | "warning" | "neutral" }> = {
  blocker: { label: "Blocker", variant: "danger" },
  important: { label: "Important", variant: "warning" },
  nice_to_have: { label: "Polish", variant: "neutral" },
};

// ─── Saved Drafts Panel ───────────────────────────────────────────────────────

function SavedDraftsPanel({
  drafts,
  onLoad,
  onDelete,
}: {
  drafts: SavedDraft[];
  onLoad: (d: SavedDraft) => void;
  onDelete: (id: string) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <details className="group mt-6 rounded-md border border-sand-200 bg-sand-50/60">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sand-600 group-open:text-sand-900">
          Saved drafts
        </span>
        <Badge variant="outline">{drafts.length}</Badge>
      </summary>
      <ul className="divide-y divide-sand-100 border-t border-sand-200">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-sand-900">{d.subject}</p>
              <p className="mt-0.5 text-[11px] text-sand-500">
                {d.communityName} ·{" "}
                {new Date(d.savedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => onLoad(d)}>
                Load
              </Button>
              <button
                onClick={() => onDelete(d.id)}
                className="rounded p-1 text-sand-400 hover:bg-sand-100 hover:text-clay-600"
                title="Delete draft"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66H14.5a.5.5 0 0 0 0-1h-.996a.59.59 0 0 0-.01 0H11Z" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const {
    communities, selectedSlug, setSelectedSlug,
    pdf,
    stage,
    extracted, html,
    heroImageUrl, secondaryImageUrl, galleryImageUrls, imageCount,
    refineInput, setRefineInput,
    refineHistory,
    review, reviewing, reviewError,
    agentLoop,
    pushResult, error,
    pastSendsContext, subjectSpecialist,
    duplicateWarning,
    savedDrafts, currentDraftSaved,
    handleFileChange,
    generateDraft, cancelGeneration,
    refineDraft,
    saveDraft, discardDraft,
    loadSavedDraft, deleteSavedDraft,
    pushDraft,
    dismissDuplicateWarning,
  } = useDraft();

  const selected = communities.find((c) => c.slug === selectedSlug);

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

        {/* Two-column layout: inputs + intelligence */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Generate card */}
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
                    <p className="mt-0.5 truncate text-xs font-medium text-sand-900">
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
                    <p className="mt-0.5 tabular-nums text-xs font-medium text-sand-900">
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
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  className="h-auto py-2 file:mr-3 file:rounded file:border-0 file:bg-sand-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-sand-700 hover:file:bg-sand-200"
                />
              </div>

              {duplicateWarning && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <p className="font-medium">This looks like a file you&apos;ve already uploaded.</p>
                  <p className="mt-0.5 text-amber-700">
                    <span className="font-medium">{duplicateWarning.name}</span> was last generated on{" "}
                    {new Date(duplicateWarning.generatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {duplicateWarning.community !== selectedSlug ? " (for a different community)" : ""}.
                  </p>
                  <button
                    className="mt-1.5 text-amber-600 underline underline-offset-2 hover:text-amber-800"
                    onClick={dismissDuplicateWarning}
                  >
                    Generate anyway
                  </button>
                </div>
              )}

              <Button
                onClick={generateDraft}
                disabled={!pdf || !selectedSlug || stage === "drafting" || !!duplicateWarning}
                loading={stage === "drafting"}
                size="lg"
                className="w-full"
              >
                {stage === "drafting" ? "Drafter & critic working…" : "Generate eblast draft"}
              </Button>

              {stage === "drafting" && (
                <div className="rounded-md border border-sand-200 bg-sand-50/60 p-3 text-xs leading-relaxed text-sand-600">
                  <p className="eb-fade-pulse">
                    Drafter reading the flyer and pulling images. Critic reviewing each round — if it flags
                    issues, drafter applies the fixes and the critic re-reviews. Up to 3 rounds.
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[11px] text-sand-500">Typically 30–90 seconds. Safe to switch tabs.</p>
                    <button
                      onClick={cancelGeneration}
                      className="text-[11px] text-clay-600 underline underline-offset-2 hover:text-clay-800"
                    >
                      Cancel
                    </button>
                  </div>
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

        {/* Saved drafts */}
        <SavedDraftsPanel drafts={savedDrafts} onLoad={loadSavedDraft} onDelete={deleteSavedDraft} />

        {/* Preview + reviewer */}
        {extracted && (
          <>
            {/* Draft action bar */}
            <div className="mt-8 flex items-center justify-between gap-3 rounded-md border border-sand-200 bg-sand-50/60 px-4 py-2.5">
              <div className="min-w-0 text-xs text-sand-600">
                {currentDraftSaved ? (
                  <span className="font-medium text-forest-700">Draft saved</span>
                ) : (
                  <span>Unsaved draft</span>
                )}
                <span className="mx-1.5 text-sand-300">·</span>
                <span className="truncate font-medium text-sand-800">{extracted.subject}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!currentDraftSaved && (
                  <Button size="sm" variant="secondary" onClick={saveDraft}>
                    Save draft
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={discardDraft}>
                  Discard
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
              {/* Controls column */}
              <div className="flex flex-col gap-5">

                {/* Refine — at the top so it's immediately accessible */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Refine with a prompt</CardTitle>
                    <CardDescription>
                      e.g. &ldquo;tighten the headline&rdquo;, &ldquo;less salesy&rdquo;, &ldquo;swap the CTA to call&rdquo;.
                    </CardDescription>
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
                            <span className="text-clay-600">
                              {agentLoop.imagesExcluded} image{agentLoop.imagesExcluded === 1 ? "" : "s"} dropped
                            </span>
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
                                      {it.verdict.replace(/_/g, " ")},{" "}
                                      {it.findingsCount} finding{it.findingsCount === 1 ? "" : "s"}
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
                                  <Badge variant={severityBadge[f.severity].variant}>
                                    {severityBadge[f.severity].label}
                                  </Badge>
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
                                    onClick={() =>
                                      setRefineInput(`Change the subject line to: "${alt}"`)
                                    }
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
                            <span className="font-medium text-sand-800">Send-time hint:</span>{" "}
                            {review.sendTimeRecommendation}
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

                {/* Subject specialist */}
                {subjectSpecialist && (
                  <SubjectSpecialistPanel
                    specialist={subjectSpecialist as any}
                    currentSubject={extracted.subject}
                    onPickAlternative={(subject, previewText) => {
                      setRefineInput(
                        `Change the subject line to: "${subject}" and the preview text to: "${previewText}"`,
                      );
                    }}
                  />
                )}

                {/* Intelligence applied */}
                <IntelligenceApplied
                  drafterRationale={extracted.drafterRationale}
                  pastSends={pastSendsContext as any}
                  findings={review?.findings as any}
                />

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
                      <span className="font-medium text-sand-900">{extracted.subject}</span>
                      {imageCount > 0 && (
                        <span className="ml-2 text-sand-500">
                          · {imageCount} image{imageCount === 1 ? "" : "s"} extracted
                        </span>
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
          </>
        )}

        {/* Push result */}
        {pushResult && (
          <div className="mt-8">
            <div
              className={`rounded-md border-l-4 px-4 py-3 ${
                pushResult.ok ? "border-forest-600 bg-forest-50/60" : "border-clay-600 bg-clay-50/60"
              }`}
            >
              <p className="font-medium text-sand-900">
                {pushResult.ok ? "Draft created in HubSpot" : "Push failed"}
              </p>
              {pushResult.summary?.emailId && (
                <p className="mt-1 text-xs text-sand-600">
                  {pushResult.summary.community} · ID{" "}
                  <code className="rounded bg-sand-100 px-1 py-0.5 font-mono text-[11px]">
                    {pushResult.summary.emailId}
                  </code>{" "}
                  · State{" "}
                  <code className="rounded bg-sand-100 px-1 py-0.5 font-mono text-[11px]">
                    {pushResult.summary.state}
                  </code>
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
