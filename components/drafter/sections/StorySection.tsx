"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichBodyEditor } from "@/components/drafter/RichEditor";

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
  const { fields, setField, community } = useDraft();
  if (!fields) return null;

  const rawColors = [
    community?.brand?.primary,
    community?.brand?.accent,
    community?.brand?.secondary,
  ];
  const brandColors: string[] = rawColors.filter(Boolean) as string[];

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
          onChange={(e) =>
            setField("storyScriptTitle", e.target.value || undefined)
          }
          className={baseInput}
          placeholder="Optional script heading…"
        />
      </Field>

      <Field
        label="Body Copy"
        hint="Select text, then use the toolbar to add bold, italic, or color."
      >
        <RichBodyEditor
          paragraphs={fields.bodyParagraphs}
          onChange={(paras) =>
            setField("bodyParagraphs", paras.length > 0 ? paras : [""])
          }
          brandColors={brandColors}
        />
      </Field>

      <Field
        label="Gallery Label"
        hint='Small label above the photo gallery (defaults to "A Look Around {Community}")'
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
