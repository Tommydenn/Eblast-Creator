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
      <div className="rounded-lg bg-[#f5f3ef] border border-[#e8e3dc] px-3 py-2.5 text-xs text-[#7a8c85] leading-relaxed">
        The bottom call-to-action section mirrors the event date, time, and RSVP label from the Hero tab. Edit those fields there to update both.
      </div>

      <Field label="Call Button Label" hint="The primary action button at the bottom of the email">
        <input
          type="text"
          value={fields.ctaButtonLabel}
          onChange={(e) => setField("ctaButtonLabel", e.target.value)}
          className={baseInput}
          placeholder="e.g. Call 920.504.3443"
        />
      </Field>

      <Field label="Footer Name" hint="Defaults to the community display name">
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
