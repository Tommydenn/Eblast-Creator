"use client";

import React, { createContext, useContext, useRef, useState } from "react";
import { downscaleInBrowser } from "@/lib/crop-image-client";
import { useDraft } from "@/context/DraftContext";
import { RichInput } from "@/components/drafter/RichEditor";
import { Field } from "@/components/drafter/Field";
import { BlockGap } from "@/components/drafter/BlockGap";
import { defaultGalleryLabel } from "@/lib/eblast-defaults";
import { input, label as labelCls } from "@/components/drafter/ui";

/**
 * The photos, each one in the section of the email it belongs to.
 *
 * They used to be gathered on a tab called Images — all three slots together,
 * away from everything they sit between, so the hero photo was edited two tabs
 * from the headline printed over it and the gallery photos were nowhere near
 * the label that introduces them. Grouping them by "these are all pictures"
 * grouped them by the one thing that was already obvious from looking at them.
 *
 * The picker and the repositioning window are mounted once around the whole
 * sidebar, which is what lets the slots be in three different places: they are
 * full-screen, so it does not matter which section opened one.
 */

type Slot = "hero" | "secondary" | "gallery";
type ActivePicker = { slot: Slot; galleryIdx?: number } | null;
type ActiveReposition = { slot: Slot; galleryIdx?: number; originalUrl: string } | null;

interface PickerApi {
  openPicker: (p: NonNullable<ActivePicker>) => void;
  openReposition: (r: NonNullable<ActiveReposition>) => void;
}

const PickerContext = createContext<PickerApi | null>(null);

function usePicker(): PickerApi {
  const api = useContext(PickerContext);
  if (!api) throw new Error("A photo slot was rendered outside ImagePickerHost");
  return api;
}

export function ImagePickerHost({ children }: { children: React.ReactNode }) {
  const { imageBank, imageBankIdx, imageBankLoading, assignImage, assignGalleryImage, repositionImage, addToImageBank, images } = useDraft();
  const [picker, setPicker] = useState<ActivePicker>(null);
  const [reposition, setReposition] = useState<ActiveReposition>(null);

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
    <PickerContext.Provider value={{ openPicker: setPicker, openReposition: setReposition }}>
      {children}

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
    </PickerContext.Provider>
  );
}

// ── One photo ───────────────────────────────────────────────────────────────

/**
 * A photo slot, with what can be done to it over the photo itself.
 *
 * Replace, reposition and remove used to be a row of small text links above
 * the hero and secondary photos, and hover chips over the gallery ones — two
 * patterns for the same three actions, one of them in red. The chips won:
 * they sit on the thing they act on, they cost no height, and they read the
 * same whichever photo you are over.
 *
 * Nothing here is red. An eye hides, an x deletes and asks first; a photo
 * being swapped for another is neither, so it is not dressed as a warning.
 */
function PhotoSlot({
  name,
  slot,
  galleryIdx,
  aspect,
}: {
  /** Named only where the section holds more than this photo. */
  name?: string;
  slot: Slot;
  galleryIdx?: number;
  aspect: string;
}) {
  const { images, imagesLoading, originalsLoading, removeImage } = useDraft();
  const { openPicker, openReposition } = usePicker();

  const img =
    slot === "gallery" ? images.gallery[galleryIdx ?? 0] : slot === "hero" ? images.hero : images.secondary;
  const url = img?.url;
  const loading = imagesLoading && !!img && !url;
  const state = repositionState(img, originalsLoading);

  return (
    <div>
      {name && <span className={labelCls + " mb-1.5"}>{name}</span>}
      <div className={`group/photo relative overflow-hidden rounded-xl border border-[#e8e3dc] bg-white ${aspect}`}>
        {loading ? (
          <div className="h-full w-full animate-pulse bg-[#f0ede7]" aria-label={`${name ?? "Photo"} loading`} />
        ) : url ? (
          <>
            <img src={url} alt={name ?? "Photo"} className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/0 opacity-0 transition-all group-hover/photo:bg-black/40 group-hover/photo:opacity-100">
              <Chip onClick={() => openPicker({ slot, galleryIdx })}>Replace</Chip>
              <Chip
                onClick={state === "ready" ? () => openReposition({ slot, galleryIdx, originalUrl: img!.originalUrl }) : undefined}
                title={repositionExplanation(state)}
              >
                Reposition
              </Chip>
              <Chip onClick={() => removeImage(slot, galleryIdx)}>Remove</Chip>
            </div>
          </>
        ) : (
          <button
            onClick={() => openPicker({ slot, galleryIdx })}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-[#9aaba4] transition-colors hover:bg-[#f5f3ef] hover:text-[#1F4538]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
            Add a photo
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({ onClick, title, children }: { onClick?: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={title}
      className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-[#1F4538] shadow-sm transition-colors hover:bg-white disabled:bg-white/50 disabled:text-[#9aaba4]"
    >
      {children}
    </button>
  );
}

// ── The three places a photo appears ────────────────────────────────────────

/** The photo behind the hero's headline, edited beside it. */
export function HeroImageSection() {
  return <PhotoSlot name="Hero photo" slot="hero" aspect="aspect-[600/340]" />;
}

/** A section of the email that is nothing but one photo, so it needs no name. */
export function SecondaryImageSection() {
  return <PhotoSlot slot="secondary" aspect="aspect-[528/300]" />;
}

/** The label above the photo grid, and the grid. */
export function GallerySection() {
  const { fields, images, community, activeEditorRef, activeEditorCallback, activeFieldNameRef, setField } = useDraft();
  const { openPicker } = usePicker();
  if (!fields) return null;

  const count = images.gallery.length;

  return (
    <>
      <Field label="Label" block="galleryLabel">
        <RichInput
          value={fields.galleryLabel ?? defaultGalleryLabel(community)}
          onValueChange={(html) => setField("galleryLabel", html)}
          placeholder="e.g. A Look Around Our Community"
          className={input}
          activeEditorRef={activeEditorRef}
          activeEditorCallback={activeEditorCallback}
          activeFieldNameRef={activeFieldNameRef}
          fieldName="galleryLabel"
        />
      </Field>

      <BlockGap slot="galleryLabel" />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className={labelCls}>Photos</span>
          <span className="text-[11px] text-[#9aaba4]">{count} of 4</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {images.gallery.map((_, i) => (
            <PhotoSlot key={i} slot="gallery" galleryIdx={i} aspect="aspect-[4/3]" />
          ))}
          {count < 4 && (
            <button
              onClick={() => openPicker({ slot: "gallery", galleryIdx: count })}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#ddd8d0] text-[11px] text-[#9aaba4] transition-colors hover:border-[#1F4538]/40 hover:text-[#1F4538]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Picking, cropping, and the state behind both ────────────────────────────

/** The shapes the email draws these into, so the box shown is the real one. */
const SLOT_RATIO = { hero: 600 / 340, secondary: 528 / 300, gallery: 4 / 3 } as const;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="eb-appear w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-base font-semibold text-[#1F4538]">Reposition</h3>
        <p className="mb-4 text-xs text-[#7a8c85]">Click to set the focal point. The bright area is what the email shows.</p>
        <div className="relative cursor-crosshair overflow-hidden rounded-lg" onClick={handleClick}>
          <img
            src={imageUrl}
            alt="Reposition"
            className="block w-full"
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
          />
          {box && (
            <>
              {/* The photo dimmed, with the kept area cut back out of it at
                  full strength, so the box reads as a window onto the photo
                  rather than a rectangle drawn over it. */}
              <div className="pointer-events-none absolute inset-0 bg-black/50" />
              <div
                className="pointer-events-none absolute overflow-hidden ring-2 ring-white"
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
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1F4538] shadow-lg"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="reposition-zoom" className={labelCls}>Zoom</label>
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
          <span className="w-10 text-right text-xs tabular-nums text-[#9aaba4]">{zoom.toFixed(1)}x</span>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => { setPos({ x: 50, y: 50 }); setZoom(1); }}
            className="mr-auto px-4 py-2 text-sm text-[#7a8c85] hover:text-[#1F4538]"
          >
            Reset
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#7a8c85] hover:text-[#1F4538]">
            Cancel
          </button>
          <button
            onClick={() => { onSave(pos.x, pos.y, zoom); onClose(); }}
            className="rounded-lg bg-[#1F4538] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#173829]"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="eb-appear flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#f0ede7] px-5 py-4">
          <h3 className="text-base font-semibold text-[#1F4538]">Choose a photo</h3>
          <button onClick={onClose} className="text-[#9aaba4] hover:text-[#1F4538]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#ddd8d0] py-4 text-sm text-[#9aaba4] transition-colors hover:border-[#1F4538]/40 hover:text-[#1F4538]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Upload from device
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

          {bankLoading && imageBank.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-video animate-pulse rounded-lg bg-[#f0ede7]" />
              ))}
            </div>
          ) : imageBank.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#9aaba4]">No photos came with this flyer. Upload one above.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {imageBank.map((url, i) => (
                <button
                  key={i}
                  onClick={() => onPick(url, bankIdx?.[i])}
                  className="aspect-video overflow-hidden rounded-lg border-2 border-transparent transition-colors hover:border-[#1F4538]"
                >
                  <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
