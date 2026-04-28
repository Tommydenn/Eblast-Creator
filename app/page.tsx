"use client";

import { useEffect, useRef, useState } from "react";

interface Community {
  slug: string;
  displayName: string;
  shortName: string;
  type: string;
  brand: { primary: string; accent: string; background: string };
  sender: { name: string; email: string };
  hubspot: { listId?: number };
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

type Stage = "idle" | "drafting" | "preview" | "pushing" | "done";

export default function Home() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [extracted, setExtracted] = useState<ExtractedFlyer | null>(null);
  const [html, setHtml] = useState<string>("");
  const [pushResult, setPushResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setStage("preview");
    } catch (e: any) {
      setError(String(e));
      setStage("idle");
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

  function updateField<K extends keyof ExtractedFlyer>(key: K, value: ExtractedFlyer[K]) {
    if (!extracted) return;
    setExtracted({ ...extracted, [key]: value });
    // Note: HTML is stale until regenerate. For now, push uses extracted fields for subject/preview
    // but the HTML body still reflects the original draft. (Re-render is a follow-up.)
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
      <header style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#9C7A55", margin: 0 }}>
          Eblast Drafter
        </p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 40, margin: "6px 0 4px 0", color: "#1F4538" }}>
          Drop a flyer. Get an eblast.
        </h1>
        <p style={{ fontSize: 15, color: "#5C5C5C", maxWidth: 720, lineHeight: 1.6 }}>
          Upload the printed flyer as a PDF and pick the community. Claude reads it, extracts the
          subject, headline, body copy, and CTA, then renders a brand-themed HTML email. Preview,
          tweak, and push to HubSpot.
        </p>
      </header>

      {/* Step 1: inputs */}
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
              ref={fileInputRef}
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
            {" · "}From: {selected.sender.name} &lt;{selected.sender.email}&gt;
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
          }}
        >
          {stage === "drafting" ? "Reading flyer..." : "Generate eblast draft"}
        </button>

        {error && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#FBE4DC", borderLeft: "4px solid #B5683E", fontSize: 13 }}>
            {error}
          </div>
        )}
      </section>

      {/* Step 2: preview + edit */}
      {extracted && (
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 380px) 1fr", gap: 24, marginBottom: 24 }}>
          <div style={{ background: "white", border: "1px solid #E5DAC1", padding: 20 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#1F4538", margin: "0 0 16px 0" }}>
              Extracted fields
            </h2>

            <label style={labelStyle}>Subject</label>
            <input value={extracted.subject} onChange={(e) => updateField("subject", e.target.value)} style={fieldStyle} />

            <div style={{ height: 12 }} />
            <label style={labelStyle}>Preview text</label>
            <input value={extracted.previewText} onChange={(e) => updateField("previewText", e.target.value)} style={fieldStyle} />

            <div style={{ height: 12 }} />
            <label style={labelStyle}>Headline</label>
            <input value={extracted.headline} onChange={(e) => updateField("headline", e.target.value)} style={fieldStyle} />

            <div style={{ height: 12 }} />
            <label style={labelStyle}>CTA button</label>
            <input value={extracted.ctaButtonLabel} onChange={(e) => updateField("ctaButtonLabel", e.target.value)} style={fieldStyle} />

            <div style={{ height: 12 }} />
            <details>
              <summary style={{ fontSize: 12, color: "#9C7A55", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
                Full extracted JSON
              </summary>
              <pre style={{ background: "#FBF7EE", border: "1px solid #E5DAC1", padding: 12, fontSize: 11, marginTop: 8, maxHeight: 280, overflow: "auto" }}>
                {JSON.stringify(extracted, null, 2)}
              </pre>
            </details>

            <div style={{ height: 20 }} />
            <button
              onClick={pushDraft}
              disabled={stage === "pushing"}
              style={{
                background: selected?.brand.accent ?? "#B5683E",
                color: "white",
                border: 0,
                padding: "14px 28px",
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontWeight: 500,
                cursor: stage === "pushing" ? "wait" : "pointer",
                width: "100%",
              }}
            >
              {stage === "pushing" ? "Pushing to HubSpot..." : "Push draft to HubSpot"}
            </button>
            <p style={{ fontSize: 11, color: "#9C7A55", marginTop: 8, lineHeight: 1.5 }}>
              Note: edits to extracted fields update what gets sent to HubSpot, but the preview
              still reflects the original render. Re-render-on-edit is the next iteration.
            </p>
          </div>

          <div style={{ background: "#1F2937", padding: 12 }}>
            <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#9CA3AF", margin: "0 0 8px 4px" }}>
              Email preview
            </p>
            <iframe
              srcDoc={html}
              style={{ width: "100%", height: 760, border: 0, background: "white" }}
              title="Email preview"
            />
          </div>
        </section>
      )}

      {/* Step 3: push result */}
      {pushResult && (
        <section style={{ marginBottom: 24 }}>
          <div
            style={{
              background: pushResult.ok ? "#E6F0EA" : "#FBE4DC",
              borderLeft: `4px solid ${pushResult.ok ? "#1F4538" : "#B5683E"}`,
              padding: "16px 20px",
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
        </section>
      )}
    </main>
  );
}
