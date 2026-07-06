"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const baseInput = "w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors";

export default function SubjectSection() {
  const { fields, setField, subjectSpecialist, swapSubjectLine } = useDraft();
  if (!fields) return null;

  return (
    <div className="space-y-5">
      <Field label="Subject Line">
        <input
          type="text"
          value={fields.subject}
          onChange={(e) => setField("subject", e.target.value)}
          className={baseInput}
          placeholder="Email subject…"
          maxLength={90}
        />
        <p className="mt-1 text-xs text-[#9aaba4]">{fields.subject.length}/90 chars · Target: under 60</p>
      </Field>

      <Field label="Preview Text">
        <textarea
          value={fields.previewText}
          onChange={(e) => setField("previewText", e.target.value)}
          rows={2}
          className={baseInput + " resize-none"}
          placeholder="Inbox preview snippet…"
          maxLength={150}
        />
        <p className="mt-1 text-xs text-[#9aaba4]">{fields.previewText.length}/150 chars · Target: under 120</p>
      </Field>

      {subjectSpecialist && subjectSpecialist.alternatives.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-2">AI Alternatives</p>
          <div className="space-y-2">
            {[subjectSpecialist.winner, ...subjectSpecialist.alternatives].map((alt, i) => (
              <button
                key={i}
                onClick={() => swapSubjectLine(alt.subject, alt.previewText)}
                className={[
                  "w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  alt.subject === fields.subject
                    ? "border-[#1F4538] bg-[#f0f5f2] text-[#1F4538]"
                    : "border-[#e8e3dc] bg-white hover:border-[#1F4538]/40 hover:bg-[#faf9f6] text-[#1a1a1a]",
                ].join(" ")}
              >
                <div className="font-medium">{alt.subject}</div>
                {alt.previewText && <div className="text-xs text-[#7a8c85] mt-0.5 truncate">{alt.previewText}</div>}
                {i === 0 && <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1F4538] mt-1 inline-block">AI Winner</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
