"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, CallButtonField } from "@/components/drafter/RichEditor";

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
  const { fields, setField, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  // Default address line shown in the box when the field hasn't been overridden
  // (matches the renderer's fallback), so the box is pre-filled rather than blank.
  const communityAddressLine = community
    ? [community.displayName, community.address?.street, community.address?.city,
       [community.address?.state, community.address?.zip].filter(Boolean).join(" ")]
        .filter(Boolean).join(", ")
    : "";

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
          activeFieldNameRef={activeFieldNameRef}
          fieldName="headline"
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
          activeFieldNameRef={activeFieldNameRef}
          fieldName="scriptSubheadline"
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
            activeFieldNameRef={activeFieldNameRef}
            fieldName="eventDate"
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
            activeFieldNameRef={activeFieldNameRef}
            fieldName="eventTime"
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
          activeFieldNameRef={activeFieldNameRef}
          fieldName="rsvpLabel"
        />
      </Field>

      <Field label="Address Line" hint="Shown beneath the event date in the hero section. Defaults to the community name and address.">
        <RichInput
          value={fields.heroAddress ?? communityAddressLine}
          onValueChange={(html) => setField("heroAddress", html || undefined)}
          placeholder="e.g. Arbor Crossing, 1234 Oak St, Green Bay, WI 54301"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="heroAddress"
        />
      </Field>

      <Field label="Call Button Label" hint="Text on the hero's call-to-action button. Independent from the bottom Call Button Label — select text to format it (bold, color, size…), the number stays locked.">
        <CallButtonField
          value={fields.ctaButtonLabel ?? ""}
          onValueChange={(html) => setField("ctaButtonLabel", html)}
          fieldName="ctaButtonLabel"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
        />
      </Field>

    </div>
  );
}
