"use client";

// Shown at the top of a sidebar tab when that tab's section (or one of its
// buttons) has been hidden via the preview's hover-delete. Once hidden there's
// no hover target left in the preview to bring it back, so this is the only
// way to restore it.
export function HiddenBanner({ label, onRestore }: { label: string; onRestore: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span>{label} is hidden from this eblast.</span>
      <button
        type="button"
        onClick={onRestore}
        className="font-semibold underline shrink-0 hover:text-amber-900"
      >
        Show it
      </button>
    </div>
  );
}
