"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, CallButtonField } from "@/components/drafter/RichEditor";
import { HiddenBanner } from "@/components/drafter/HiddenBanner";
import { DateTimeField } from "@/components/drafter/DateTimeField";
import { communityAddressLine } from "@/lib/eblast-defaults";

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
  const { fields, setField, setFields, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  return (
    <div className="space-y-5">
      {fields.heroSectionHidden && (
        <HiddenBanner label="The Hero section" onRestore={() => setField("heroSectionHidden", undefined)} />
      )}
      {fields.ctaButtonHidden && (
        <HiddenBanner label="The hero's call button" onRestore={() => setField("ctaButtonHidden", undefined)} />
      )}

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

      {/* One box, two underlying fields — see DateTimeField. */}
      <DateTimeField
        label="Event Date & Time"
        date={fields.eventDate}
        time={fields.eventTime}
        onChange={({ date, time }) =>
          // Editing the date answers the question, so the warning goes with it.
          setFields({ eventDate: date, eventTime: time, dateConflict: undefined })
        }
        className={baseInput}
        fieldName="eventDate"
        activeEditorRef={activeEditorRef}
        activeEditorCallback={activeEditorCallback}
        activeFieldNameRef={activeFieldNameRef}
      />

      {/* The flyer named a weekday its own date does not fall on. One of the
          two is wrong and nothing here can tell which, so it stays put until
          somebody decides — it cannot be dismissed, only answered. */}
      {fields.dateConflict && (
        <div className="-mt-2 rounded-lg border border-[#f0d5d5] bg-[#fdf6f6] px-3 py-2">
          <p className="text-xs font-semibold text-[#9a3a34]">Check this date</p>
          <p className="mt-0.5 text-[11px] text-[#7a4a44] leading-relaxed">{fields.dateConflict}</p>
          <button
            onClick={() => setField("dateConflict", undefined)}
            className="mt-1.5 text-[11px] font-medium text-[#9a3a34] hover:underline underline-offset-2"
          >
            The date is right
          </button>
        </div>
      )}

      <Field label="Address Line" hint="Shown beneath the event date in the hero section. Defaults to the community's address.">
        <RichInput
          value={fields.heroAddress ?? communityAddressLine(community)}
          onValueChange={(html) => setField("heroAddress", html)}
          placeholder="e.g. 1234 Oak St, Green Bay, WI 54301"
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
