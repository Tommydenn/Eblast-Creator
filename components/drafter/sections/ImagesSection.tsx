"use client";

import React, { useRef } from "react";
import { downscaleInBrowser } from "@/lib/crop-image-client";
import { useDraft } from "@/context/DraftContext";
import { HideToggle } from "@/components/drafter/HideToggle";

function SlotCard({
  label,
  url,
  loading,
  repositionState,
  hideFlag,
  onAssign,
  onRemove,
  onReposition,
}: {
  label: string;
  url?: string | null;
  /**
   * The section this slot is the whole of, when it is one.
   *
   * The secondary image is a section of the email in its own right. Its
   * hide control belongs next to the photo rather than on another tab.
   */
  hideFlag?: string;
  /** This slot holds a photo that is still downloading. */
  loading?: boolean;
  /** Whether the full-size original this would re-crop from is available. */
  repositionState?: RepositionState;
  onAssign: () => void;
  onRemove?: () => void;
  onReposition?: () => void;
}) {
  return (
    <div className="group/hideable rounded-xl border border-[#e8e3dc] bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-[#f0ede7] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">{label}</span>
        <div className="flex items-center gap-2">
          {url && onReposition && (
            <button
              onClick={repositionState === "ready" ? onReposition : undefined}
              disabled={repositionState !== "ready"}
              title={repositionExplanation(repositionState)}
              className="text-xs text-[#7a8c85] hover:text-[#1F4538] transition-colors disabled:text-[#c9c0b8] disabled:cursor-default disabled:hover:text-[#c9c0b8]"
            >
              Reposition
            </button>
          )}
          {url && onRemove && (
            <button
              onClick={onRemove}
              className="text-xs text-[#9aaba4] hover:text-[#a4552f] transition-colors"
            >
              Remove
            </button>
          )}
          {hideFlag && <HideToggle flag={hideFlag} what={`the ${label.toLowerCase()}`} />}
        </div>
      </div>
      {loading ? (
        <div className="h-[112px] bg-[#f0ede7] animate-pulse" aria-label={`${label} loading`} />
      ) : url ? (
        <div className="relative">
          <img
            src={url}
            alt={label}
            className="w-full object-cover"
            style={{ maxHeight: 160 }}
          />
          <button
            onClick={onAssign}
            className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100"
          >
            <span className="text-white text-xs font-semibold bg-black/60 rounded px-2 py-1">Change</span>
          </button>
        </div>
      ) : (
        <button
          onClick={onAssign}
          className="w-full flex flex-col items-center justify-center gap-2 py-8 text-sm text-[#9aaba4] hover:text-[#1F4538] hover:bg-[#f5f3ef] transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21,15 16,10 5,21"/>
          </svg>
          Assign image
        </button>
      )}
    </div>
  );
}

/** The shapes the email draws these into, so the box shown is the real one. */
const SLOT_RATIO = { hero: 600 / 340, secondary: 528 / 300, gallery: 4 / 3 } as const;

function RepositionModal({
  imageUrl,
  ratio,
  onClose,
  onSave,
}: {
  imageUrl: string;
  ratio: number;
  onClose: () => void;
  onSave: (x: number, y: number, zoom: number) => void;
}) {
  const [pos, setPos] = React.useState({ x: 50, y: 50 });
  const [zoom, setZoom] = React.useState(1);
  const [natural, setNatural] = React.useState<{ w: number; h: number } | null>(null);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setPos({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }

  // The part of the photo that will be kept, as a share of the whole, worked
  // out the same way the crop itself is: the largest box of the slot's shape
  // that fits, divided by the zoom. Drawn rather than described, because a
  // focal point on its own never said how much of the photo was being lost.
  const box = (() => {
    if (!natural) return null;
    const srcRatio = natural.w / natural.h;
    let w: number;
    let h: number;
    if (srcRatio > ratio) { h = natural.h; w = h * ratio; }
    else { w = natural.w; h = w / ratio; }
    w = Math.min(w / zoom, natural.w);
    h = Math.min(h / zoom, natural.h);
    const wPct = (w / natural.w) * 100;
    const hPct = (h / natural.h) * 100;
    return {
      width: wPct,
      height: hPct,
      left: (100 - wPct) * (pos.x / 100),
      top: (100 - hPct) * (pos.y / 100),
    };
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-[#1F4538] mb-1">Reposition Image</h3>
        <p className="text-xs text-[#7a8c85] mb-4">Click to set the focal point. The bright area is what the email shows.</p>
        <div className="relative rounded-lg overflow-hidden cursor-crosshair" onClick={handleClick}>
          <img
            src={imageUrl}
            alt="Reposition"
            className="w-full block"
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
          />
          {box && (
            <>
              {/* The photo dimmed, with the kept area cut back out of it at
                  full strength, so the box reads as a window onto the photo
                  rather than a rectangle drawn over it. */}
              <div className="absolute inset-0 bg-black/50 pointer-events-none" />
              <div
                className="absolute overflow-hidden ring-2 ring-white pointer-events-none"
                style={{
                  left: `${box.left}%`,
                  top: `${box.top}%`,
                  width: `${box.width}%`,
                  height: `${box.height}%`,
                }}
              >
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
            className="absolute w-5 h-5 rounded-full border-2 border-white bg-[#1F4538] shadow-lg -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <label htmlFor="reposition-zoom" className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">
            Zoom
          </label>
          <input
            id="reposition-zoom"
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#1F4538]"
          />
          <span className="text-xs tabular-nums text-[#9aaba4] w-10 text-right">{zoom.toFixed(1)}x</span>
        </div>
        <div className="flex gap-3 mt-4 justify-end">
          <button
            onClick={() => { setPos({ x: 50, y: 50 }); setZoom(1); }}
            className="text-sm text-[#7a8c85] hover:text-[#1F4538] px-4 py-2 mr-auto"
          >
            Reset
          </button>
          <button onClick={onClose} className="text-sm text-[#7a8c85] hover:text-[#1F4538] px-4 py-2">
            Cancel
          </button>
          <button
            onClick={() => { onSave(pos.x, pos.y, zoom); onClose(); }}
            className="text-sm font-semibold bg-[#1F4538] text-white rounded-lg px-4 py-2 hover:bg-[#173829] transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function BankPicker({
  imageBank,
  bankIdx,
  bankLoading,
  onPick,
  onClose,
  onUpload,
}: {
  imageBank: string[];
  /** Stored row index for each entry, so a crop can name the photo. */
  bankIdx?: number[];
  /** The unplaced flyer photos are still arriving. */
  bankLoading?: boolean;
  onPick: (url: string, bankIdx?: number) => void;
  onClose: () => void;
  onUpload: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target?.result as string;
      if (!url) return;
      // Shrink before it goes in, or a full-size camera photo is too big to
      // save and would disappear again on the next reload.
      const sized = await downscaleInBrowser(url).catch(() => url);
      onUpload(sized);
      onPick(sized);
    };
    reader.readAsDataURL(f);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#f0ede7] flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#1F4538]">Select Image</h3>
          <button onClick={onClose} className="text-[#9aaba4] hover:text-[#1F4538]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full mb-4 rounded-xl border-2 border-dashed border-[#ddd8d0] py-4 text-sm text-[#9aaba4] hover:border-[#1F4538]/40 hover:text-[#1F4538] transition-colors flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload from device
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

          {bankLoading && imageBank.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-video rounded-lg bg-[#f0ede7] animate-pulse" />
              ))}
            </div>
          ) : imageBank.length === 0 ? (
            <p className="text-sm text-[#9aaba4] text-center py-8">No images extracted from PDF.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imageBank.map((url, i) => (
                <button
                  key={i}
                  onClick={() => onPick(url, bankIdx?.[i])}
                  className="aspect-video rounded-lg overflow-hidden border-2 border-transparent hover:border-[#1F4538] transition-colors"
                >
                  <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Whether a photo can be repositioned, and if not, why.
 *
 * "waiting" is temporary: the full-size originals are the largest files and
 * arrive after the photos you can see, so for a few seconds after opening a
 * draft there is nothing to re-crop from. "missing" is permanent — the original
 * was never stored, which is true of some older drafts.
 */
type RepositionState = "ready" | "waiting" | "missing";

function repositionState(
  img: { url: string; originalUrl: string } | null | undefined,
  stillLoading: boolean,
): RepositionState {
  if (img?.originalUrl) return "ready";
  return stillLoading ? "waiting" : "missing";
}

function repositionExplanation(state?: RepositionState): string {
  if (state === "waiting") return "Waiting for the full-size photo to finish loading";
  if (state === "missing") return "The full-size photo wasn't saved with this draft, so it can't be re-cropped";
  return "Choose which part of the photo to show";
}

type ActivePicker = { slot: "hero" | "secondary" | "gallery"; galleryIdx?: number } | null;
type ActiveReposition = { slot: "hero" | "secondary" | "gallery"; galleryIdx?: number; originalUrl: string } | null;

export default function ImagesSection() {
  const { images, imageBank, imageBankIdx, imagesLoading, imageBankLoading, originalsLoading, imagesError, assignImage, assignGalleryImage, removeImage, repositionImage, addToImageBank, fields, setField } = useDraft();
  const [picker, setPicker] = React.useState<ActivePicker>(null);
  const [reposition, setReposition] = React.useState<ActiveReposition>(null);

  async function handlePick(url: string, bankIdx?: number) {
    if (!picker) return;
    setPicker(null);
    if (picker.slot === "hero" || picker.slot === "secondary") {
      await assignImage(picker.slot, url, bankIdx);
    } else {
      await assignGalleryImage(picker.galleryIdx ?? images.gallery.length, url, bankIdx);
    }
  }

  async function handleReposition(x: number, y: number, zoom: number) {
    if (!reposition) return;
    await repositionImage(reposition.slot, x, y, zoom, reposition.galleryIdx);
  }

  return (
    <div className="space-y-4">

      {imagesError && (
        <p className="rounded-lg bg-[#fdf2f2] border border-[#f0d5d5] px-3 py-2 text-xs text-[#9a3a34]">
          {imagesError}
        </p>
      )}

      <SlotCard
        label="Hero Image"
        url={images.hero?.url}
        loading={imagesLoading && !!images.hero && !images.hero.url}
        repositionState={repositionState(images.hero, originalsLoading)}
        onAssign={() => setPicker({ slot: "hero" })}
        onRemove={images.hero ? () => removeImage("hero") : undefined}
        onReposition={images.hero ? () => setReposition({ slot: "hero", originalUrl: images.hero!.originalUrl }) : undefined}
      />

      <SlotCard
        label="Secondary Image"
        hideFlag="secondaryImageSectionHidden"
        url={images.secondary?.url}
        loading={imagesLoading && !!images.secondary && !images.secondary.url}
        repositionState={repositionState(images.secondary, originalsLoading)}
        onAssign={() => setPicker({ slot: "secondary" })}
        onRemove={images.secondary ? () => removeImage("secondary") : undefined}
        onReposition={images.secondary ? () => setReposition({ slot: "secondary", originalUrl: images.secondary!.originalUrl }) : undefined}
      />

      <div className="group/hideable">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">Gallery ({images.gallery.length}/4)</span>
          <HideToggle flag="gallerySectionHidden" what="the photo gallery" />
          <span className="flex-1" aria-hidden />
          {images.gallery.length < 4 && (
            <button
              onClick={() => setPicker({ slot: "gallery", galleryIdx: images.gallery.length })}
              className="text-xs text-[#1F4538] hover:underline font-medium"
            >
              + Add image
            </button>
          )}
        </div>
        {images.gallery.length === 0 ? (
          <button
            onClick={() => setPicker({ slot: "gallery", galleryIdx: 0 })}
            className="w-full rounded-xl border-2 border-dashed border-[#ddd8d0] py-6 text-sm text-[#9aaba4] hover:border-[#1F4538]/40 hover:text-[#1F4538] transition-colors"
          >
            Add gallery images
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {images.gallery.map((img, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden border border-[#e8e3dc]">
                {img.url ? (
                  <img src={img.url} alt={`Gallery ${i + 1}`} className="w-full aspect-video object-cover" />
                ) : (
                  <div className="w-full aspect-video bg-[#f0ede7] animate-pulse" aria-label={`Gallery ${i + 1} loading`} />
                )}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                  <button
                    onClick={
                      repositionState(img, originalsLoading) === "ready"
                        ? () => setReposition({ slot: "gallery", galleryIdx: i, originalUrl: img.originalUrl })
                        : undefined
                    }
                    disabled={repositionState(img, originalsLoading) !== "ready"}
                    title={repositionExplanation(repositionState(img, originalsLoading))}
                    className="text-white text-xs bg-black/60 rounded px-2 py-1 disabled:opacity-40 disabled:cursor-default"
                  >
                    Reposition
                  </button>
                  <button
                    onClick={() => removeImage("gallery", i)}
                    className="text-white text-xs bg-red-600/80 rounded px-2 py-1"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {picker && (
        <BankPicker
          imageBank={imageBank}
          bankIdx={imageBankIdx}
          bankLoading={imageBankLoading}
          onPick={handlePick}
          onClose={() => setPicker(null)}
          onUpload={(url) => addToImageBank(url)}
        />
      )}

      {reposition && (
        <RepositionModal
          imageUrl={reposition.originalUrl}
          ratio={SLOT_RATIO[reposition.slot]}
          onClose={() => setReposition(null)}
          onSave={handleReposition}
        />
      )}
    </div>
  );
}
