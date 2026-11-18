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
  /** The regionals covering this community today. */
  regionals: Array<{ id: string; name: string; email: string }>;
  /** Everyone on the list, which is who this community could be covered by. */
  allRegionals: Array<{ id: string; name: string; email: string }>;
}

const INPUT =
  "w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 shadow-sm focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none transition-all";
/** The same field sharing a row rather than owning one. */
const NARROW = INPUT.replace("w-full", "min-w-[8rem] flex-1").replace("py-2", "py-1.5");

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
  allRegionals,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approverEmail, setApproverEmail] = useState(initialApproverEmail ?? "");
  const [hubspotFromEmail, setHubspotFromEmail] = useState(initialHubspotFromEmail ?? "");
  const [regionalIds, setRegionalIds] = useState(regionals.map((r) => r.id));
  // The roster is held locally so somebody added here appears at once,
  // already ticked, without a round trip to the page that owns the list.
  const [roster, setRoster] = useState(allRegionals);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addingBusy, setAddingBusy] = useState(false);

  async function addRegional() {
    if (!newName.trim() || !newEmail.trim()) {
      setError("A new regional needs a name and an address.");
      return;
    }
    setAddingBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/regionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim(), communityIds: [] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not add them");
      setRoster((prev) => [...prev, json.regional]);
      setRegionalIds((prev) => [...prev, json.regional.id]);
      setNewName("");
      setNewEmail("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add them");
    } finally {
      setAddingBusy(false);
    }
  }

  function cancel() {
    setApproverEmail(initialApproverEmail ?? "");
    setHubspotFromEmail(initialHubspotFromEmail ?? "");
    setRegionalIds(regionals.map((r) => r.id));
    setAdding(false);
    setNewName("");
    setNewEmail("");
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
          regionalIds,
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
              // Linked because this is where somebody goes looking for the
              // list, and the list itself lives on the other page.
              <Link
                href="/communities#regionals"
                className="text-sand-900 transition-colors hover:text-forest-700"
              >
                {regionals.map((r) => r.name).join(", ")}
              </Link>
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
      <p className="-mt-2 text-xs text-sand-500">
        Left empty, both are {fallbackName || "the primary sender"}.
      </p>

      <div>
        <SectionLabel>Copied on approvals</SectionLabel>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {roster.map((r) => {
            const on = regionalIds.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                title={r.email}
                onClick={() =>
                  setRegionalIds((prev) => (on ? prev.filter((x) => x !== r.id) : [...prev, r.id]))
                }
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? "border-forest-300 bg-forest-50 text-forest-700"
                    : "border-sand-200 bg-white text-sand-400 hover:text-sand-800"
                }`}
              >
                {r.name}
              </button>
            );
          })}
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-full border border-dashed border-sand-300 px-2.5 py-1 text-xs text-sand-400 transition-colors hover:text-sand-800"
            >
              + Someone new
            </button>
          )}
        </div>

        {adding && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className={NARROW}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
            />
            <input
              className={NARROW}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
            />
            <button
              onClick={addRegional}
              disabled={addingBusy}
              className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs text-sand-700 transition-colors hover:text-sand-900 disabled:opacity-40"
            >
              {addingBusy ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => { setAdding(false); setNewName(""); setNewEmail(""); }}
              className="text-xs text-sand-400 transition-colors hover:text-sand-700"
            >
              Cancel
            </button>
          </div>
        )}

        <p className="mt-2 text-[11px]">
          <Link href="/communities#regionals" className="text-sand-400 transition-colors hover:text-sand-700">
            Edit or remove a regional
          </Link>
        </p>
      </div>
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
