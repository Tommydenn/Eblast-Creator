"use client";

// Shown at the top of a sidebar tab when a whole section of that tab is
// hidden. Once hidden there is no hover target left in the preview to bring
// it back, and a section has no box of its own in the sidebar either, so this
// is the only way to restore it.
//
// Only whole sections. Everything with a box — the buttons included — carries
// its own control on the box, and a banner for those said the same thing twice.
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
