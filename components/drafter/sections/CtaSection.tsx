"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";
import { RichInput, CallButtonField, EmailButtonField, SenderNameField } from "@/components/drafter/RichEditor";
import { DateTimeField } from "@/components/drafter/DateTimeField";
import { Field } from "@/components/drafter/Field";
import { BlockGap } from "@/components/drafter/BlockGap";
import { input, quiet } from "@/components/drafter/ui";
import {
  defaultFooterName,
  DEFAULT_THANK_YOU_TEXT,
  DEFAULT_WEBSITE_BUTTON_LABEL,
} from "@/lib/eblast-defaults";

/**
 * The call to action, and the footer under it.
 *
 * They were one tab called "Footer", which named one of them and hid the
 * other. They are two sections of the email, so they are two sections here —
 * each with its own row in the outline, its own eye, and its own place in the
 * order.
 */
export default function CtaSection() {
  const { fields, setField, setFields, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

  return (
    <>
      <BlockGap slot="cta:start" />

      <Field label="RSVP label" block="ctaRsvpLabel" hint="Follows the hero unless you change it.">
        <RichInput
          value={fields.ctaRsvpLabel ?? fields.rsvpLabel ?? ""}
          onValueChange={(html) => setField("ctaRsvpLabel", html)}
          placeholder="e.g. RSVP Required"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="ctaRsvpLabel"
        />
      </Field>

      <BlockGap slot="ctaRsvpLabel" />

      {/* One box, two underlying fields — see DateTimeField. */}
      <DateTimeField
        label="Date & time"
        hint="Follows the hero unless you change it."
        orderBlock="ctaEventDateTime"
        dateBlock="ctaEventDate"
        timeBlock="ctaEventTime"
        date={fields.ctaEventDate ?? fields.eventDate}
        time={fields.ctaEventTime ?? fields.eventTime}
        onChange={({ date, time }) => setFields({ ctaEventDate: date, ctaEventTime: time })}
        className={input}
        fieldName="ctaEventDate"
        activeEditorRef={activeEditorRef}
        activeEditorCallback={activeEditorCallback}
        activeFieldNameRef={activeFieldNameRef}
      />

      <BlockGap slot="ctaEventTime" />

      {/* The field prints the locked number under itself. It starts as a copy
          of the hero's button and goes its own way from the first edit. */}
      <Field label="Call button" flag="finalCtaButtonHidden" orderBlock="finalCtaButtonLabel" hint="Starts as a copy of the hero's.">
        <CallButtonField
          value={fields.finalCtaButtonLabel ?? fields.ctaButtonLabel ?? ""}
          onValueChange={(html) => setField("finalCtaButtonLabel", html || undefined)}
          fieldName="finalCtaButtonLabel"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
        />
      </Field>

      <BlockGap slot="finalCtaButtonLabel" />
    </>
  );
}

export function FooterSection() {
  const { fields, setField, community, activeEditorRef, activeEditorCallback, activeFieldNameRef } = useDraft();
  if (!fields) return null;

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
  function removeAdditionalEmail(idx: number) {
    // Keep an empty array rather than undefined — undefined would fall back to
    // the community's secondary senders and the removal wouldn't stick.
    setField("additionalFooterEmails", additionalEmails.filter((_, i) => i !== idx));
  }

  return (
    <>
      <BlockGap slot="top" />

      <Field label="Website button" flag="footerButtonHidden" orderBlock="footerButtonLabel" hint="Always links to the community's website.">
        <RichInput
          value={fields.footerButtonLabel ?? DEFAULT_WEBSITE_BUTTON_LABEL}
          onValueChange={(html) => setField("footerButtonLabel", html || undefined)}
          placeholder="Visit Our Website"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="footerButtonLabel"
        />
      </Field>

      <BlockGap slot="button" />

      <Field label="Thank you" block="thankYouText">
        <RichInput
          value={fields.thankYouText ?? DEFAULT_THANK_YOU_TEXT}
          onValueChange={(html) => setField("thankYouText", html)}
          placeholder="Thank You!"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="thankYouText"
        />
      </Field>

      <BlockGap slot="thankYou" />

      {/* These two print where their text comes from, and that it is locked,
          under the box itself — so the label above says only what it is. */}
      <Field label="Salesperson name" block="footerSenderName">
        <SenderNameField
          value={fields.footerSenderName ?? ""}
          onValueChange={(html) => setField("footerSenderName", html)}
          fieldName="footerSenderName"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
        />
      </Field>

      <BlockGap slot="senderName" />

      <Field label="Signature" block="footerName">
        <RichInput
          value={fields.footerName ?? defaultFooterName(community)}
          onValueChange={(html) => setField("footerName", html)}
          placeholder="Community name"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="footerName"
        />
      </Field>

      <BlockGap slot="footerName" />

      <Field label="Salesperson email" block="footerSenderEmail">
        <EmailButtonField
          value={fields.footerSenderEmail ?? ""}
          onValueChange={(html) => setField("footerSenderEmail", html)}
          fieldName="footerSenderEmail"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
        />
      </Field>

      <BlockGap slot="senderEmail" />

      {/* Unlike the two above, these are free text and belong to nobody's
          record, so they are added and removed here. */}
      <Field label="More emails" hint={additionalEmails.length ? undefined : "Shown under the salesperson's."}>
        <div className="space-y-2">
          {additionalEmails.map((email, i) => (
            <div key={i} className="group/line flex items-start gap-2">
              <div className="flex-1">
                <RichInput
                  value={email}
                  onValueChange={(html) => updateAdditionalEmail(i, html)}
                  placeholder="e.g. jane@greatlakesmc.com"
                  className={input}
                  activeEditorRef={activeEditorRef}
                  activeEditorCallback={activeEditorCallback}
                  activeFieldNameRef={activeFieldNameRef}
                  fieldName={`additionalFooterEmails-${i}`}
                />
              </div>
              <button
                type="button"
                onClick={() => removeAdditionalEmail(i)}
                title="Remove this address"
                className="mt-2 shrink-0 rounded-lg p-1 text-[#9aaba4] opacity-0 transition-all hover:text-[#a4552f] focus-visible:opacity-100 group-hover/line:opacity-100"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5l.5-9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setField("additionalFooterEmails", [...additionalEmails, ""])}
            className={quiet}
          >
            + Add an address
          </button>
        </div>
      </Field>
    </>
  );
}
