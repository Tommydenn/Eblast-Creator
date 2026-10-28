"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, CallButtonField } from "@/components/drafter/RichEditor";
import { Field } from "@/components/drafter/Field";
import { BlockGap } from "@/components/drafter/BlockGap";
import { DateTimeField } from "@/components/drafter/DateTimeField";
import { HeroImageSection } from "@/components/drafter/sections/ImagesSection";
import { communityAddressLine } from "@/lib/eblast-defaults";
import { input } from "@/components/drafter/ui";

/**
 * The hero: the photo, and the words printed under it.
 *
 * The photo is first because that is where the email draws it, and it is here
 * at all because it belongs to this section — it used to be on a tab of its
 * own, two tabs from the headline it sits above.
 */
export default function HeroSection() {
  const { fields, setField, setFields, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  return (
    <>
      <HeroImageSection />

      <BlockGap slot="hero:start" />

      <Field label="RSVP label" block="rsvpLabel" hint="Leave blank if none is needed.">
        <RichInput
          value={fields.rsvpLabel ?? ""}
          onValueChange={(html) => setField("rsvpLabel", html || undefined)}
          placeholder="e.g. RSVP Required"
          className={input}
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
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="headline"
        />
      </Field>

      <BlockGap slot="headline" />

      <Field label="Script subheadline" block="scriptSubheadline">
        <RichInput
          value={fields.scriptSubheadline ?? ""}
          onValueChange={(html) => setField("scriptSubheadline", html || undefined)}
          placeholder="Optional script text…"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="scriptSubheadline"
        />
      </Field>

      <BlockGap slot="scriptSubheadline" />

      {/* One box, two underlying fields — see DateTimeField. */}
      <DateTimeField
        label="Date & time"
        hint="Date on the first line, time on the second."
        orderBlock="eventDateTime"
        dateBlock="eventDate"
        timeBlock="eventTime"
        date={fields.eventDate}
        time={fields.eventTime}
        onChange={({ date, time }) =>
          // Editing the date answers the question, so the warning goes with it.
          setFields({ eventDate: date, eventTime: time, dateConflict: undefined })
        }
        className={input}
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
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#7a4a44]">{fields.dateConflict}</p>
          <button
            onClick={() => setField("dateConflict", undefined)}
            className="mt-1.5 text-[11px] font-medium text-[#9a3a34] underline-offset-2 hover:underline"
          >
            The date is right
          </button>
        </div>
      )}

      <BlockGap slot="eventTime" />

      <Field label="Address" block="heroAddress" hint="The community's own, unless you change it.">
        <RichInput
          value={fields.heroAddress ?? communityAddressLine(community)}
          onValueChange={(html) => setField("heroAddress", html)}
          placeholder="e.g. 1234 Oak St, Green Bay, WI 54301"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="heroAddress"
        />
      </Field>

      <BlockGap slot="heroAddress" />

      {/* The field prints the locked number under itself, so there is nothing
          left for a hint to say. */}
      <Field label="Call button" flag="ctaButtonHidden" orderBlock="ctaButtonLabel">
        <CallButtonField
          value={fields.ctaButtonLabel ?? ""}
          onValueChange={(html) => setField("ctaButtonLabel", html)}
          fieldName="ctaButtonLabel"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
        />
      </Field>

      <BlockGap slot="ctaButtonLabel" />
    </>
  );
}
