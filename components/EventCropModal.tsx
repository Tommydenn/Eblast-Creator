"use client";

import { useState } from "react";
import { cropInBrowser } from "@/lib/crop-image-client";

/**
 * Setting the crop yourself, when the automatic one guessed wrong.
 *
 * The website takes a 1000×667 photo and has no cropping tool of its own, so
 * the app crops for it. The attention crop is only a guess at where the
 * subject is, and on a busy flyer it guesses wrong — so this lets you say
 * where to take the photo from and how tight, then hands back exactly the
 * 1000×667 you set. The geometry is the editor's own (cropInBrowser), so a
 * crop here frames the same way the eblast's photos do.
 */
export function EventCropModal({
  imageUrl,
  width,
  height,
  onClose,
  onApply,
}: {
  /** The whole, uncropped photo at full resolution. */
  imageUrl: string;
  width: number;
  height: number;
  onClose: () => void;
  onApply: (dataUri: string) => void;
}) {
  const ratio = width / height;
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setFocal(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setPos({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }

  // The kept window, as a share of the whole photo — the same arithmetic the
  // crop itself uses, so what is outlined here is what comes out.
  const box = (() => {
    if (!natural) return null;
    const srcRatio = natural.w / natural.h;
    let w: number;
    let h: number;
    if (srcRatio > ratio) {
      h = natural.h;
      w = h * ratio;
    } else {
      w = natural.w;
      h = w / ratio;
    }
    w = Math.min(w / zoom, natural.w);
    h = Math.min(h / zoom, natural.h);
    const wPct = (w / natural.w) * 100;
    const hPct = (h / natural.h) * 100;
    return { width: wPct, height: hPct, left: (100 - wPct) * (pos.x / 100), top: (100 - hPct) * (pos.y / 100) };
  })();

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const uri = await cropInBrowser(imageUrl, ratio, pos.x, pos.y, zoom, width, height);
      onApply(uri);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not crop the photo");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(27,29,28,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-[20px] text-sand-900">Adjust the crop</h3>
        <p className="mb-4 mt-1 text-[12px] text-sand-500">
          Click where the subject is. The bright area is the {width}×{height} the website gets.
        </p>

        <div className="relative cursor-crosshair overflow-hidden rounded-lg" onClick={setFocal}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="block w-full"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {box && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-black/50" />
              <div
                className="pointer-events-none absolute overflow-hidden ring-2 ring-white"
                style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute max-w-none"
                  style={{
                    width: `${(100 / box.width) * 100}%`,
                    height: `${(100 / box.height) * 100}%`,
                    left: `${(-box.left / box.width) * 100}%`,
                    top: `${(-box.top / box.height) * 100}%`,
                  }}
                />
              </div>
            </>
          )}
          <div
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest-700 shadow-lg"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="event-crop-zoom" className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sand-400">
            Zoom
          </label>
          <input
            id="event-crop-zoom"
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-forest-700"
          />
          <span className="w-10 text-right text-[12px] tabular-nums text-sand-500">{zoom.toFixed(1)}×</span>
        </div>

        {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-sand-200 px-4 py-2 text-[13px] text-sand-600 transition-colors hover:text-sand-900"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={busy}
            className="rounded-xl bg-forest-700 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-forest-800 disabled:opacity-40"
          >
            {busy ? "Cropping…" : "Use this crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
