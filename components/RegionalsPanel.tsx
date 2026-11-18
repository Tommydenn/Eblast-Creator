"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Regional } from "@/lib/db/queries";

interface CommunityOption {
  id: string;
  displayName: string;
}

interface Props {
  initialRegionals: Regional[];
  communities: CommunityOption[];
}

const INPUT =
  "w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 shadow-sm focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none transition-all";

type Form = { name: string; email: string; title: string; communityIds: string[] };
const EMPTY: Form = { name: "", email: "", title: "", communityIds: [] };

/**
 * Regionals, and which buildings each one covers.
 *
 * Here rather than on a community page because the relationship runs the other
 * way: one regional covers several communities, and setting it up building by
 * building would mean visiting six pages to add one person.
 */
export function RegionalsPanel({ initialRegionals, communities }: Props) {
  const router = useRouter();
  const [regionals, setRegionals] = useState(initialRegionals);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameById = new Map(communities.map((c) => [c.id, c.displayName]));
  const coverageOf = (r: Regional) => r.communityIds.map((id) => nameById.get(id) ?? id).join(", ");

  function startAdd() {
    setEditingId("new");
    setForm(EMPTY);
    setError(null);
  }

  function startEdit(r: Regional) {
    setEditingId(r.id);
    setForm({ name: r.name, email: r.email, title: r.title ?? "", communityIds: [...r.communityIds] });
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  }

  function toggleCommunity(id: string) {
    setForm((f) => ({
      ...f,
      communityIds: f.communityIds.includes(id)
        ? f.communityIds.filter((x) => x !== id)
        : [...f.communityIds, id],
    }));
  }

  async function save() {
    if (!form.name.trim()) {
      setError("A name is required.");
      return;
    }
    if (!form.email.trim()) {
      setError("An address is required, since it is what gets copied.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const isNew = editingId === "new";
      const res = await fetch(isNew ? "/api/regionals" : "/api/regionals/" + editingId, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Save failed.");
        return;
      }
      setRegionals((prev) =>
        isNew
          ? [...prev, json.regional].sort((a, b) => a.name.localeCompare(b.name))
          : prev.map((r) => (r.id === json.regional.id ? json.regional : r)),
      );
      cancel();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Regional) {
    const where =
      r.communityIds.length === 1 ? "1 community" : r.communityIds.length + " communities";
    if (!confirm("Remove " + r.name + "? They will stop being copied on approvals for " + where + ".")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/regionals/" + r.id, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not remove.");
        return;
      }
      setRegionals((prev) => prev.filter((x) => x.id !== r.id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const formProps = {
    form,
    setForm,
    communities,
    toggleCommunity,
    onSave: save,
    onCancel: cancel,
    busy,
    error,
  };

  return (
    <section id="regionals" className="mt-10 scroll-mt-6">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-sand-600">Regionals</h2>
          <p className="mt-0.5 text-xs text-sand-500">
            Copied on every approval for the communities they cover.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={startAdd}
            className="shrink-0 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs text-sand-600 transition-colors hover:text-sand-900"
          >
            Add regional
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white">
        {regionals.length === 0 && editingId === null && (
          <p className="px-4 py-6 text-center text-xs text-sand-400">Nobody yet.</p>
        )}

        {regionals.map((r) =>
          editingId === r.id ? (
            <RegionalForm key={r.id} {...formProps} />
          ) : (
            <div
              key={r.id}
              className="flex items-center gap-4 border-b border-sand-100 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-sand-900">
                  {r.name}
                  {r.title && <span className="ml-2 text-xs text-sand-400">{r.title}</span>}
                </div>
                <div className="truncate text-[11px] text-sand-400">{r.email}</div>
              </div>
              <div className="hidden min-w-0 flex-1 sm:block">
                <p className="truncate text-xs text-sand-600" title={coverageOf(r)}>
                  {r.communityIds.length === 0 ? "No communities" : coverageOf(r)}
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  onClick={() => startEdit(r)}
                  className="text-[11px] text-sand-400 transition-colors hover:text-sand-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(r)}
                  className="text-[11px] text-sand-400 transition-colors hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          ),
        )}

        {editingId === "new" && <RegionalForm {...formProps} />}
      </div>
    </section>
  );
}

function RegionalForm({
  form,
  setForm,
  communities,
  toggleCommunity,
  onSave,
  onCancel,
  busy,
  error,
}: {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  communities: CommunityOption[];
  toggleCommunity: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-3 border-b border-sand-100 bg-sand-50/60 px-4 py-4 last:border-b-0">
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          className={INPUT}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Name"
        />
        <input
          className={INPUT}
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="Email"
        />
        <input
          className={INPUT}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Title (optional)"
        />
      </div>

      <div className="max-h-48 overflow-y-auto rounded-lg border border-sand-200 bg-white p-2">
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
          {communities.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-sand-700 hover:bg-sand-50"
            >
              <input
                type="checkbox"
                checked={form.communityIds.includes(c.id)}
                onChange={() => toggleCommunity(c.id)}
                className="h-3.5 w-3.5 shrink-0 accent-forest-700"
              />
              <span className="truncate">{c.displayName}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={busy}
          className="rounded-lg bg-forest-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-forest-800 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs text-sand-600 transition-colors hover:text-sand-900"
        >
          Cancel
        </button>
        <span className="ml-auto text-[11px] text-sand-400">{form.communityIds.length} selected</span>
      </div>
    </div>
  );
}
