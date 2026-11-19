"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionLabel } from "@/components/ui/Card";

const INPUT =
  "w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 shadow-sm focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none transition-all";

/**
 * One tracking number, kept beside the thing that prints it.
 *
 * The two numbers exist to tell a call from an eblast apart from a call from
 * a Facebook event, and they used to sit together in one contact form —
 * which is exactly where you would not look for either of them. The eblast's
 * belongs with the senders and approvers; Facebook's belongs with the
 * Facebook page. Same field, same endpoint, two homes.
 */
export function TrackingNumberPanel({
  slug,
  field,
  label,
  hint,
  initialValue,
}: {
  slug: string;
  /** The community column this edits. */
  field: "trackingPhone" | "facebookPhone";
  label: string;
  hint?: string;
  initialValue: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Empty is a real answer, so it clears the field rather than being
        // skipped — a community can genuinely not have one of these.
        body: JSON.stringify({ [field]: value.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Save failed");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel className="text-forest-700">{label}</SectionLabel>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-sand-400 transition-colors hover:text-sand-700"
          >
            {initialValue ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-1.5 space-y-2">
          <input
            className={INPUT}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="(555) 000-0000"
          />
          {hint && <p className="text-xs text-sand-500">{hint}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-forest-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-forest-800 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                setValue(initialValue ?? "");
                setError(null);
                setEditing(false);
              }}
              className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs text-sand-600 transition-colors hover:text-sand-900"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 text-sm font-medium text-forest-700">
          {value || <span className="font-normal text-clay-600">not set</span>}
        </p>
      )}
    </div>
  );
}
