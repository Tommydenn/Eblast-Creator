"use client";

import { useEffect, useState } from "react";

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

type Step = { step: string; ok: boolean; status: number; body: any };
type PushResult = {
  ok: boolean;
  steps: Step[];
  summary?: {
    emailId?: string;
    name?: string;
    state?: string;
    mode?: string;
    community?: string;
  } | null;
};

export default function Home() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [subject, setSubject] = useState("You're invited: Get a taste of life at Caretta");
  const [previewText, setPreviewText] = useState(
    "Wed, May 13 at 2 PM. Live snack demo with Rebekah, our Dining Director from Unidine.",
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  useEffect(() => {
    fetch("/api/communities")
      .then((r) => r.json())
      .then((d) => {
        setCommunities(d.communities);
        if (d.communities.length > 0) {
          setSelectedSlug(d.communities[0].slug);
          if (d.communities[0].templates.length > 0) {
            setSelectedTemplate(d.communities[0].templates[0]);
          }
        }
      });
  }, []);

  const selected = communities.find((c) => c.slug === selectedSlug);

  async function pushEblast() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/push-eblast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communitySlug: selectedSlug,
          templateFile: selectedTemplate,
          subject,
          previewText,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({ ok: false, steps: [{ step: "fetch", ok: false, status: 0, body: { error: String(e) } }] });
    } finally {
      setLoading(false);
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
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "48px 32px" }}>
      <header style={{ marginBottom: 36 }}>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#9C7A55", margin: 0 }}>
          Eblast Drafter
        </p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 40, margin: "6px 0 4px 0", color: "#1F4538" }}>
          Push an eblast to HubSpot
        </h1>
        <p style={{ fontSize: 15, color: "#5C5C5C", maxWidth: 640, lineHeight: 1.6 }}>
          {communities.length} {communities.length === 1 ? "community" : "communities"} registered. Pick one,
          choose a template, set subject + preview, and we&rsquo;ll upload it as a coded HubSpot email
          template and create a draft addressed to the right segmented list.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Community</label>
          <select
            value={selectedSlug}
            onChange={(e) => {
              setSelectedSlug(e.target.value);
              const c = communities.find((c) => c.slug === e.target.value);
              if (c && c.templates.length > 0) setSelectedTemplate(c.templates[0]);
            }}
            style={fieldStyle}
          >
            {communities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Template</label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            style={fieldStyle}
            disabled={!selected || selected.templates.length === 0}
          >
            {selected?.templates.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {selected?.templates.length === 0 && <option>No templates yet</option>}
          </select>
        </div>
      </div>

      {selected && (
        <div
          style={{
            background: selected.brand.background,
            borderLeft: `4px solid ${selected.brand.primary}`,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            color: "#3A3A3A",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: selected.brand.primary }}>{selected.displayName}</strong>
          {" · "}From: {selected.sender.name} &lt;{selected.sender.email}&gt;
          {" · "}List ID: {selected.hubspot.listId ?? <em style={{ color: "#B5683E" }}>not set</em>}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Subject line</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} style={fieldStyle} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Preview text</label>
        <input value={previewText} onChange={(e) => setPreviewText(e.target.value)} style={fieldStyle} />
      </div>

      <button
        onClick={pushEblast}
        disabled={loading || !selectedSlug || !selectedTemplate}
        style={{
          background: selected?.brand.primary ?? "#1F4538",
          color: "white",
          border: 0,
          padding: "14px 28px",
          fontSize: 14,
          letterSpacing: 2,
          textTransform: "uppercase",
          fontWeight: 500,
          cursor: loading ? "wait" : "pointer",
          opacity: loading || !selectedSlug || !selectedTemplate ? 0.5 : 1,
        }}
      >
        {loading ? "Pushing..." : "Push draft to HubSpot"}
      </button>

      {result && (
        <section style={{ marginTop: 36 }}>
          <div
            style={{
              background: result.ok ? "#E6F0EA" : "#FBE4DC",
              borderLeft: `4px solid ${result.ok ? "#1F4538" : "#B5683E"}`,
              padding: "16px 20px",
              marginBottom: 20,
            }}
          >
            <p style={{ margin: 0, fontWeight: 500 }}>
              {result.ok ? "All steps succeeded" : "One or more steps failed"}
            </p>
            {result.summary?.emailId && (
              <p style={{ margin: "8px 0 0 0", fontSize: 13 }}>
                {result.summary.community} · Draft id: <code>{result.summary.emailId}</code> · State:{" "}
                <code>{result.summary.state}</code>
              </p>
            )}
          </div>

          {result.steps.map((s, i) => (
            <details key={i} open={!s.ok || i === result.steps.length - 1} style={{ marginBottom: 12 }}>
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
                  padding: 16,
                  fontSize: 12,
                  lineHeight: 1.5,
                  overflow: "auto",
                  maxHeight: 500,
                  marginTop: 8,
                }}
              >
                {JSON.stringify(s.body, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      )}
    </main>
  );
}
