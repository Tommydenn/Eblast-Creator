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
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/saved-drafts?communitySlug=${encodeURIComponent(communitySlug)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
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
    setActionError(null);
    try {
      const [draftRes, imagesRes] = await Promise.all([
        fetch(`/api/saved-drafts/${encodeURIComponent(id)}`),
        fetch(`/api/saved-drafts/${encodeURIComponent(id)}/images`),
      ]);
      const draftData = await draftRes.json().catch(() => ({ ok: false, error: `HTTP ${draftRes.status}` }));
      const imagesData = await imagesRes.json().catch(() => ({ ok: false }));
      if (draftData.ok && draftData.draft) {
        const draft = {
          ...draftData.draft,
          allExtractedImageUrls: imagesData.ok ? (imagesData.images as string[]) : [],
        };
        loadSavedDraft(draft as SavedDraft);
        router.push("/");
      }
    } catch {
      setActionError("Failed to open draft. Please try again.");
    } finally {
      setOpeningId(null);
    }
  }

  async function deleteDraft(id: string) {
    setDeletingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== id));
      } else {
        setActionError("Failed to delete draft. Please try again.");
      }
    } catch {
      setActionError("Failed to delete draft. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-sand-50 py-10 text-center">
        <p className="text-sm text-sand-500">Loading drafts…</p>
        <p className="mt-1 text-xs text-sand-400">Saved drafts will appear here.</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-xl bg-sand-50 py-10 text-center">
        <p className="text-sm text-sand-500">Could not load drafts: {fetchError}</p>
        <p className="mt-1 text-xs text-sand-400">Saved drafts will appear here.</p>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-xl bg-sand-50 py-10 text-center">
        <p className="text-sm text-sand-500">
          No saved drafts for this community yet. Generate an eblast on the Drafter and click "Save draft" to keep it
          here (up to 8 per community).
        </p>
        <p className="mt-1 text-xs text-sand-400">Saved drafts will appear here.</p>
      </div>
    );
  }

  return (
    <>
    {actionError && (
      <p className="text-xs text-red-500 mt-1">{actionError}</p>
    )}
    <ul className="divide-y divide-sand-100 rounded-md border border-sand-200">
      {drafts.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-sand-50/50">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sand-900">{d.subject || "(no subject)"}</p>
            <p className="mt-0.5 text-[11px] text-sand-500">
              {new Date(d.savedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              {d.imageCount > 0 ? ` · ${d.imageCount} image${d.imageCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => openDraft(d.id)}
              disabled={openingId === d.id}
              className="rounded-md border border-sand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sand-700 hover:border-forest-300 hover:bg-forest-50/40 hover:text-forest-700 disabled:opacity-50"
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
    </>
  );
}
