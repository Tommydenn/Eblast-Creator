"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunityBrand } from "@/lib/db/schema";

interface Props {
  slug: string;
  brand: CommunityBrand;
}

// Fonts already in use across community brand palettes, plus a curated set of
// popular Google Fonts. Rendered purely as CSS font-family strings (no <link>
// loading — see lib/render-email.ts, which intentionally has none).
const FONT_OPTIONS = [
  "Georgia, 'Times New Roman', serif",
  "'Helvetica Neue', Arial, sans-serif",
  "Bookman Old Style",
  "Josefin Sans",
  "Nexa",
  "Garamond BE",
  "BigCity Grotesque Pro",
  "Minion",
  "P22 Mackinac",
  "F37 Moon",
  "Bebas Neue",
  "Neutra Text",
  "Adobe Caslon Pro",
  "Montserrat",
  "Playfair Display",
  "Merriweather",
  "Lora",
  "Poppins",
  "Raleway",
  "Nunito",
  "Open Sans",
  "Roboto",
  "Roboto Slab",
  "Source Sans Pro",
  "Cormorant Garamond",
  "Libre Baskerville",
  "PT Serif",
  "Crimson Text",
  "Work Sans",
  "Inter",
  "Oswald",
  "Quicksand",
  "Karla",
  "EB Garamond",
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface Swatch {
  key: "primary" | "accent" | "background" | "secondary" | `supporting-${number}`;
  label: string;
  color: string;
}

function buildSwatches(brand: CommunityBrand): Swatch[] {
  const swatches: Swatch[] = [
    { key: "primary", label: "Primary", color: brand.primary },
    { key: "accent", label: "Accent", color: brand.accent },
    { key: "background", label: "Surface", color: brand.background },
  ];
  if (brand.secondary) swatches.push({ key: "secondary", label: "Secondary", color: brand.secondary });
  (brand.supporting ?? []).forEach((hex, i) => {
    swatches.push({ key: `supporting-${i}`, label: `Support ${i + 1}`, color: hex });
  });
  return swatches;
}

export function BrandPanel({ slug, brand }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [swatches, setSwatches] = useState<Swatch[]>(() => buildSwatches(brand));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [hexDraft, setHexDraft] = useState("");

  const [fontHeadline, setFontHeadline] = useState(brand.fontHeadline);
  const [fontBody, setFontBody] = useState(brand.fontBody);
  const [customHeadline, setCustomHeadline] = useState(!FONT_OPTIONS.includes(brand.fontHeadline));
  const [customBody, setCustomBody] = useState(!FONT_OPTIONS.includes(brand.fontBody));

  function handleCancel() {
    setSwatches(buildSwatches(brand));
    setFontHeadline(brand.fontHeadline);
    setFontBody(brand.fontBody);
    setCustomHeadline(!FONT_OPTIONS.includes(brand.fontHeadline));
    setCustomBody(!FONT_OPTIONS.includes(brand.fontBody));
    setOpenKey(null);
    setError(null);
    setEditing(false);
  }

  function applyHex(key: string) {
    if (!HEX_RE.test(hexDraft.trim())) {
      setError("Enter a valid hex color, e.g. #1A2B3C");
      return;
    }
    setSwatches((prev) => prev.map((s) => (s.key === key ? { ...s, color: hexDraft.trim() } : s)));
    setOpenKey(null);
    setHexDraft("");
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const primary = swatches.find((s) => s.key === "primary")?.color ?? brand.primary;
      const accent = swatches.find((s) => s.key === "accent")?.color ?? brand.accent;
      const background = swatches.find((s) => s.key === "background")?.color ?? brand.background;
      const secondary = swatches.find((s) => s.key === "secondary")?.color;
      const supporting = swatches
        .filter((s) => s.key.toString().startsWith("supporting-"))
        .map((s) => s.color);

      const res = await fetch(`/api/communities/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: {
            primary,
            accent,
            background,
            ...(secondary ? { secondary } : {}),
            ...(supporting.length > 0 ? { supporting } : {}),
            fontHeadline: fontHeadline.trim() || brand.fontHeadline,
            fontBody: fontBody.trim() || brand.fontBody,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Save failed");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">Color palette</p>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] text-sand-400 hover:text-sand-700 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {swatches.map((s) => (
            <div key={s.key} className="relative flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={!editing}
                onClick={() => {
                  if (!editing) return;
                  setHexDraft(s.color);
                  setOpenKey(openKey === s.key ? null : s.key);
                }}
                className={`h-10 w-10 rounded-lg border border-black/8 shadow-sm ${editing ? "cursor-pointer ring-offset-2 hover:ring-2 hover:ring-forest-400" : ""}`}
                style={{ backgroundColor: s.color }}
                title={s.color}
              />
              <p className="text-[9px] font-medium uppercase tracking-wider text-sand-500 text-center">{s.label}</p>
              <p className="font-mono text-[8.5px] text-sand-400">{s.color}</p>

              {editing && openKey === s.key && (
                <div className="absolute top-full z-10 mt-1 w-40 rounded-lg border border-sand-200 bg-white p-2 shadow-lg">
                  <input
                    autoFocus
                    value={hexDraft}
                    onChange={(e) => setHexDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyHex(s.key);
                      if (e.key === "Escape") setOpenKey(null);
                    }}
                    placeholder="#1A2B3C"
                    className="w-full rounded-md border border-sand-200 px-2 py-1 text-xs font-mono focus:border-forest-400 focus:outline-none"
                  />
                  <button
                    onClick={() => applyHex(s.key)}
                    className="mt-1.5 w-full rounded-md bg-forest-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-forest-700"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500">Typography</p>
        <div className="mt-2 rounded-xl border border-sand-200/60 bg-sand-50/50 px-4 py-3.5 space-y-3">
          <div>
            <p className="text-2xl text-sand-900 leading-snug" style={{ fontFamily: fontHeadline }}>
              The quick brown fox
            </p>
            {editing ? (
              <div className="mt-1.5 space-y-1.5">
                <select
                  value={customHeadline ? "__custom__" : fontHeadline}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setCustomHeadline(true);
                    } else {
                      setCustomHeadline(false);
                      setFontHeadline(e.target.value);
                    }
                  }}
                  className="w-full rounded-md border border-sand-200 px-2 py-1 text-xs focus:border-forest-400 focus:outline-none"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
                {customHeadline && (
                  <input
                    value={fontHeadline}
                    onChange={(e) => setFontHeadline(e.target.value)}
                    placeholder="Custom font-family"
                    className="w-full rounded-md border border-sand-200 px-2 py-1 text-xs font-mono focus:border-forest-400 focus:outline-none"
                  />
                )}
              </div>
            ) : (
              <p className="mt-0.5 font-mono text-[10px] text-sand-500">Display · {fontHeadline}</p>
            )}
          </div>
          <div className="border-t border-sand-200/60 pt-3">
            <p className="text-base text-sand-800 leading-relaxed" style={{ fontFamily: fontBody }}>
              Warm, hospitality-forward copy goes here.
            </p>
            {editing ? (
              <div className="mt-1.5 space-y-1.5">
                <select
                  value={customBody ? "__custom__" : fontBody}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setCustomBody(true);
                    } else {
                      setCustomBody(false);
                      setFontBody(e.target.value);
                    }
                  }}
                  className="w-full rounded-md border border-sand-200 px-2 py-1 text-xs focus:border-forest-400 focus:outline-none"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
                {customBody && (
                  <input
                    value={fontBody}
                    onChange={(e) => setFontBody(e.target.value)}
                    placeholder="Custom font-family"
                    className="w-full rounded-md border border-sand-200 px-2 py-1 text-xs font-mono focus:border-forest-400 focus:outline-none"
                  />
                )}
              </div>
            ) : (
              <p className="mt-0.5 font-mono text-[10px] text-sand-500">Body · {fontBody}</p>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {editing && (
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-forest-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs font-medium text-sand-700 hover:bg-sand-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
