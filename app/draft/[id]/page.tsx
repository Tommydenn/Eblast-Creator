"use client";

/**
 * A draft at its own address, so the browser's back button works.
 *
 * Opening a draft used to swap what the single page rendered, which left the
 * URL unchanged — there was nothing to go back to. It is a real route now, so
 * back returns to the list, forward returns to the draft, and a draft can be
 * linked to or reloaded directly.
 *
 * The provider lives in the root layout, so moving between here and the list
 * keeps everything in memory: no reload, no refetch, no lost edits. Only a
 * direct visit (a fresh tab, a reload, a bookmark) has to load the draft.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDraft } from "@/context/DraftContext";
import EditorLayout from "@/components/drafter/EditorLayout";

export default function DraftPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { stage, draftId, loadSavedDraft } = useDraft();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    // Already open — arrived by clicking Open, or came back with the forward
    // button. Nothing to fetch.
    if (draftId === id && stage === "editing") return;

    // Deliberately no "already requested this id" guard. React runs effects
    // twice in development, and such a guard makes the second run bail while
    // the first run's result has already been discarded by its own cleanup —
    // which left a direct visit stuck on "Opening the draft…" forever. A
    // duplicate fetch is cheap; a page that never loads is not.
    let cancelled = false;
    fetch(`/api/saved-drafts/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok || !data.draft) {
          setError("That draft could not be found.");
          return;
        }
        loadSavedDraft({
          ...data.draft,
          approvedAt: data.approvedAt,
          pushedAt: data.pushedAt,
          pendingApproval: data.pendingApproval,
        });
      })
      .catch(() => { if (!cancelled) setError("That draft could not be loaded."); });

    return () => { cancelled = true; };
  }, [id, draftId, stage, loadSavedDraft]);

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-[#f5f3ef]">
        <p className="text-sm text-[#5a6b63]">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="text-xs font-semibold text-[#1F4538] border border-[#1F4538]/30 hover:bg-[#1F4538] hover:text-white rounded-lg px-3 py-1.5 transition-all"
        >
          Back to drafts
        </button>
      </div>
    );
  }

  if (stage !== "editing") {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f5f3ef]">
        <p className="text-sm text-[#9aaba4]">Opening the draft…</p>
      </div>
    );
  }

  return <EditorLayout />;
}
