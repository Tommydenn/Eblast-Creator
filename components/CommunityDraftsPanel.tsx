"use client";

import { useRouter } from "next/navigation";
import { useDraft } from "@/context/DraftContext";

// Shows the saved drafts for one community (read from the same localStorage-backed
// draft store the Drafter uses). Lives on the community detail page so each
// community's drafts are findable in the Communities tab. Capped at 8 per
// community by the save logic in DraftContext.
export function CommunityDraftsPanel({ communitySlug }: { communitySlug: string }) {
  const router = useRouter();
  const { communityDrafts, loadSavedDraft, deleteCommunityDraft } = useDraft();
  const drafts = communityDrafts.filter((d) => d.communitySlug === communitySlug);

  if (drafts.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-sand-300 bg-sand-50/40 px-4 py-6 text-center text-sm text-sand-500">
        No saved drafts for this community yet. Generate an eblast on the Drafter and click “Save draft” to keep it
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
              onClick={() => {
                loadSavedDraft(d);
                router.push("/");
              }}
              className="rounded-md border border-sand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sand-700 hover:border-clay-300 hover:bg-clay-50/40"
            >
              Open in Drafter
            </button>
            <button
              onClick={() => deleteCommunityDraft(d.id)}
              title="Delete draft"
              aria-label="Delete draft"
              className="rounded p-1 text-sand-400 hover:bg-sand-100 hover:text-clay-600"
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
