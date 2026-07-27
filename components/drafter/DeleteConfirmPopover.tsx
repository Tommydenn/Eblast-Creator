"use client";

import type { ReactNode } from "react";

interface Props {
  label: string;
  /** Defaults to `Remove {label} from this eblast?` (the preview hover-delete copy). */
  message?: ReactNode;
  /** Defaults to "You can bring it back anytime from the sidebar." */
  footerNote?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirm/cancel popover shown after clicking a hover-delete button in the
// live preview. Deletion is always non-destructive (a display-only "hidden"
// flag — see ExtractedFlyer's *Hidden/*SectionHidden fields), so this is
// mostly a "make sure you meant to click that" guard, not a data-loss warning.
//
// Also reused by the Saved Drafts list (with a custom message/footerNote) for
// its delete confirmation, since that deletion is a real (if recoverable)
// state change, not just a display toggle.
export function DeleteConfirmPopover({ label, message, footerNote, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div
      className="bg-white rounded-xl border border-[#e8e3dc] shadow-lg p-3 w-56"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="text-xs text-[#3a3a3a] mb-3">
        {message ?? (
          <>Remove <span className="font-semibold">{label}</span> from this eblast?</>
        )}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 text-xs font-medium px-2 py-1.5 rounded-md bg-[#b3312c] text-white hover:bg-[#96271f] transition-colors"
        >
          {confirmLabel ?? "Delete"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-xs font-medium px-2 py-1.5 rounded-md border border-[#ddd8d0] text-[#5a6b63] hover:bg-[#f5f3ef] transition-colors"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 text-[10px] text-[#9aaba4]">{footerNote ?? "You can bring it back anytime from the sidebar."}</p>
    </div>
  );
}
