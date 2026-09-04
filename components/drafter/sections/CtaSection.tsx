"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, CallButtonField, EmailButtonField, SenderNameField } from "@/components/drafter/RichEditor";
import { DateTimeField } from "@/components/drafter/DateTimeField";
import { HiddenBanner } from "@/components/drafter/HiddenBanner";

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
  const { fields, setField, setFields, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  // Pre-fill boxes with the value the email would use by default, so nothing is
  // blank when there's a sensible default. These stay undefined in storage until
  // the user actually edits them (so date/time/rsvp keep mirroring the Hero).

  // Secondary senders from the Communities page prefill these boxes (email only —
  // the primary sender is the only name on the eblast, and their email stays above).
  const primarySender = community?.senders?.find((s) => s.isPrimary) ?? community?.senders?.[0] ?? null;
  const secondarySenderEmails = (community?.senders ?? [])
    .flatMap((s) => (s !== primarySender && s.email?.trim() ? [s.email.trim()] : []));

  const additionalEmails = fields.additionalFooterEmails ?? secondarySenderEmails;
  function updateAdditionalEmail(idx: number, html: string) {
    const next = [...additionalEmails];
    next[idx] = html;
    setField("additionalFooterEmails", next);
  }
  function addAdditionalEmail() {
    setField("additionalFooterEmails", [...additionalEmails, ""]);
  }
  function removeAdditionalEmail(idx: number) {
    // Keep an empty array rather than undefined — undefined would fall back to
    // the community's secondary senders and the removal wouldn't stick.
    setField("additionalFooterEmails", additionalEmails.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-5">
      {fields.finalCtaSectionHidden && (
        <HiddenBanner label="The Call-to-Action section" onRestore={() => setField("finalCtaSectionHidden", undefined)} />
      )}
      {fields.finalCtaButtonHidden && (
        <HiddenBanner label="The bottom call button" onRestore={() => setField("finalCtaButtonHidden", undefined)} />
      )}
      {fields.footerButtonHidden && (
        <HiddenBanner label="The Visit Our Website button" onRestore={() => setField("footerButtonHidden", undefined)} />
      )}

      {/* One box, two underlying fields — see DateTimeField. */}
      <DateTimeField
        label="Event Date & Time"
        hint="Edit to differ from the Hero section"
        date={fields.ctaEventDate ?? fields.eventDate}
        time={fields.ctaEventTime ?? fields.eventTime}
        onChange={({ date, time }) => setFields({ ctaEventDate: date, ctaEventTime: time })}
        className={baseInput}
        fieldName="ctaEventDate"
        activeEditorRef={activeEditorRef}
        activeEditorCallback={activeEditorCallback}
        activeFieldNameRef={activeFieldNameRef}
      />

      <Field label="RSVP Label" hint="Edit to differ from the Hero section">
        <RichInput
          value={fields.ctaRsvpLabel ?? fields.rsvpLabel ?? ""}
          onValueChange={(html) => setField("ctaRsvpLabel", html)}
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

      <Field label="Visit Our Website Button" hint="Text on the footer's website button. The link always points to the community's configured website. Select text to format it.">
        <RichInput
          value={fields.footerButtonLabel ?? "Visit Our Website"}
          onValueChange={(html) => setField("footerButtonLabel", html || undefined)}
          placeholder="Visit Our Website"
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
          onValueChange={(html) => setField("thankYouText", html)}
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
          onValueChange={(html) => setField("footerName", html)}
          placeholder="Community name"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="footerName"
        />
      </Field>

      <Field label="Salesperson Name" hint="The community's primary sender, set on the Community page. Select text to format it — the name itself can't be changed here.">
        <SenderNameField
          value={fields.footerSenderName ?? ""}
          onValueChange={(html) => setField("footerSenderName", html)}
          fieldName="footerSenderName"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
        />
      </Field>

      <Field label="Salesperson Email" hint="The community's primary sender, set on the Community page. Select text to format it — the address itself can't be changed here.">
        <EmailButtonField
          value={fields.footerSenderEmail ?? ""}
          onValueChange={(html) => setField("footerSenderEmail", html)}
          fieldName="footerSenderEmail"
          className={baseInput}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
        />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">Additional Emails</label>
          <button
            type="button"
            onClick={addAdditionalEmail}
            className="text-xs text-[#1F4538] hover:underline font-medium"
          >
            + Add email
          </button>
        </div>
        {additionalEmails.length === 0 ? (
          <p className="text-xs text-[#9aaba4]">Shown under the primary email above. Freely editable — not tied to a community record.</p>
        ) : (
          <div className="space-y-2">
            {additionalEmails.map((email, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1">
                  <RichInput
                    value={email}
                    onValueChange={(html) => updateAdditionalEmail(i, html)}
                    placeholder="e.g. jane@greatlakesmc.com"
                    className={baseInput}
                    activeEditorRef={activeEditorRef}
                    activeEditorCallback={activeEditorCallback}
                    activeFieldNameRef={activeFieldNameRef}
                    fieldName={`additionalFooterEmails-${i}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAdditionalEmail(i)}
                  title="Remove"
                  className="mt-2 p-1 rounded-lg text-[#c9c0b8] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5l.5-9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
