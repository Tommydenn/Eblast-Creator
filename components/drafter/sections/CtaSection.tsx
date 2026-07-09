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

export default function CtaSection() {
  const { fields, setField, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  // Pre-fill boxes with the value the email would use by default, so nothing is
  // blank when there's a sensible default. These stay undefined in storage until
  // the user actually edits them (so date/time/rsvp keep mirroring the Hero).

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Event Date" hint="Edit to differ from the Hero section">
          <RichInput
            value={fields.ctaEventDate ?? fields.eventDate ?? ""}
            onValueChange={(html) => setField("ctaEventDate", html || undefined)}
            placeholder="e.g. Wednesday, May 13"
            className={baseInput}
            activeEditorRef={activeEditorRef}
            activeEditorCallback={activeEditorCallback}
            activeFieldNameRef={activeFieldNameRef}
            fieldName="ctaEventDate"
          />
        </Field>
        <Field label="Event Time" hint="Edit to differ from the Hero section">
          <RichInput
            value={fields.ctaEventTime ?? fields.eventTime ?? ""}
            onValueChange={(html) => setField("ctaEventTime", html || undefined)}
            placeholder="e.g. 2:00 PM"
            className={baseInput}
            activeEditorRef={activeEditorRef}
            activeEditorCallback={activeEditorCallback}
            activeFieldNameRef={activeFieldNameRef}
            fieldName="ctaEventTime"
          />
        </Field>
      </div>

      <Field label="RSVP Label" hint="Edit to differ from the Hero section">
        <RichInput
          value={fields.ctaRsvpLabel ?? fields.rsvpLabel ?? ""}
          onValueChange={(html) => setField("ctaRsvpLabel", html || undefined)}
          placeholder="e.g. RSVP Required"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="ctaRsvpLabel"
        />
      </Field>

      <Field label="Call Button Label" hint="The action button at the bottom of the email. Generates the same as the Hero's button, but is independently editable/formattable from here on — the number stays locked.">
        <CallButtonField
          value={fields.finalCtaButtonLabel ?? fields.ctaButtonLabel ?? ""}
          onValueChange={(html) => setField("finalCtaButtonLabel", html || undefined)}
          fieldName="finalCtaButtonLabel"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
        />
      </Field>

      <Field label="Visit Website Button" hint="Text on the footer's website button. The link always points to the community's configured website. Select text to format it.">
        <RichInput
          value={fields.footerButtonLabel ?? "Visit Website"}
          onValueChange={(html) => setField("footerButtonLabel", html || undefined)}
          placeholder="Visit Website"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="footerButtonLabel"
        />
      </Field>

      <Field label="Thank You Text" hint="Closing salutation displayed in the email footer.">
        <RichInput
          value={fields.thankYouText ?? "Thank You!"}
          onValueChange={(html) => setField("thankYouText", html || undefined)}
          placeholder="Thank You!"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="thankYouText"
        />
      </Field>

      <Field label="Footer Signature" hint="Name appearing below 'Thank You!' in the email footer.">
        <RichInput
          value={fields.footerName ?? community?.displayName ?? ""}
          onValueChange={(html) => setField("footerName", html || undefined)}
          placeholder="Community name"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="footerName"
        />
      </Field>
    </div>
  );
}
