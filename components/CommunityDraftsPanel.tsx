"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDraft, type SavedDraft } from "@/context/DraftContext";

interface DraftMeta {
  id: string;
  communitySlug: string;
  communityName: string;
  savedAt: string;
  subject: string;
  imageCount: number;
}

export function CommunityDraftsPanel({ communitySlug }: { communitySlug: string }) {
  const router = useRouter();
  const { loadSavedDraft } = useDraft();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/saved-drafts?communitySlug=${encodeURIComponent(communitySlug)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!cancelled) {
          if (d.ok) setDrafts(d.drafts);
          else setFetchError(d.error ?? `HTTP ${r.status}`);
        }
      })
      .catch((err) => { if (!cancelled) setFetchError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [communitySlug]);

  async function openDraft(id: string) {
    setOpeningId(id);
    try {
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.ok && data.draft) {
        loadSavedDraft(data.draft as SavedDraft);
        router.push("/");
      }
    } catch {
      // Silently fail — user stays on community page.
    } finally {
      setOpeningId(null);
    }
  }

  async function deleteDraft(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/saved-drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // Silently fail.
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <p className="rounded-md border border-dashed border-sand-300 bg-sand-50/40 px-4 py-6 text-center text-sm text-sand-500">
        Loading drafts…
      </p>
    );
  }

  if (fetchError) {
    return (
      <p className="rounded-md border border-clay-200 bg-clay-50 px-4 py-4 text-center text-sm text-clay-700">
        Could not load drafts: {fetchError}
      </p>
    );
  }

  if (drafts.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-sand-300 bg-sand-50/40 px-4 py-6 text-center text-sm text-sand-500">
        No saved drafts for this community yet. Generate an eblast on the Drafter and click "Save draft" to keep it
        here (up to 8 per community).
      </p>
    );
  }

  return (
    <ul className="divide-y divide-sand-100 rounded-md border border-sand-200">
      {drafts.map((d) => (
        <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sand-900">{d.subject || "(no subject)"}</p>
            <p className="mt-0.5 text-[11px] text-sand-500">
              {new Date(d.savedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {d.imageCount > 0 ? ` · ${d.imageCount} image${d.imageCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => openDraft(d.id)}
              disabled={openingId === d.id}
              className="rounded-md border border-sand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sand-700 hover:border-clay-300 hover:bg-clay-50/40 disabled:opacity-50"
            >
              {openingId === d.id ? "Opening…" : "Open in Drafter"}
            </button>
            <button
              onClick={() => deleteDraft(d.id)}
              disabled={deletingId === d.id}
              title="Delete draft"
              aria-label="Delete draft"
              className="rounded p-1 text-sand-400 hover:bg-sand-100 hover:text-clay-600 disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5l.5-9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
