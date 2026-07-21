"use client";

import { useState } from "react";

// Presentational color picker — same swatch-grid + hex-input pattern as the
// FormatToolbar's font-color picker, but fully decoupled from it. Used for
// background-color overrides (sections + buttons), not inline text color, so
// it's a deliberate duplication rather than a shared abstraction: it must
// never risk regressing the toolbar's own (already delicate) text-color code.

const BASIC_COLORS = ["#1a1a1a", "#ffffff", "#c0392b", "#2e86c1", "#27ae60", "#f39c12", "#8e44ad"];

interface Props {
  brandColors: string[];
  /** Shown as a small labeled swatch at the top, when there's no other UI already showing it. */
  currentValue?: string;
  currentLabel?: string;
  onPick: (hex: string) => void;
  onReset?: () => void;
  resetLabel?: string;
  onClose: () => void;
}

export function ColorPickerPopover({ brandColors, currentValue, currentLabel, onPick, onReset, resetLabel = "Reset to default", onClose }: Props) {
  const [hexInput, setHexInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const uniqueColors: string[] = [];
  const seen = new Set<string>();
  for (const c of brandColors) {
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      uniqueColors.push(c);
    }
  }

  function applyHex() {
    let hex = hexInput.trim();
    if (!hex) return;
    if (!hex.startsWith("#")) hex = "#" + hex;
    if (!/^#[0-9A-Fa-f]{3}$/.test(hex) && !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setError("Enter a valid hex color, e.g. #1A2B3C");
      return;
    }
    onPick(hex);
    onClose();
  }

  return (
    <div
      className="bg-white rounded-xl border border-[#e8e3dc] shadow-lg p-2.5 w-52"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {currentValue && (
        <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-[#f0ede7]">
          <span className="h-4 w-4 rounded border border-black/10 shrink-0" style={{ backgroundColor: currentValue }} />
          <span className="text-[10px] text-[#5a6b63] truncate">{currentLabel ?? "Current"}</span>
        </div>
      )}

      {uniqueColors.length > 0 && (
        <>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9aaba4] mb-1.5">Brand colors</p>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {uniqueColors.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => { onPick(hex); onClose(); }}
                className="w-6 h-6 rounded-full ring-1 ring-black/10 hover:scale-125 transition-transform"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
        </>
      )}

      <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9aaba4] mb-1.5">Standard</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {BASIC_COLORS.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => { onPick(hex); onClose(); }}
            className={`w-6 h-6 rounded-full hover:scale-125 transition-transform ${
              hex === "#ffffff" ? "ring-1 ring-[#ddd8d0]" : "ring-1 ring-black/10"
            }`}
            style={{ backgroundColor: hex }}
            title={hex}
          />
        ))}
      </div>

      <div className="flex items-center gap-1 mt-2 border-t border-[#f0ede7] pt-2">
        <input
          type="text"
          placeholder="#hex"
          value={hexInput}
          onChange={(e) => { setHexInput(e.target.value); setError(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); applyHex(); }
            if (e.key === "Escape") onClose();
          }}
          autoFocus
          className="flex-1 text-[10px] border border-[#ddd8d0] rounded px-1.5 py-1 outline-none focus:border-[#1F4538] text-[#1a1a1a]"
          style={{ minWidth: 0 }}
        />
        <button
          type="button"
          onClick={applyHex}
          className="text-[10px] px-1.5 py-1 rounded bg-[#f0f5f2] text-[#1F4538] font-medium hover:bg-[#ddeee6] transition-colors shrink-0"
        >
          Apply
        </button>
      </div>
      {error && <p className="mt-1 text-[9px] text-red-600">{error}</p>}

      {onReset && (
        <button
          type="button"
          onClick={() => { onReset(); onClose(); }}
          className="w-full flex items-center gap-1.5 text-[10px] text-[#9aaba4] hover:text-[#5a6b63] px-1 py-1 rounded hover:bg-[#f5f3ef] transition-colors mt-1.5"
        >
          <svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
          </svg>
          {resetLabel}
        </button>
      )}
    </div>
  );
}
