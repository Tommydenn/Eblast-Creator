"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput } from "@/components/drafter/RichEditor";

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

export default function HeroSection() {
  const { fields, setField, activeEditorRef, activeEditorCallback } = useDraft();
  if (!fields) return null;

  return (
    <div className="space-y-5">
      <Field label="Headline">
        <RichInput
          value={fields.headline}
          onValueChange={(html) => setField("headline", html)}
          placeholder="Main event headline"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
        />
      </Field>

      <Field label="Script Subheadline" hint="Optional handwritten-style subheading beneath the headline">
        <RichInput
          value={fields.scriptSubheadline ?? ""}
          onValueChange={(html) => setField("scriptSubheadline", html || undefined)}
          placeholder="Optional script text…"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Event Date">
          <RichInput
            value={fields.eventDate ?? ""}
            onValueChange={(html) => setField("eventDate", html || undefined)}
            placeholder="e.g. Wednesday, May 13"
            className={baseInput}
            activeEditorRef={activeEditorRef}
            activeEditorCallback={activeEditorCallback}
          />
        </Field>
        <Field label="Event Time">
          <RichInput
            value={fields.eventTime ?? ""}
            onValueChange={(html) => setField("eventTime", html || undefined)}
            placeholder="e.g. 2:00 PM"
            className={baseInput}
            activeEditorRef={activeEditorRef}
            activeEditorCallback={activeEditorCallback}
          />
        </Field>
      </div>

      <Field label="RSVP Label" hint="Shown at the top of the hero and CTA sections. Leave blank if no RSVP required.">
        <RichInput
          value={fields.rsvpLabel ?? ""}
          onValueChange={(html) => setField("rsvpLabel", html || undefined)}
          placeholder="e.g. RSVP Required"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
        />
      </Field>

    </div>
  );
}
