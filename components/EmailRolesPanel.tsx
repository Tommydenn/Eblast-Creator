"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SectionLabel } from "@/components/ui/Card";

interface Props {
  slug: string;
  /** The primary sender's address, which is what both fields fall back to. */
  fallbackEmail: string;
  fallbackName: string;
  initialApproverEmail: string | null;
  initialHubspotFromEmail: string | null;
  regionals: Array<{ id: string; name: string; email: string }>;
}

const INPUT =
  "w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 shadow-sm focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none transition-all";

/**
 * The addresses that are not the signature.
 *
 * Both are empty for nearly every community, and an empty one means the
 * primary sender. That is said by showing the sender's own address greyed in
 * place of the value rather than by a sentence under the field: the fallback
 * is visible, so there is nothing to explain.
 */
export function EmailRolesPanel({
  slug,
  fallbackEmail,
  fallbackName,
  initialApproverEmail,
  initialHubspotFromEmail,
  regionals,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approverEmail, setApproverEmail] = useState(initialApproverEmail ?? "");
  const [hubspotFromEmail, setHubspotFromEmail] = useState(initialHubspotFromEmail ?? "");

  function cancel() {
    setApproverEmail(initialApproverEmail ?? "");
    setHubspotFromEmail(initialHubspotFromEmail ?? "");
    setError(null);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approverEmail: approverEmail.trim() || null,
          hubspotFromEmail: hubspotFromEmail.trim() || null,
        }),
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

  const fallback = fallbackEmail || "no sender on file";
  const asSender = (value: string) =>
    value ? (
      <span className="text-sand-900">{value}</span>
    ) : (
      <span className="text-sand-400">{fallback}</span>
    );

  if (!editing) {
    return (
      <div className="mt-5 space-y-4 border-t border-sand-200 pt-5">
        <div className="flex items-center justify-between">
          <SectionLabel>Approver</SectionLabel>
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-sand-400 hover:text-sand-700 transition-colors"
          >
            Edit
          </button>
        </div>
        <p className="-mt-3 text-sm">{asSender(approverEmail)}</p>

        <div>
          <SectionLabel>HubSpot sends as</SectionLabel>
          <p className="mt-0.5 text-sm">{asSender(hubspotFromEmail)}</p>
        </div>

        <div>
          <SectionLabel>Copied on approvals</SectionLabel>
          <p className="mt-0.5 text-sm">
            {regionals.length === 0 ? (
              <Link href="/communities#regionals" className="text-sand-400 hover:text-sand-700 transition-colors">
                nobody yet
              </Link>
            ) : (
              <span className="text-sand-900">{regionals.map((r) => r.name).join(", ")}</span>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4 border-t border-sand-200 pt-5">
      <div>
        <SectionLabel>Approver</SectionLabel>
        <input
          className={`${INPUT} mt-1`}
          value={approverEmail}
          onChange={(e) => setApproverEmail(e.target.value)}
          placeholder={fallback}
        />
      </div>
      <div>
        <SectionLabel>HubSpot sends as</SectionLabel>
        <input
          className={`${INPUT} mt-1`}
          value={hubspotFromEmail}
          onChange={(e) => setHubspotFromEmail(e.target.value)}
          placeholder={fallback}
        />
      </div>
      <p className="text-xs text-sand-500">
        Left empty, both are {fallbackName || "the primary sender"}.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-forest-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-800 disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={cancel}
          className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs text-sand-600 hover:text-sand-900 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
