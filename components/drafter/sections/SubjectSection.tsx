"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { Field } from "@/components/drafter/Field";
import { input as inputCls, eyebrow } from "@/components/drafter/ui";

/**
 * The subject line and the inbox preview — the two things that are read before
 * the email is opened, and the only two that are not part of it.
 *
 * It had a Field of its own, a near-copy of the shared one that existed only
 * because these boxes have nothing to hide and nothing to reorder. The shared
 * one draws no controls when a box has none, so there is nothing left for a
 * second copy to do.
 */
export default function SubjectSection() {
  const { fields, setField, subjectSpecialist, swapSubjectLine } = useDraft();
  if (!fields) return null;

  return (
    <>
      <Field label="Subject" hint={`${fields.subject.length}/90 — aim under 60`}>
        <input
          type="text"
          value={fields.subject}
          onChange={(e) => setField("subject", e.target.value)}
          className={inputCls}
          placeholder="Email subject…"
          maxLength={90}
        />
      </Field>

      <Field
        label="Inbox preview"
        hint={`${fields.previewText.length}/150 — aim under 120. Shown under the subject in the inbox, never in the email.`}
      >
        <textarea
          value={fields.previewText}
          onChange={(e) => setField("previewText", e.target.value)}
          rows={2}
          className={inputCls + " resize-none"}
          placeholder="Inbox preview snippet…"
          maxLength={150}
        />
      </Field>

      {subjectSpecialist && subjectSpecialist.alternatives.length > 0 && (
        <div>
          <p className={eyebrow + " mb-2"}>Suggestions</p>
          <div className="space-y-2">
            {[subjectSpecialist.winner, ...subjectSpecialist.alternatives].map((alt, i) => (
              <button
                key={i}
                onClick={() => swapSubjectLine(alt.subject, alt.previewText)}
                className={[
                  "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  alt.subject === fields.subject
                    ? "border-[#1F4538] bg-[#f0f5f2] text-[#1F4538]"
                    : "border-[#e8e3dc] bg-white text-[#1a1a1a] hover:border-[#1F4538]/40 hover:bg-[#faf9f6]",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{alt.subject}</span>
                  {i === 0 && (
                    <span className="mt-0.5 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[#9aaba4]">
                      Suggested
                    </span>
                  )}
                </div>
                {alt.previewText && <div className="mt-0.5 truncate text-xs text-[#7a8c85]">{alt.previewText}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
