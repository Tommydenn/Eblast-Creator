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

export default function HeroSection() {
  const { fields, setField } = useDraft();
  if (!fields) return null;

  return (
    <div className="space-y-5">
      <Field label="Headline">
        <input
          type="text"
          value={fields.headline}
          onChange={(e) => setField("headline", e.target.value)}
          className={baseInput}
          placeholder="Main event headline"
        />
      </Field>

      <Field label="Script Subheadline" hint="Optional handwritten-style subheading beneath the headline">
        <input
          type="text"
          value={fields.scriptSubheadline ?? ""}
          onChange={(e) => setField("scriptSubheadline", e.target.value || undefined)}
          className={baseInput}
          placeholder="Optional script text…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Event Date">
          <input
            type="text"
            value={fields.eventDate ?? ""}
            onChange={(e) => setField("eventDate", e.target.value || undefined)}
            className={baseInput}
            placeholder="e.g. Wednesday, May 13"
          />
        </Field>
        <Field label="Event Time">
          <input
            type="text"
            value={fields.eventTime ?? ""}
            onChange={(e) => setField("eventTime", e.target.value || undefined)}
            className={baseInput}
            placeholder="e.g. 2:00 PM"
          />
        </Field>
      </div>

      <Field label="RSVP Label" hint="Shown at the top of the hero and CTA sections. Leave blank if no RSVP required.">
        <input
          type="text"
          value={fields.rsvpLabel ?? ""}
          onChange={(e) => setField("rsvpLabel", e.target.value || undefined)}
          className={baseInput}
          placeholder="e.g. RSVP Required"
        />
      </Field>

      <Field label="Call Button Label" hint="The phone/action button inside the hero">
        <input
          type="text"
          value={fields.ctaButtonLabel}
          onChange={(e) => setField("ctaButtonLabel", e.target.value)}
          className={baseInput}
          placeholder="e.g. Call 920.504.3443"
        />
      </Field>
    </div>
  );
}
