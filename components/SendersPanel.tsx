"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunitySender } from "@/lib/db/queries";
import { Badge } from "@/components/ui/Badge";
import { SectionLabel } from "@/components/ui/Card";

interface Props {
  slug: string;
  initialSenders: CommunitySender[];
}

type FormState = { name: string; email: string; title: string; isPrimary: boolean };
const emptyForm: FormState = { name: "", email: "", title: "", isPrimary: false };

export function SendersPanel({ slug, initialSenders }: Props) {
  const router = useRouter();
  const [senders, setSenders] = useState(initialSenders);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd() {
    setEditingId("new");
    setForm({ ...emptyForm, isPrimary: senders.length === 0 });
    setError(null);
  }

  function startEdit(s: CommunitySender) {
    setEditingId(s.id);
    setForm({ name: s.name, email: s.email, title: s.title ?? "", isPrimary: s.isPrimary });
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingId === "new") {
        const res = await fetch(`/api/communities/${slug}/senders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Save failed."); return; }
        // If new sender is primary, mark all others non-primary
        setSenders(prev => {
          const updated = form.isPrimary ? prev.map(s => ({ ...s, isPrimary: false })) : prev;
          return [...updated, json.sender].sort(sortSenders);
        });
      } else {
        const res = await fetch(`/api/communities/${slug}/senders/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Save failed."); return; }
        setSenders(prev => {
          const updated = prev.map(s => {
            if (form.isPrimary) return { ...s, isPrimary: s.id === editingId };
            return s.id === editingId ? json.sender : s;
          });
          return updated.sort(sortSenders);
        });
      }
      setEditingId(null);
      setForm(emptyForm);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${slug}/senders/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSenders(prev => prev.filter(s => s.id !== id));
        if (editingId === id) cancel();
        router.refresh();
      } else {
        setError("Delete failed.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${slug}/senders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (res.ok) {
        setSenders(prev => prev.map(s => ({ ...s, isPrimary: s.id === id })).sort(sortSenders));
        router.refresh();
      }
    } catch {
      // silent
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>From identities ({senders.length})</SectionLabel>
        {editingId === null && (
          <button
            type="button"
            onClick={startAdd}
            className="text-[11px] font-medium text-sand-500 hover:text-sand-800 transition-colors"
          >
            + Add sender
          </button>
        )}
      </div>

      {senders.length === 0 && editingId === null && (
        <p className="rounded-md border border-dashed border-clay-300 bg-clay-50/50 px-3 py-2.5 text-xs text-clay-700">
          No senders configured. Add one — it will appear in the From: field of every eblast.
        </p>
      )}

      <ul className="space-y-1.5">
        {senders.map(s => (
          <li key={s.id}>
            {editingId === s.id ? (
              <SenderForm
                form={form}
                onChange={setForm}
                onSave={save}
                onCancel={cancel}
                busy={busy}
                error={error}
                isOnly={senders.length === 1}
              />
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-md border border-sand-200 bg-sand-50/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sand-900">{s.name}</p>
                  <p className="truncate text-xs text-sand-500">
                    {s.email}
                    {s.title && <span className="ml-2 text-sand-400">· {s.title}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.isPrimary ? (
                    <Badge variant="success">Primary</Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPrimary(s.id)}
                      disabled={busy}
                      className="text-[11px] text-sand-400 hover:text-forest-700 transition-colors disabled:opacity-40"
                    >
                      Set primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="text-[11px] text-sand-400 hover:text-sand-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Remove ${s.name}?`)) remove(s.id); }}
                    disabled={busy}
                    className="text-[11px] text-clay-400 hover:text-clay-700 transition-colors disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editingId === "new" && (
        <SenderForm
          form={form}
          onChange={setForm}
          onSave={save}
          onCancel={cancel}
          busy={busy}
          error={error}
          isOnly={senders.length === 0}
        />
      )}
    </div>
  );
}

function SenderForm({
  form,
  onChange,
  onSave,
  onCancel,
  busy,
  error,
  isOnly,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  isOnly: boolean;
}) {
  return (
    <div className="rounded-md border border-sand-300 bg-white p-3 shadow-sm space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10.5px] font-medium uppercase tracking-[0.12em] text-sand-500 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => onChange({ ...form, name: e.target.value })}
            placeholder="Jane Smith"
            className="w-full rounded border border-sand-200 bg-sand-50 px-2.5 py-1.5 text-sm text-sand-900 placeholder:text-sand-400 focus:border-sand-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10.5px] font-medium uppercase tracking-[0.12em] text-sand-500 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => onChange({ ...form, email: e.target.value })}
            placeholder="jane@community.com"
            className="w-full rounded border border-sand-200 bg-sand-50 px-2.5 py-1.5 text-sm text-sand-900 placeholder:text-sand-400 focus:border-sand-400 focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10.5px] font-medium uppercase tracking-[0.12em] text-sand-500 mb-1">Title (optional)</label>
        <input
          type="text"
          value={form.title}
          onChange={e => onChange({ ...form, title: e.target.value })}
          placeholder="Director of Sales"
          className="w-full rounded border border-sand-200 bg-sand-50 px-2.5 py-1.5 text-sm text-sand-900 placeholder:text-sand-400 focus:border-sand-400 focus:outline-none"
        />
      </div>
      {!isOnly && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={e => onChange({ ...form, isPrimary: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-sand-300"
          />
          <span className="text-xs text-sand-700">Make primary sender (used by default on eblasts)</span>
        </label>
      )}
      {error && <p className="text-[11px] text-clay-600">{error}</p>}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded bg-sand-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-sand-900 disabled:opacity-50 transition-colors"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-xs text-sand-500 hover:text-sand-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function sortSenders(a: CommunitySender, b: CommunitySender): number {
  if (a.isPrimary && !b.isPrimary) return -1;
  if (b.isPrimary && !a.isPrimary) return 1;
  return a.name.localeCompare(b.name);
}
