"use client";

import { useEffect, useState } from "react";

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
  | "send_strategy";

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
  const [imageDiagnostic, setImageDiagnostic] = useState<any>(null);

  const [refineInput, setRefineInput] = useState("");
  const [refineHistory, setRefineHistory] = useState<RefinementEntry[]>([]);

  const [review, setReview] = useState<DraftReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [agentLoop, setAgentLoop] = useState<AgentLoopSummary | null>(null);

  const [pushResult, setPushResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
      // The endpoint now runs the drafter ↔ critic loop server-side and only
      // returns once they've converged (or hit the iteration cap). No preview
      // is shown until that happens.
      setExtracted(data.extracted);
      setHtml(data.html);
      setHeroImageUrl(data.heroImageUrl);
      setSecondaryImageUrl(data.secondaryImageUrl);
      setGalleryImageUrls(data.galleryImageUrls ?? []);
      setImageCount(data.imageCount ?? 0);
      setImageDiagnostic(data.imageDiagnostic ?? null);
      setReview(data.review ?? null);
      setAgentLoop(data.agentLoop ?? null);
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
      // Re-review against the refined draft so the sidebar reflects the new state.
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

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#9C7A55",
    fontWeight: 500,
    marginBottom: 6,
  };
  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #D9CDB1",
    background: "white",
    fontSize: 14,
    color: "#1F2937",
    fontFamily: "inherit",
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 32px" }}>
      <header style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#9C7A55", margin: 0 }}>
          Eblast Drafter
        </p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 40, margin: "6px 0 4px 0", color: "#1F4538" }}>
          Drop a flyer. Get an eblast.
        </h1>
        <p style={{ fontSize: 15, color: "#5C5C5C", maxWidth: 720, lineHeight: 1.6 }}>
          Upload one PDF. Claude extracts the copy; we pull the photos straight out of the PDF
          and apply the community&rsquo;s brand. Refine with a chat instruction, then push to HubSpot.
        </p>
        </div>
        <a
          href="/communities"
          style={{
            background: "white",
            color: "#1F4538",
            border: "1px solid #1F4538",
            padding: "12px 22px",
            fontSize: 12,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 500,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Communities →
        </a>
      </header>

      {/* Step 1 — inputs */}
      <section style={{ background: "white", border: "1px solid #E5DAC1", padding: 24, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Community</label>
            <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)} style={fieldStyle}>
              {communities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Flyer PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              style={fieldStyle}
            />
          </div>
        </div>

        {selected && (
          <div
            style={{
              background: selected.brand.background,
              borderLeft: `4px solid ${selected.brand.primary}`,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: "#3A3A3A",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: selected.brand.primary }}>{selected.displayName}</strong>
            {" · "}From: {selected.senders[0]?.name ?? <em style={{ color: "#B5683E" }}>no sender</em>}
            {selected.senders[0] && ` <${selected.senders[0].email}>`}
            {" · "}List: {selected.hubspot.listId ?? <em style={{ color: "#B5683E" }}>not set</em>}
          </div>
        )}

        <button
          onClick={generateDraft}
          disabled={!pdf || !selectedSlug || stage === "drafting"}
          style={{
            background: selected?.brand.primary ?? "#1F4538",
            color: "white",
            border: 0,
            padding: "14px 28px",
            fontSize: 14,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 500,
            cursor: stage === "drafting" ? "wait" : "pointer",
            opacity: !pdf || !selectedSlug || stage === "drafting" ? 0.5 : 1,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {stage === "drafting" && <span className="eb-spinner" />}
          {stage === "drafting" ? "Drafter and critic working..." : "Generate eblast draft"}
        </button>

        {stage === "drafting" && (
          <div style={{ marginTop: 14, fontSize: 12, color: "#6B6B6B", lineHeight: 1.7 }}>
            <p style={{ margin: 0 }} className="eb-fade-pulse">
              Drafter reading the flyer, pulling images, and writing an initial draft. Critic reviewing it.
              If the critic flags issues, drafter applies the fixes and the critic re-reviews — up to 3 rounds.
              No preview until they converge.
            </p>
            <p style={{ margin: "6px 0 0 0", fontSize: 11, opacity: 0.8 }}>
              Typically 30–90 seconds.
            </p>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#FBE4DC", borderLeft: "4px solid #B5683E", fontSize: 13 }}>
            {error}
          </div>
        )}
      </section>

      {/* Step 2 — preview + refine + push */}
      {extracted && (
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 380px) 1fr", gap: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Reviewer panel — second pair of eyes between draft and HubSpot */}
            <div style={{ background: "white", border: "1px solid #E5DAC1", padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ ...labelStyle, marginBottom: 0 }}>Reviewer</p>
                <button
                  onClick={() => runReview()}
                  disabled={reviewing || !extracted}
                  style={{
                    background: "transparent",
                    color: selected?.brand.primary ?? "#1F4538",
                    border: `1px solid ${selected?.brand.primary ?? "#1F4538"}`,
                    padding: "4px 10px",
                    fontSize: 10,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    fontWeight: 500,
                    cursor: reviewing ? "wait" : "pointer",
                    opacity: reviewing || !extracted ? 0.5 : 1,
                  }}
                >
                  {reviewing ? "Reviewing..." : "Re-run"}
                </button>
              </div>

              {reviewing && !review && (
                <p style={{ fontSize: 12, color: "#6B6B6B", margin: 0 }}>
                  <span className="eb-fade-pulse">A second pair of eyes is reading the draft...</span>
                </p>
              )}

              {reviewError && (
                <div style={{ padding: "8px 10px", background: "#FBE4DC", borderLeft: "3px solid #B5683E", fontSize: 12 }}>
                  {reviewError}
                </div>
              )}

              {review && (
                <>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                    <div
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        fontSize: 10,
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        fontWeight: 700,
                        background:
                          review.verdict === "ready"
                            ? "#E6F0EA"
                            : review.verdict === "needs_revision"
                            ? "#FCEFD8"
                            : "#FBE4DC",
                        color:
                          review.verdict === "ready"
                            ? "#1F4538"
                            : review.verdict === "needs_revision"
                            ? "#9C7A55"
                            : "#B5683E",
                      }}
                    >
                      {review.verdict.replace(/_/g, " ")}
                    </div>
                    {agentLoop && (
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          color: "#6B6B6B",
                        }}
                        title={`Stopped: ${agentLoop.stoppedReason.replace(/_/g, " ")}`}
                      >
                        Agents converged · {agentLoop.totalRounds} round{agentLoop.totalRounds === 1 ? "" : "s"}
                        {agentLoop.imagesExcluded > 0 && (
                          <span style={{ color: "#B5683E", marginLeft: 4 }}>
                            · {agentLoop.imagesExcluded} image{agentLoop.imagesExcluded === 1 ? "" : "s"} dropped
                          </span>
                        )}
                        {agentLoop.stoppedReason !== "ready" && (
                          <span style={{ color: "#9C7A55", marginLeft: 4 }}>
                            ({agentLoop.stoppedReason.replace(/_/g, " ")})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.55, color: "#3A3A3A", margin: "0 0 14px 0" }}>{review.summary}</p>

                  {agentLoop && agentLoop.iterations.length > 1 && (
                    <details style={{ marginBottom: 14 }}>
                      <summary
                        style={{
                          fontSize: 11,
                          color: "#9C7A55",
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          cursor: "pointer",
                        }}
                      >
                        How the agents got here ({agentLoop.totalRounds} rounds)
                      </summary>
                      <ol style={{ paddingLeft: 18, margin: "8px 0 0 0", fontSize: 12, color: "#3A3A3A", lineHeight: 1.6 }}>
                        {agentLoop.iterations.map((it) => (
                          <li key={it.round} style={{ marginBottom: 8 }}>
                            <strong style={{ color: "#1F2937" }}>Round {it.round}:</strong> verdict{" "}
                            <em>{it.verdict.replace(/_/g, " ")}</em>, {it.findingsCount} finding{it.findingsCount === 1 ? "" : "s"}.
                            {it.droppedImageSlots.length > 0 && (
                              <div style={{ fontSize: 11, color: "#B5683E", marginTop: 4, lineHeight: 1.6 }}>
                                Dropped image{it.droppedImageSlots.length === 1 ? "" : "s"}: {it.droppedImageSlots.join("; ")}
                              </div>
                            )}
                            {it.appliedSuggestions.length > 0 && (
                              <ul style={{ paddingLeft: 16, margin: "4px 0 0 0", fontSize: 11, color: "#6B6B6B", lineHeight: 1.6 }}>
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
                    <p style={{ fontSize: 12, color: "#6B6B6B", fontStyle: "italic", margin: 0 }}>
                      No findings. Reviewer thinks this is clean.
                    </p>
                  ) : (
                    <ul style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
                      {review.findings.map((f, i) => (
                        <li
                          key={i}
                          style={{
                            marginBottom: 12,
                            paddingBottom: 12,
                            borderBottom: i === review.findings.length - 1 ? "0" : "1px solid #EFE7D5",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                            <span
                              style={{
                                fontSize: 9,
                                letterSpacing: 1.2,
                                textTransform: "uppercase",
                                fontWeight: 700,
                                padding: "2px 6px",
                                background:
                                  f.severity === "blocker"
                                    ? "#FBE4DC"
                                    : f.severity === "important"
                                    ? "#FCEFD8"
                                    : "#E5DAC1",
                                color:
                                  f.severity === "blocker"
                                    ? "#B5683E"
                                    : f.severity === "important"
                                    ? "#9C7A55"
                                    : "#3A3A3A",
                              }}
                            >
                              {f.severity}
                            </span>
                            <span style={{ fontSize: 10, color: "#9C7A55", letterSpacing: 1, textTransform: "uppercase" }}>
                              {f.category.replace(/_/g, " ")}
                            </span>
                            {f.field && <span style={{ fontSize: 10, color: "#6B6B6B" }}>· {f.field}</span>}
                          </div>
                          <p style={{ fontSize: 12, lineHeight: 1.55, margin: "0 0 4px 0", color: "#1F2937" }}>{f.issue}</p>
                          {f.suggestion && (
                            <button
                              onClick={() => setRefineInput(f.suggestion!)}
                              title="Click to load this into the refine box"
                              style={{
                                background: "#FBF7EE",
                                border: "1px dashed #C8AE76",
                                color: "#3A3A3A",
                                padding: "6px 8px",
                                fontSize: 11,
                                lineHeight: 1.5,
                                textAlign: "left",
                                cursor: "pointer",
                                width: "100%",
                                margin: "4px 0",
                                fontFamily: "inherit",
                              }}
                            >
                              → {f.suggestion}
                            </button>
                          )}
                          <p style={{ fontSize: 11, color: "#6B6B6B", margin: 0, fontStyle: "italic" }}>{f.rationale}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {review.subjectLineAlternatives && review.subjectLineAlternatives.length > 0 && (
                    <details style={{ marginTop: 12 }}>
                      <summary
                        style={{
                          fontSize: 11,
                          color: "#9C7A55",
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          cursor: "pointer",
                        }}
                      >
                        Alternative subject lines
                      </summary>
                      <ul style={{ paddingLeft: 0, listStyle: "none", margin: "8px 0 0 0" }}>
                        {review.subjectLineAlternatives.map((alt, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>
                            <button
                              onClick={() => setRefineInput(`Change the subject line to: "${alt}"`)}
                              style={{
                                background: "#FBF7EE",
                                border: "1px dashed #C8AE76",
                                color: "#3A3A3A",
                                padding: "6px 8px",
                                fontSize: 11,
                                lineHeight: 1.5,
                                textAlign: "left",
                                cursor: "pointer",
                                width: "100%",
                                fontFamily: "inherit",
                              }}
                            >
                              → {alt}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {review.sendTimeRecommendation && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "#6B6B6B",
                        margin: "12px 0 0 0",
                        paddingTop: 10,
                        borderTop: "1px solid #EFE7D5",
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: "#3A3A3A" }}>Send-time hint:</strong> {review.sendTimeRecommendation}
                    </p>
                  )}

                  {review.recipientListNote && (
                    <p style={{ fontSize: 11, color: "#B5683E", margin: "8px 0 0 0", lineHeight: 1.5 }}>
                      <strong>List:</strong> {review.recipientListNote}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Refinement chat */}
            <div style={{ background: "white", border: "1px solid #E5DAC1", padding: 18 }}>
              <p style={{ ...labelStyle, marginBottom: 8 }}>Refine with a prompt</p>
              <textarea
                value={refineInput}
                onChange={(e) => setRefineInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey)) refineDraft();
                }}
                placeholder='e.g. "make the headline shorter and more punchy" or "less salesy, more warm"'
                rows={3}
                style={{ ...fieldStyle, fontFamily: "inherit", resize: "vertical" }}
                disabled={stage === "refining"}
              />
              <button
                onClick={refineDraft}
                disabled={!refineInput.trim() || stage === "refining"}
                style={{
                  marginTop: 10,
                  background: selected?.brand.primary ?? "#1F4538",
                  color: "white",
                  border: 0,
                  padding: "10px 20px",
                  fontSize: 12,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontWeight: 500,
                  cursor: stage === "refining" ? "wait" : "pointer",
                  opacity: !refineInput.trim() || stage === "refining" ? 0.5 : 1,
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {stage === "refining" && <span className="eb-spinner" />}
                {stage === "refining" ? "Refining..." : "Apply change"}
              </button>
              {refineHistory.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 11, color: "#9C7A55", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
                    Refinements ({refineHistory.length})
                  </summary>
                  <ol style={{ paddingLeft: 18, margin: "8px 0 0 0", fontSize: 12, color: "#3A3A3A", lineHeight: 1.6 }}>
                    {refineHistory.map((r, i) => (
                      <li key={i} style={{ color: r.ok ? "#3A3A3A" : "#B5683E" }}>
                        {r.instruction}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>

            {/* Quick fields */}
            <div style={{ background: "white", border: "1px solid #E5DAC1", padding: 18 }}>
              <p style={{ ...labelStyle, marginBottom: 12 }}>Subject &amp; preview</p>
              <p style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 8px 0", fontWeight: 500, color: "#1F2937" }}>
                {extracted.subject}
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: "#6B6B6B" }}>{extracted.previewText}</p>
              <details style={{ marginTop: 14 }}>
                <summary style={{ fontSize: 11, color: "#9C7A55", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
                  Full extracted JSON
                </summary>
                <pre style={{ background: "#FBF7EE", border: "1px solid #E5DAC1", padding: 10, fontSize: 11, marginTop: 8, maxHeight: 280, overflow: "auto" }}>
                  {JSON.stringify(extracted, null, 2)}
                </pre>
              </details>
              {imageDiagnostic && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11, color: "#9C7A55", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
                    Image extraction diagnostic
                  </summary>
                  <pre style={{ background: "#FBF7EE", border: "1px solid #E5DAC1", padding: 10, fontSize: 11, marginTop: 8, maxHeight: 280, overflow: "auto" }}>
                    {JSON.stringify(imageDiagnostic, null, 2)}
                  </pre>
                </details>
              )}
            </div>

            {/* Push */}
            <button
              onClick={pushDraft}
              disabled={stage === "pushing"}
              style={{
                background: selected?.brand.accent ?? "#B5683E",
                color: "white",
                border: 0,
                padding: "16px 28px",
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontWeight: 500,
                cursor: stage === "pushing" ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {stage === "pushing" && <span className="eb-spinner" />}
              {stage === "pushing" ? "Pushing to HubSpot..." : "Push draft to HubSpot"}
            </button>
          </div>

          <div style={{ background: "#1F2937", padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#9CA3AF", margin: 0, marginLeft: 4 }}>
                Email preview
                {imageCount > 0 && (
                  <span style={{ marginLeft: 8, color: "#6B7280" }}>
                    · {imageCount} image{imageCount === 1 ? "" : "s"} extracted
                  </span>
                )}
              </p>
              {stage === "refining" && (
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0, marginRight: 4 }} className="eb-pulse-row">
                  <span className="eb-pulse-dot" />
                  <span className="eb-pulse-dot" />
                  <span className="eb-pulse-dot" />
                </p>
              )}
            </div>
            <iframe
              srcDoc={html}
              style={{
                width: "100%",
                height: 760,
                border: 0,
                background: "white",
                opacity: stage === "refining" ? 0.55 : 1,
                transition: "opacity 0.2s ease",
              }}
              title="Email preview"
            />
          </div>
        </section>
      )}

      {/* Step 3 — push result */}
      {pushResult && (
        <section style={{ marginBottom: 24 }}>
          <div
            style={{
              background: pushResult.ok ? "#E6F0EA" : "#FBE4DC",
              borderLeft: `4px solid ${pushResult.ok ? "#1F4538" : "#B5683E"}`,
              padding: "16px 20px",
              marginBottom: 12,
            }}
          >
            <p style={{ margin: 0, fontWeight: 500 }}>
              {pushResult.ok ? "Draft created in HubSpot" : "Push failed"}
            </p>
            {pushResult.summary?.emailId && (
              <p style={{ margin: "8px 0 0 0", fontSize: 13 }}>
                {pushResult.summary.community} · ID <code>{pushResult.summary.emailId}</code> · State{" "}
                <code>{pushResult.summary.state}</code>
              </p>
            )}
          </div>

          {!pushResult.ok && Array.isArray(pushResult.steps) && pushResult.steps.length > 0 && (
            <>
              {pushResult.steps.map((s: any, i: number) => (
                <details key={i} open={!s.ok} style={{ marginBottom: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "#3A3A3A", fontWeight: 500 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: s.ok ? "#1F4538" : "#B5683E",
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    Step {i + 1} · {s.step} · HTTP {s.status} {s.ok ? "OK" : "FAIL"}
                  </summary>
                  <pre
                    style={{
                      background: "#FBF7EE",
                      border: "1px solid #E5DAC1",
                      padding: 12,
                      fontSize: 11,
                      lineHeight: 1.5,
                      overflow: "auto",
                      maxHeight: 400,
                      marginTop: 8,
                    }}
                  >
                    {JSON.stringify(s.body, null, 2)}
                  </pre>
                </details>
              ))}
            </>
          )}
        </section>
      )}
    </main>
  );
}
