"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, RichBodyEditor } from "@/components/drafter/RichEditor";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-[#9aaba4]">{hint}</p>}
    </div>
  );
}

const baseInput =
  "w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors";

export default function StorySection() {
  const { fields, setField, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();

  if (!fields) return null;

  return (
    <div className="space-y-5">
      <Field label="Section Eyebrow" hint="Small label above the story section">
        <RichInput
          value={fields.storyEyebrow}
          onValueChange={(html) => setField("storyEyebrow", html)}
          placeholder="e.g. A Look Inside Our Kitchen"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="storyEyebrow"
        />
      </Field>

      <Field label="Section Title" hint="Optional script-style title">
        <RichInput
          value={fields.storyScriptTitle ?? ""}
          onValueChange={(html) => setField("storyScriptTitle", html || undefined)}
          placeholder="Optional script heading…"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="storyScriptTitle"
        />
      </Field>

      <Field
        label="Body Copy"
        hint="Press Enter for a new paragraph. Select text, then use the formatting toolbar above the preview to apply bold, color, or font."
      >
        <RichBodyEditor
          paragraphs={fields.bodyParagraphs}
          onChange={(paras) => setField("bodyParagraphs", paras)}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="bodyParagraphs"
        />
      </Field>

      <Field
        label="Gallery Label"
        hint={`Small label above the photo gallery (defaults to "A Look Around {Community}")`}
      >
        <input
          type="text"
          value={fields.galleryLabel ?? ""}
          onChange={(e) =>
            setField("galleryLabel", e.target.value || undefined)
          }
          className={baseInput}
          placeholder="Leave blank to use default"
        />
      </Field>
    </div>
  );
}
