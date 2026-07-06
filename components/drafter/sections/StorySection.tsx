"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-[#9aaba4]">{hint}</p>}
    </div>
  );
}

const baseInput = "w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors";

export default function StorySection() {
  const { fields, setField } = useDraft();
  if (!fields) return null;

  const bodyText = fields.bodyParagraphs.join("\n\n");

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const paras = e.target.value.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
    setField("bodyParagraphs", paras.length > 0 ? paras : [""]);
  }

  return (
    <div className="space-y-5">
      <Field label="Section Eyebrow" hint="Small label above the story section">
        <input
          type="text"
          value={fields.storyEyebrow}
          onChange={(e) => setField("storyEyebrow", e.target.value)}
          className={baseInput}
          placeholder="e.g. A Look Inside Our Kitchen"
        />
      </Field>

      <Field label="Section Title" hint="Optional script-style title">
        <input
          type="text"
          value={fields.storyScriptTitle ?? ""}
          onChange={(e) => setField("storyScriptTitle", e.target.value || undefined)}
          className={baseInput}
          placeholder="Optional script heading…"
        />
      </Field>

      <Field
        label="Body Copy"
        hint="Separate paragraphs with a blank line. Preview updates instantly."
      >
        <textarea
          value={bodyText}
          onChange={handleBodyChange}
          rows={10}
          className={baseInput + " resize-y leading-relaxed"}
          placeholder="Write the main email body here.&#10;&#10;Separate paragraphs with a blank line."
        />
      </Field>

      <Field label="Gallery Label" hint="Small label above the photo gallery (defaults to &quot;A Look Around {Community}&quot;)">
        <input
          type="text"
          value={fields.galleryLabel ?? ""}
          onChange={(e) => setField("galleryLabel", e.target.value || undefined)}
          className={baseInput}
          placeholder="Leave blank to use default"
        />
      </Field>
    </div>
  );
}
