"use client";

import React, { useRef, useEffect } from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput } from "@/components/drafter/RichEditor";

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

function toHtml(paras: string[]) {
  return paras.map((p) => "<div>" + (p || "<br>") + "</div>").join("");
}

function fromHtml(el: HTMLDivElement): string[] {
  const divs = Array.from(el.querySelectorAll(":scope > div"));
  if (divs.length === 0) {
    const html = el.innerHTML.replace(/<br\s*\/?>/gi, "").trim();
    return html ? [html] : [""];
  }
  const paras = divs
    .map((d) => (d as HTMLElement).innerHTML.replace(/<br\s*\/?>$/i, "").trim())
    .filter((p) => p !== "" && p !== "<br>");
  return paras.length > 0 ? paras : [""];
}

export default function StorySection() {
  const { fields, setField, activeEditorRef, activeEditorCallback } = useDraft();
  const editorRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);

  if (!fields) return null;

  function handleBodyInput() {
    const el = editorRef.current;
    if (!el) return;
    setField("bodyParagraphs", fromHtml(el));
  }

  // Initialize editor on mount
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (editorRef.current) {
      document.execCommand("defaultParagraphSeparator", false, "div");
      editorRef.current.innerHTML = toHtml(fields.bodyParagraphs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external field changes (e.g. from AI refine) without overwriting while user is editing
  const extKey = fields.bodyParagraphs.join(" ");
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isFocused.current && editorRef.current) {
      editorRef.current.innerHTML = toHtml(fields.bodyParagraphs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extKey]);

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
        />
      </Field>

      <Field
        label="Body Copy"
        hint="Select text, then use the formatting toolbar above the preview to apply bold, color, or font."
      >
        <div
          ref={editorRef}
          contentEditable={true}
          suppressContentEditableWarning={true}
          onFocus={() => {
            isFocused.current = true;
            activeEditorRef.current = editorRef.current;
            activeEditorCallback.current = handleBodyInput;
          }}
          onBlur={() => {
            isFocused.current = false;
            handleBodyInput();
          }}
          onInput={handleBodyInput}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          className="w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors leading-relaxed"
          style={{ minHeight: 200, outline: "none" }}
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
