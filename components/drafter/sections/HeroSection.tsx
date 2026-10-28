"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, CallButtonField } from "@/components/drafter/RichEditor";
import { SectionHeader } from "@/components/drafter/SectionHeader";
import { Field } from "@/components/drafter/Field";
import { BlockGap } from "@/components/drafter/BlockGap";
import { DateTimeField } from "@/components/drafter/DateTimeField";
import { communityAddressLine } from "@/lib/eblast-defaults";


const baseInput = "w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors";

export default function HeroSection() {
  const { fields, setField, setFields, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  return (
    <div className="space-y-5">
      {/* The logo band. It has no fields of its own, so this row is the
          only place it can be turned off and on. */}
      <SectionHeader label="Header" flag="headerSectionHidden" />

      <SectionHeader label="Hero" flag="heroSectionHidden" />

      <BlockGap slot="hero:start" />

      <Field label="RSVP Label" block="rsvpLabel" hint="Shown at the top of the hero and CTA sections. Leave blank if no RSVP required.">
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

      <BlockGap slot="rsvpLabel" />

      <Field label="Headline" block="headline">
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

      <BlockGap slot="headline" />

      <Field label="Script Subheadline" block="scriptSubheadline" hint="Optional handwritten-style subheading beneath the headline">
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

      <BlockGap slot="scriptSubheadline" />

      {/* One box, two underlying fields — see DateTimeField. */}
      <DateTimeField
        label="Event Date & Time"
        orderBlock="eventDateTime"
        dateBlock="eventDate"
        timeBlock="eventTime"
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

      <BlockGap slot="eventTime" />

      <Field label="Address Line" block="heroAddress" hint="Shown beneath the event date in the hero section. Defaults to the community's address.">
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

      <BlockGap slot="heroAddress" />

      <Field label="Call Button Label" flag="ctaButtonHidden" orderBlock="ctaButtonLabel" hint="Text on the hero's call-to-action button. Independent from the bottom Call Button Label — select text to format it (bold, color, size…), the number stays locked.">
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

      <BlockGap slot="ctaButtonLabel" />
    </div>
  );
}
