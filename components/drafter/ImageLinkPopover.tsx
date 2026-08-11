"use client";

import { useState } from "react";
import { normalizePhotoLink } from "@/lib/render-email";

// Photo click-through link editor. Opens from clicking a photo in the live
// preview, anchored under it — same interaction as ColorPickerPopover for
// section colors. Clicking a photo in the preview never follows the link;
// this popover's "Open" button is the only way to visit it from the editor.

interface Props {
  /** Human label for the photo being edited, e.g. "Hero image". */
  label: string;
  currentValue: string;
  onSave: (url: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export function ImageLinkPopover({ label, currentValue, onSave, onRemove, onClose }: Props) {
  const [value, setValue] = useState(currentValue);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizePhotoLink(value);

  function save() {
    const raw = value.trim();
    if (!raw) {
      // Empty means "no link" — same outcome as Remove.
      onRemove?.();
      onClose();
      return;
    }
    if (!normalized) {
      setError("Enter a web address, e.g. example.com/tour");
      return;
    }
    onSave(normalized);
    onClose();
  }

  return (
    <div
      className="bg-white rounded-xl border border-[#e8e3dc] shadow-lg p-2.5 w-64"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-[#f0ede7]">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5a6b63" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span className="text-[10px] text-[#5a6b63] truncate">{label} link</span>
      </div>

      <input
        type="text"
        placeholder="example.com/tour"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") onClose();
        }}
        autoFocus
        className="w-full text-[11px] border border-[#ddd8d0] rounded px-1.5 py-1.5 outline-none focus:border-[#1F4538] text-[#1a1a1a]"
      />
      {error && <p className="mt-1 text-[9px] text-red-600">{error}</p>}
      <p className="mt-1 text-[9px] text-[#9aaba4]">
        Recipients who click this photo will open the link.
      </p>

      <div className="flex items-center gap-1 mt-2">
        <button
          type="button"
          onClick={save}
          className="flex-1 text-[10px] px-1.5 py-1.5 rounded bg-[#1F4538] text-white font-medium hover:bg-[#173829] transition-colors"
        >
          Save link
        </button>
        <button
          type="button"
          disabled={!normalized}
          onClick={() => { if (normalized) window.open(normalized, "_blank", "noopener,noreferrer"); }}
          title={normalized ? `Open ${normalized}` : "Enter a valid link first"}
          className="text-[10px] px-2 py-1.5 rounded bg-[#f0f5f2] text-[#1F4538] font-medium hover:bg-[#ddeee6] transition-colors disabled:opacity-40 disabled:hover:bg-[#f0f5f2] shrink-0"
        >
          Open ↗
        </button>
      </div>

      {onRemove && currentValue && (
        <button
          type="button"
          onClick={() => { onRemove(); onClose(); }}
          className="w-full flex items-center gap-1.5 text-[10px] text-[#9aaba4] hover:text-[#5a6b63] px-1 py-1 rounded hover:bg-[#f5f3ef] transition-colors mt-1.5"
        >
          <svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
          </svg>
          Remove link from this photo
        </button>
      )}
    </div>
  );
}
