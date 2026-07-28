"use client";

import type { DraftLockReason } from "@/context/DraftContext";

const REASON_LABELS: Record<DraftLockReason, string> = {
  approved: "approved by the sales director",
  pushed: "pushed to HubSpot",
  pending_approval: "sent for approval and is awaiting a decision",
};

function joinReasons(reasons: DraftLockReason[]): string {
  const labels = reasons.map((r) => REASON_LABELS[r]);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

// Shown the moment an edit is attempted on a draft that's already been
// approved, pushed to HubSpot, or sent for approval — those must never be
// silently altered. "Make a Copy" carries the in-progress edit onto a brand
// new, unlocked draft; "Cancel" discards it and reloads the untouched
// original (nothing was ever persisted to it in the meantime).
export function CopyPromptModal({
  reasons,
  isMakingCopy,
  onMakeCopy,
  onCancel,
}: {
  reasons: DraftLockReason[];
  isMakingCopy: boolean;
  onMakeCopy: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-start gap-3 mb-1">
          <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2">
              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#1F4538]">This draft can&rsquo;t be edited directly</h3>
            <p className="mt-1.5 text-sm text-[#5a6b63] leading-relaxed">
              This draft has already been {joinReasons(reasons)}. To keep making changes, continue on a copy — the original stays exactly as it is.
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isMakingCopy}
            className="text-sm text-[#7a8c85] hover:text-[#1F4538] px-4 py-2 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onMakeCopy}
            disabled={isMakingCopy}
            className="text-sm font-semibold bg-[#1F4538] text-white rounded-lg px-4 py-2 hover:bg-[#173829] transition-colors disabled:opacity-60"
          >
            {isMakingCopy ? "Creating copy…" : "Make a Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
