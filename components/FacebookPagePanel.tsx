"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionLabel } from "@/components/ui/Card";

const INPUT =
  "w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 shadow-sm focus:border-forest-400 focus:ring-2 focus:ring-forest-600/20 focus:outline-none transition-all";

/**
 * This community's Facebook page.
 *
 * Here because the Events page needs somewhere to send you. Facebook has no
 * API that creates an event, so the last step of every one of these is a
 * person on facebook.com — and the one thing the app can do about that is
 * know which page.
 */
export function FacebookPagePanel({ slug, initialUrl }: { slug: string; initialUrl: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
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
        body: JSON.stringify({ facebookUrl: url.trim() || null }),
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
    <div className="mt-5 border-t border-sand-200 pt-5">
      <div className="flex items-center justify-between">
        <SectionLabel>Facebook page</SectionLabel>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-sand-400 transition-colors hover:text-sand-700"
          >
            {initialUrl ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-1.5 space-y-2">
          <input
            className={INPUT}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="facebook.com/YourCommunityPage"
          />
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
                setUrl(initialUrl ?? "");
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
        <p className="mt-0.5 text-sm">
          {initialUrl ? (
            <a
              href={initialUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sand-900 transition-colors hover:text-forest-700"
            >
              {initialUrl.replace(/^https?:\/\//i, "")}
            </a>
          ) : (
            <span className="text-sand-400">not set, so Events cannot link to it</span>
          )}
        </p>
      )}
    </div>
  );
}
