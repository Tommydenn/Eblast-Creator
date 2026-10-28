"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, RichBodyEditor } from "@/components/drafter/RichEditor";
import { SectionHeader } from "@/components/drafter/SectionHeader";
import { Field } from "@/components/drafter/Field";
import { BlockGap } from "@/components/drafter/BlockGap";
import { defaultGalleryLabel } from "@/lib/eblast-defaults";


const baseInput =
  "w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors";

export default function StorySection() {
  const { fields, setField, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();

  if (!fields) return null;

  const galleryDefault = defaultGalleryLabel(community);

  return (
    <div className="space-y-5">
      <SectionHeader label="Story" flag="storySectionHidden" />

      <BlockGap slot="story:start" />

      <Field label="Section Eyebrow" block="storyEyebrow" hint="Small label above the story section">
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

      <BlockGap slot="storyEyebrow" />

      <Field label="Section Title" block="storyScriptTitle" hint="Optional script-style title">
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

      <BlockGap slot="storyScriptTitle" />

      <Field
        label="Body Copy"
        block="bodyParagraphs"
        hint="Press Enter for a new line, twice to leave a blank line. Select text, then use the formatting toolbar above the preview to apply bold, color, or font."
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

      <BlockGap slot="bodyParagraphs" />

      <Field
        label="Gallery Label"
        block="galleryLabel"
        hint="Small label above the photo gallery. Select text to format it."
      >
        <RichInput
          value={fields.galleryLabel ?? galleryDefault}
          onValueChange={(html) => setField("galleryLabel", html)}
          placeholder="e.g. A Look Around Our Community"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="galleryLabel"
        />
      </Field>

      <BlockGap slot="galleryLabel" />
    </div>
  );
}
