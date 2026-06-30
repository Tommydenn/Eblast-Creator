"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function RequestEditsPage() {
  const { token } = useParams<{ token: string }>();
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [autoRefined, setAutoRefined] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) return;
    setStatus("submitting");
    try {
      const res = await fetch(`/api/draft-approval/${token}/edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editNotes: notes.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setAutoRefined(!!data.autoRefined);
        setStatus("done");
      } else {
        setErrorMsg(data.error ?? "Something went wrong.");
        setStatus("error");
      }
    } catch (e: any) {
      setErrorMsg(String(e));
      setStatus("error");
    }
  }

  const container: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f5f4f1",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "60px 20px",
    fontFamily: "Georgia, serif",
  };
  const card: React.CSSProperties = {
    maxWidth: 520,
    width: "100%",
    background: "#fff",
    borderRadius: 10,
    border: "1px solid #e0ddd7",
    padding: "40px 44px 44px",
  };

  if (status === "done") {
    return (
      <div style={container}>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#b45309",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 20px", fontSize: 26, color: "#fff" }}>
            ✓
          </div>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#2d2926", fontWeight: "normal" }}>
            {autoRefined ? "Updates applied!" : "Edit request received"}
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "#5c4a3a" }}>
            {autoRefined
              ? "Your notes were applied automatically. Check your email — a fresh draft is on its way for your review."
              : "Thank you! Your notes have been passed to the marketing team. They’ll send you a new draft to review once the updates are made."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div style={card}>
        <p style={{ margin: "0 0 4px", fontSize: 11, letterSpacing: ".08em",
                    textTransform: "uppercase", color: "#9e9484", fontFamily: "Arial, sans-serif" }}>
          Request Edits
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#2d2926", fontWeight: "normal" }}>
          What changes would you like?
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: 15, lineHeight: 1.6, color: "#5c4a3a" }}>
          Please describe the changes you&rsquo;d like made to this draft. Be as specific as you&rsquo;d like &mdash;
          the more detail you provide, the better the revision will be.
        </p>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 13,
                          color: "#7a7066", fontFamily: "Arial, sans-serif" }}>
            Your notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={7}
            placeholder="e.g. The headline should mention our new dining program. Can you also soften the tone in the second paragraph and make the call-to-action more specific about scheduling a tour?"
            disabled={status === "submitting"}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 14px", fontSize: 14, lineHeight: 1.6,
              fontFamily: "Arial, sans-serif", color: "#2d2926",
              border: "1.5px solid #d6cfc5", borderRadius: 6,
              resize: "vertical", background: "#faf8f4",
              outline: "none",
            }}
          />

          {status === "error" && (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#b91c1c",
                        fontFamily: "Arial, sans-serif" }}>
              {errorMsg}
            </p>
          )}

          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="submit"
              disabled={status === "submitting" || !notes.trim()}
              style={{
                padding: "12px 28px", background: "#5c4a3a", color: "#fff",
                fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 600,
                border: "none", borderRadius: 6, cursor: status === "submitting" ? "wait" : "pointer",
                opacity: notes.trim() ? 1 : 0.5,
              }}
            >
              {status === "submitting" ? "Reviewing your notes…" : "Submit Edit Request"}
            </button>
            <a href={`/approve/${token}`}
               style={{ fontSize: 14, color: "#9e9484", fontFamily: "Arial, sans-serif",
                        textDecoration: "none" }}>
              ← Go back
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
