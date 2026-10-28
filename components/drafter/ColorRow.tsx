"use client";

import React, { useEffect, useRef, useState } from "react";
import { useDraft } from "@/context/DraftContext";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import type { SectionColorField } from "@/lib/eblast-defaults";
import { defaultColor } from "@/lib/eblast-inspector";
import { Pill } from "@/components/drafter/ui";

/**
 * A colour, where the thing it colours is.
 *
 * Background colour had no control at all before. It was a hover-and-click on
 * the email, competing with three other things a click could mean there, and
 * nothing anywhere said it was possible — so for practical purposes the
 * largest visual choice in the eblast was unreachable. A colour is a property
 * of a section, so it sits in that section's panel, named, with the value
 * shown as a swatch you can read without clicking anything.
 */

const NEUTRALS = ["#FFFFFF", "#F4F1EC", "#1B1D1C", "#5B625F"];

export function ColorRow({ field, label }: { field: SectionColorField; label: string }) {
  const { fields, setField, community } = useDraft();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const chosen = (fields as Record<string, unknown> | null)?.[field] as string | undefined;
  const fallback = defaultColor(field, community);
  const value = chosen ?? fallback;

  const pick = (hex: string) => {
    setField(field as keyof ExtractedFlyer, hex as never);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 -mx-1.5 text-left transition-colors hover:bg-[#F7F6F3]"
      >
        <span
          className="h-5 w-5 shrink-0 rounded-[5px] ring-1 ring-black/10"
          style={{ backgroundColor: value }}
          aria-hidden
        />
        <span className="text-[12px] font-medium text-[#495250]">{label}</span>
        <span className="flex-1" aria-hidden />
        {chosen && <Pill>Changed</Pill>}
        <span className="text-[11px] uppercase tabular-nums text-[#6A736F]">{value}</span>
      </button>

      {open && (
        <Picker
          communityName={community?.displayName}
          brandColors={brandPalette(community)}
          value={value}
          fallback={fallback}
          onPick={pick}
          onReset={chosen ? () => { setField(field as keyof ExtractedFlyer, undefined as never); setOpen(false); } : undefined}
        />
      )}
    </div>
  );
}

function brandPalette(community: unknown): string[] {
  const brand = ((community as { brand?: unknown } | null)?.brand ?? {}) as Record<string, unknown>;
  const raw = [brand.primary, brand.accent, brand.background, brand.secondary, ...((brand.supporting as string[]) ?? [])];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    if (typeof c === "string" && c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      out.push(c);
    }
  }
  return out;
}

function Picker({
  communityName,
  brandColors,
  value,
  fallback,
  onPick,
  onReset,
}: {
  communityName?: string;
  brandColors: string[];
  value: string;
  fallback: string;
  onPick: (hex: string) => void;
  onReset?: () => void;
}) {
  const [hex, setHex] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply() {
    let next = hex.trim();
    if (!next) return;
    if (!next.startsWith("#")) next = "#" + next;
    if (!/^#[0-9A-Fa-f]{3}$/.test(next) && !/^#[0-9A-Fa-f]{6}$/.test(next)) {
      setError("Six characters, like #1A2B3C");
      return;
    }
    onPick(next);
  }

  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  return (
    <div className="absolute left-0 top-full z-40 mt-1 w-[272px] rounded-[9px] border border-[#E4E0D9] bg-white p-3 shadow-[0_12px_32px_rgba(27,29,28,0.14)]">
      {brandColors.length > 0 && (
        <>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#6A736F]">
            {communityName ? `${communityName}'s colours` : "Brand colours"}
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {brandColors.map((c) => (
              <Swatch key={c} hex={c} current={same(c, value)} isDefault={same(c, fallback)} onPick={onPick} />
            ))}
          </div>
        </>
      )}

      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#6A736F]">Neutrals</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {NEUTRALS.map((c) => (
          <Swatch key={c} hex={c} current={same(c, value)} isDefault={same(c, fallback)} onPick={onPick} />
        ))}
      </div>

      <div className="flex items-center gap-1.5 border-t border-[#EFEBE4] pt-3">
        <input
          type="text"
          value={hex}
          placeholder="#hex"
          autoFocus
          onChange={(e) => { setHex(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
          className="min-w-0 flex-1 rounded-md border border-[#DCD7CE] px-2 py-1 text-[12px] text-[#1B1D1C] outline-none focus:border-[#1F4538]"
        />
        <button
          type="button"
          onClick={apply}
          className="shrink-0 rounded-md bg-[#F0EDE7] px-2.5 py-1 text-[12px] font-medium text-[#1B1D1C] transition-colors hover:bg-[#E4E0D9]"
        >
          Set
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-[#A3302B]">{error}</p>}

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 w-full rounded-md px-2 py-1 text-left text-[11.5px] text-[#495250] transition-colors hover:bg-[#F7F6F3] hover:text-[#1B1D1C]"
        >
          Back to the community&rsquo;s colour
        </button>
      )}
    </div>
  );
}

function Swatch({
  hex,
  current,
  isDefault,
  onPick,
}: {
  hex: string;
  current: boolean;
  isDefault: boolean;
  onPick: (hex: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(hex)}
      title={isDefault ? `${hex} — the default` : hex}
      className={[
        "h-6 w-6 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110",
        current ? "outline outline-2 outline-offset-2 outline-[#1F4538]" : "",
      ].join(" ")}
      style={{ backgroundColor: hex }}
    />
  );
}
