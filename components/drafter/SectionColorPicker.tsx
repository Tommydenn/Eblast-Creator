"use client";

import { useState } from "react";
import { ColorPickerPopover } from "@/components/drafter/ColorPickerPopover";

interface Props {
  label: string;
  hint?: string;
  /** Current effective color — the override if set, otherwise the brand default. */
  value: string;
  isOverridden: boolean;
  brandColors: string[];
  onChange: (hex: string) => void;
  onReset: () => void;
}

export function SectionColorPicker({ label, hint, value, isOverridden, brandColors, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-1.5">{label}</label>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-[#ddd8d0] bg-white px-3 py-2 text-sm text-[#1a1a1a] hover:border-[#1F4538]/40 transition-colors"
        >
          <span className="h-4 w-4 rounded border border-black/10 shrink-0" style={{ backgroundColor: value }} />
          <span className="font-mono text-xs">{value}</span>
        </button>

        {isOverridden && (
          <button type="button" onClick={onReset} className="ml-2 text-xs text-[#9aaba4] hover:text-[#5a6d66] underline">
            Reset to default
          </button>
        )}

        {open && (
          <div className="absolute top-full left-0 z-10 mt-1">
            <ColorPickerPopover
              brandColors={brandColors}
              onPick={onChange}
              onReset={isOverridden ? onReset : undefined}
              onClose={() => setOpen(false)}
            />
          </div>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-[#9aaba4]">{hint}</p>}
    </div>
  );
}
