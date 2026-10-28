"use client";

import React, { useRef, useState } from "react";
import { downscaleInBrowser } from "@/lib/crop-image-client";
import { useDraft } from "@/context/DraftContext";
import type { ExtractedFlyer } from "@/lib/extracted-flyer";
import { ImageLinkPopover } from "@/components/drafter/ImageLinkPopover";
import { Button, Pill, Row, type MenuItem } from "@/components/drafter/ui";

/**
 * A photo, edited where the email draws it.
 *
 * Photos used to have a tab to themselves, which meant the hero's photo was
 * edited two tabs away from the hero's headline while sitting inside the same
 * band of the email. They are fields now, in the section that draws them —
 * including the hero's, which the template puts in the same table row as the
 * headline and so cannot be moved anywhere else without changing what lands
 * in an inbox.
 */

/** The shapes the email draws these into, so the box shown is the real one. */
const SLOT_RATIO = { hero: 600 / 340, secondary: 528 / 300, gallery: 4 / 3 } as const;

type Slot = "hero" | "secondary" | "gallery";

/**
 * Whether a photo can be repositioned, and if not, why.
 *
 * "waiting" is temporary: the full-size originals are the largest files and
 * arrive after the photos you can see. "missing" is permanent — the original
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

function repositionExplanation(state: RepositionState): string {
  if (state === "waiting") return "Waiting for the full-size photo to finish loading";
  if (state === "missing") return "The full-size photo wasn't saved with this draft, so it can't be re-cropped";
  return "Choose which part of the photo to show";
}

function Thumb({ url, loading, alt, tall }: { url?: string | null; loading?: boolean; alt: string; tall?: boolean }) {
  if (loading) {
    return <div className={`w-full ${tall ? "h-24" : "h-20"} animate-pulse rounded-md bg-[#F0EDE7]`} aria-label={`${alt} loading`} />;
  }
  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt}
      className="w-full rounded-md border border-[#E4E0D9] object-cover"
      style={{ maxHeight: tall ? 140 : 112 }}
    />
  );
}

function Empty({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-[#DCD7CE] py-5 text-[12px] text-[#6A736F] transition-colors hover:border-[#1F4538] hover:text-[#1F4538]"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </svg>
      {label}
    </button>
  );
}

/** A row of quiet verbs under a photo. Visible, not hidden behind a hover. */
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-1.5 flex flex-wrap items-center gap-1">{children}</div>;
}

function Verb({
  onClick,
  disabled,
  title,
  danger,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "rounded px-1.5 py-0.5 text-[11.5px] font-medium transition-colors disabled:opacity-35 disabled:cursor-default",
        danger ? "text-[#A3302B] hover:bg-[#FBF2F1]" : "text-[#495250] hover:bg-[#F0EDE7] hover:text-[#1B1D1C]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ── The two modals, unchanged in behaviour ──────────────────────────────────

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
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setPos({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }

  // The part of the photo that will be kept, as a share of the whole, worked
  // out the same way the crop itself is: the largest box of the slot's shape
  // that fits, divided by the zoom.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[14px] bg-white p-6 shadow-[0_24px_64px_rgba(27,29,28,0.28)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-semibold text-[#1B1D1C]">Reposition photo</h3>
        <p className="mb-4 mt-1 text-[12px] text-[#495250]">Click to set the focal point. The bright area is what the email shows.</p>
        <div className="relative cursor-crosshair overflow-hidden rounded-md" onClick={handleClick}>
          <img
            src={imageUrl}
            alt="Reposition"
            className="block w-full"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {box && (
            <>
              {/* The photo dimmed, with the kept area cut back out of it at full
                  strength, so the box reads as a window onto the photo. */}
              <div className="pointer-events-none absolute inset-0 bg-black/50" />
              <div
                className="pointer-events-none absolute overflow-hidden ring-2 ring-white"
                style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
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
          <label htmlFor="reposition-zoom" className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#6A736F]">
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
          <span className="w-10 text-right text-[12px] tabular-nums text-[#6A736F]">{zoom.toFixed(1)}x</span>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <Button tone="quiet" onClick={() => { setPos({ x: 50, y: 50 }); setZoom(1); }}>Reset</Button>
          <span className="flex-1" />
          <Button tone="quiet" onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={() => { onSave(pos.x, pos.y, zoom); onClose(); }}>Apply</Button>
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
  bankIdx?: number[];
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[14px] bg-white shadow-[0_24px_64px_rgba(27,29,28,0.28)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#EFEBE4] px-5 py-4">
          <h3 className="text-[16px] font-semibold text-[#1B1D1C]">Choose a photo</h3>
          <button onClick={onClose} className="text-[#6A736F] transition-colors hover:text-[#1B1D1C]" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-[#DCD7CE] py-4 text-[12px] text-[#6A736F] transition-colors hover:border-[#1F4538] hover:text-[#1F4538]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Upload from this device
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

          {bankLoading && imageBank.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="aspect-video animate-pulse rounded-md bg-[#F0EDE7]" />)}
            </div>
          ) : imageBank.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#6A736F]">No photos were found in the flyer.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {imageBank.map((url, i) => (
                <button
                  key={i}
                  onClick={() => onPick(url, bankIdx?.[i])}
                  className="aspect-video overflow-hidden rounded-md border-2 border-transparent transition-colors hover:border-[#1F4538]"
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

// ── The field itself ────────────────────────────────────────────────────────

type Picking = { slot: Slot; galleryIdx?: number } | null;
type Repositioning = { slot: Slot; galleryIdx?: number; originalUrl: string } | null;
type Linking = { field: "heroImageLink" | "secondaryImageLink" | "galleryImageLinks"; index: number | null; label: string } | null;

export function PhotoField({ slot, menu }: { slot: Slot; menu?: MenuItem[] }) {
  const {
    images, imageBank, imageBankIdx, imagesLoading, imageBankLoading, originalsLoading, imagesError,
    assignImage, assignGalleryImage, removeImage, repositionImage, addToImageBank, fields, setField,
  } = useDraft();

  const [picking, setPicking] = useState<Picking>(null);
  const [repositioning, setRepositioning] = useState<Repositioning>(null);
  const [linking, setLinking] = useState<Linking>(null);

  async function handlePick(url: string, bankIdx?: number) {
    if (!picking) return;
    setPicking(null);
    if (picking.slot === "hero" || picking.slot === "secondary") {
      await assignImage(picking.slot, url, bankIdx);
    } else {
      await assignGalleryImage(picking.galleryIdx ?? images.gallery.length, url, bankIdx);
    }
  }

  async function handleReposition(x: number, y: number, zoom: number) {
    if (!repositioning) return;
    await repositionImage(repositioning.slot, x, y, zoom, repositioning.galleryIdx);
  }

  function currentLink(): string {
    if (!linking || !fields) return "";
    if (linking.field === "galleryImageLinks") return (fields.galleryImageLinks ?? [])[linking.index ?? 0] ?? "";
    return (fields[linking.field] as string | undefined) ?? "";
  }

  // Gallery links are positional, so the array is padded rather than compacted
  // — removing photo 1's link must not shift photo 2's onto photo 1.
  function writeLink(url: string | undefined) {
    if (!linking) return;
    if (linking.field !== "galleryImageLinks") {
      setField(linking.field as keyof ExtractedFlyer, url as never);
      return;
    }
    const next = [...(fields?.galleryImageLinks ?? [])];
    const i = linking.index ?? 0;
    while (next.length <= i) next.push("");
    next[i] = url ?? "";
    setField("galleryImageLinks", next.some((v) => v) ? next : undefined);
  }

  const modals = (
    <>
      {picking && (
        <BankPicker
          imageBank={imageBank}
          bankIdx={imageBankIdx}
          bankLoading={imageBankLoading}
          onPick={handlePick}
          onClose={() => setPicking(null)}
          onUpload={(url) => addToImageBank(url)}
        />
      )}
      {repositioning && (
        <RepositionModal
          imageUrl={repositioning.originalUrl}
          ratio={SLOT_RATIO[repositioning.slot]}
          onClose={() => setRepositioning(null)}
          onSave={handleReposition}
        />
      )}
    </>
  );

  const linkPanel = linking && (
    <div className="mt-2">
      <ImageLinkPopover
        label={linking.label}
        currentValue={currentLink()}
        onSave={(url) => writeLink(url)}
        onRemove={() => writeLink(undefined)}
        onClose={() => setLinking(null)}
      />
    </div>
  );

  const error = imagesError && (
    <p className="mb-3 rounded-md border border-[#EFD9D7] bg-[#FBF2F1] px-2.5 py-2 text-[11.5px] text-[#A3302B]">{imagesError}</p>
  );

  // ── Gallery: up to four photos, as one field ──────────────────────────────
  if (slot === "gallery") {
    const full = images.gallery.length >= 4;
    return (
      <>
        {error}
        <Row
          label={`Photos (${images.gallery.length}/4)`}
          menu={menu}
          note="Up to four, shown as a grid. Click one to replace or reposition it."
        >
          {images.gallery.length === 0 ? (
            <Empty label="Add photos" onClick={() => setPicking({ slot: "gallery", galleryIdx: 0 })} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {images.gallery.map((img, i) => {
                const state = repositionState(img, originalsLoading);
                return (
                  <div key={i} className="rounded-md border border-[#E4E0D9] p-1.5">
                    {img.url ? (
                      <img src={img.url} alt={`Photo ${i + 1}`} className="aspect-video w-full rounded-[4px] object-cover" />
                    ) : (
                      <div className="aspect-video w-full animate-pulse rounded-[4px] bg-[#F0EDE7]" aria-label={`Photo ${i + 1} loading`} />
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-0.5">
                      <Verb onClick={() => setPicking({ slot: "gallery", galleryIdx: i })}>Replace</Verb>
                      <Verb
                        onClick={state === "ready" ? () => setRepositioning({ slot: "gallery", galleryIdx: i, originalUrl: img.originalUrl }) : undefined}
                        disabled={state !== "ready"}
                        title={repositionExplanation(state)}
                      >
                        Crop
                      </Verb>
                      <Verb onClick={() => setLinking({ field: "galleryImageLinks", index: i, label: `Photo ${i + 1}` })}>Link</Verb>
                      <Verb onClick={() => removeImage("gallery", i)} danger>Remove</Verb>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!full && images.gallery.length > 0 && (
            <Actions>
              <Verb onClick={() => setPicking({ slot: "gallery", galleryIdx: images.gallery.length })}>Add another photo</Verb>
            </Actions>
          )}
          {linkPanel}
        </Row>
        {modals}
      </>
    );
  }

  // ── Hero and the second photo: one slot each ──────────────────────────────
  const img = slot === "hero" ? images.hero : images.secondary;
  const state = repositionState(img, originalsLoading);
  const label = slot === "hero" ? "Photo" : "Photo";
  const linkField = slot === "hero" ? "heroImageLink" : "secondaryImageLink";

  return (
    <>
      {error}
      <Row label={label} menu={menu}>
        {img?.url || (imagesLoading && img) ? (
          <>
            <Thumb url={img?.url} loading={imagesLoading && !img?.url} alt={label} tall={slot === "hero"} />
            <Actions>
              <Verb onClick={() => setPicking({ slot })}>Replace</Verb>
              <Verb
                onClick={state === "ready" ? () => setRepositioning({ slot, originalUrl: img!.originalUrl }) : undefined}
                disabled={state !== "ready"}
                title={repositionExplanation(state)}
              >
                Reposition
              </Verb>
              <Verb onClick={() => setLinking({ field: linkField, index: null, label })}>Link</Verb>
              <Verb onClick={() => removeImage(slot)} danger>Remove</Verb>
            </Actions>
            {(fields?.[linkField] as string | undefined) && !linking && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#6A736F]">
                <Pill tone="accent">Linked</Pill>
                <span className="truncate">{fields?.[linkField] as string}</span>
              </p>
            )}
          </>
        ) : (
          <Empty label="Add a photo" onClick={() => setPicking({ slot })} />
        )}
        {linkPanel}
      </Row>
      {modals}
    </>
  );
}
