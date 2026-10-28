"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, RichBodyEditor } from "@/components/drafter/RichEditor";
import { Field } from "@/components/drafter/Field";
import { BlockGap } from "@/components/drafter/BlockGap";
import { input } from "@/components/drafter/ui";

/**
 * The story: an eyebrow, a title and the body copy.
 *
 * The gallery label used to be typed here as well, because it was the last
 * thing on the Story tab and there was nowhere better. It is drawn above the
 * photo grid, so it is edited there now.
 */
export default function StorySection() {
  const { fields, setField, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  return (
    <>
      <BlockGap slot="story:start" />

      <Field label="Eyebrow" block="storyEyebrow">
        <RichInput
          value={fields.storyEyebrow}
          onValueChange={(html) => setField("storyEyebrow", html)}
          placeholder="e.g. A Look Inside Our Kitchen"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="storyEyebrow"
        />
      </Field>

      <BlockGap slot="storyEyebrow" />

      <Field label="Script title" block="storyScriptTitle">
        <RichInput
          value={fields.storyScriptTitle ?? ""}
          onValueChange={(html) => setField("storyScriptTitle", html || undefined)}
          placeholder="Optional script heading…"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="storyScriptTitle"
        />
      </Field>

      <BlockGap slot="storyScriptTitle" />

      <Field label="Body copy" block="bodyParagraphs" hint="Enter for a new line, twice for a blank one.">
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
    </>
  );
}
