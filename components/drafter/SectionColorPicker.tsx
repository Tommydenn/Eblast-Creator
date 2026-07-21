"use client";

import { useState } from "react";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface Props {
  label: string;
  hint?: string;
  /** Current effective color — the override if set, otherwise the brand default. */
  value: string;
  isOverridden: boolean;
  onChange: (hex: string) => void;
  onReset: () => void;
}

export function SectionColorPicker({ label, hint, value, isOverridden, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  function apply() {
    const trimmed = draft.trim();
    if (!HEX_RE.test(trimmed)) {
      setError("Enter a valid hex color, e.g. #1A2B3C");
      return;
    }
    onChange(trimmed);
    setOpen(false);
    setError(null);
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-1.5">{label}</label>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setError(null);
            setOpen((o) => !o);
          }}
          className="flex items-center gap-2 rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] hover:border-[#1F4538]/40 transition-colors"
        >
          <span className="h-4 w-4 rounded border border-black/10 shrink-0" style={{ backgroundColor: value }} />
          <span className="font-mono text-xs">{value}</span>
        </button>

        {isOverridden && (
          <button
            type="button"
            onClick={() => {
              onReset();
              setOpen(false);
              setError(null);
            }}
            className="ml-2 text-xs text-[#9aaba4] hover:text-[#5a6d66] underline"
          >
            Reset to default
          </button>
        )}

        {open && (
          <div className="absolute top-full left-0 z-10 mt-1 w-44 rounded-lg border border-[#ddd8d0] bg-white p-2 shadow-lg">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="#1A2B3C"
              className="w-full rounded-md border border-[#ddd8d0] px-2 py-1 text-xs font-mono focus:border-[#1F4538] focus:outline-none"
            />
            {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
            <button
              type="button"
              onClick={apply}
              className="mt-1.5 w-full rounded-md bg-[#1F4538] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#173328] transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-[#9aaba4]">{hint}</p>}
    </div>
  );
}
