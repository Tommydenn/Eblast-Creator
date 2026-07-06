"use client";

import React from "react";
import { useDraft } from "@/context/DraftContext";

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
  const { fields, setField } = useDraft();
  if (!fields) return null;

  return (
    <div className="space-y-5">
      <p className="text-xs text-[#7a8c85] leading-relaxed">
        The final call-to-action section at the bottom of the email, with event details and a button.
      </p>

      <Field label="CTA Eyebrow">
        <input
          type="text"
          value={fields.ctaEyebrow}
          onChange={(e) => setField("ctaEyebrow", e.target.value)}
          className={baseInput}
          placeholder="e.g. Reserve Your Seat"
        />
      </Field>

      <Field label="CTA Date / Headline" hint="Shown large above the button">
        <input
          type="text"
          value={fields.ctaHeadline}
          onChange={(e) => setField("ctaHeadline", e.target.value)}
          className={baseInput}
          placeholder="e.g. Wednesday, May 13 · 2:00 PM"
        />
      </Field>

      <Field label="CTA Subline" hint="Supporting line below the headline">
        <input
          type="text"
          value={fields.ctaSubline}
          onChange={(e) => setField("ctaSubline", e.target.value)}
          className={baseInput}
          placeholder="e.g. Seating is limited · RSVP required"
        />
      </Field>

      <Field label="CTA Button Label">
        <input
          type="text"
          value={fields.ctaButtonLabel}
          onChange={(e) => setField("ctaButtonLabel", e.target.value)}
          className={baseInput}
          placeholder="e.g. Call 920.504.3443"
        />
      </Field>

      <Field label="Footer Name" hint="Defaults to community display name">
        <input
          type="text"
          value={fields.footerName ?? ""}
          onChange={(e) => setField("footerName", e.target.value || undefined)}
          className={baseInput}
          placeholder="Leave blank to use community name"
        />
      </Field>
    </div>
  );
}
