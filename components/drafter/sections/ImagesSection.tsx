"use client";

import React, { useRef } from "react";
import { useDraft } from "@/context/DraftContext";

function SlotCard({
  label,
  url,
  onAssign,
  onRemove,
  onReposition,
}: {
  label: string;
  url?: string | null;
  onAssign: () => void;
  onRemove?: () => void;
  onReposition?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#e8e3dc] bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-[#f0ede7] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">{label}</span>
        <div className="flex items-center gap-2">
          {url && onReposition && (
            <button
              onClick={onReposition}
              className="text-xs text-[#7a8c85] hover:text-[#1F4538] transition-colors"
            >
              Reposition
            </button>
          )}
          {url && onRemove && (
            <button
              onClick={onRemove}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {url ? (
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

function RepositionModal({
  imageUrl,
  onClose,
  onSave,
}: {
  imageUrl: string;
  onClose: () => void;
  onSave: (x: number, y: number) => void;
}) {
  const [pos, setPos] = React.useState({ x: 50, y: 50 });
  const imgRef = useRef<HTMLImageElement>(null);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setPos({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-[#1F4538] mb-1">Reposition Image</h3>
        <p className="text-xs text-[#7a8c85] mb-4">Click on the image to set the focal point.</p>
        <div
          className="relative rounded-lg overflow-hidden cursor-crosshair"
          onClick={handleClick}
        >
          <img ref={imgRef} src={imageUrl} alt="Reposition" className="w-full" />
          <div
            className="absolute w-5 h-5 rounded-full border-2 border-white bg-[#1F4538] shadow-lg -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />
        </div>
        <div className="flex gap-3 mt-4 justify-end">
          <button onClick={onClose} className="text-sm text-[#7a8c85] hover:text-[#1F4538] px-4 py-2">Cancel</button>
          <button
            onClick={() => { onSave(pos.x, pos.y); onClose(); }}
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
  onPick,
  onClose,
  onUpload,
}: {
  imageBank: string[];
  onPick: (url: string) => void;
  onClose: () => void;
  onUpload: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (url) { onUpload(url); onPick(url); }
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

          {imageBank.length === 0 ? (
            <p className="text-sm text-[#9aaba4] text-center py-8">No images extracted from PDF.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imageBank.map((url, i) => (
                <button
                  key={i}
                  onClick={() => onPick(url)}
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

type ActivePicker = { slot: "hero" | "secondary" | "gallery"; galleryIdx?: number } | null;
type ActiveReposition = { slot: "hero" | "secondary" | "gallery"; galleryIdx?: number; originalUrl: string } | null;

export default function ImagesSection() {
  const { images, imageBank, assignImage, assignGalleryImage, removeImage, repositionImage, addToImageBank } = useDraft();
  const [picker, setPicker] = React.useState<ActivePicker>(null);
  const [reposition, setReposition] = React.useState<ActiveReposition>(null);

  async function handlePick(url: string) {
    if (!picker) return;
    setPicker(null);
    if (picker.slot === "hero" || picker.slot === "secondary") {
      await assignImage(picker.slot, url);
    } else {
      await assignGalleryImage(picker.galleryIdx ?? images.gallery.length, url);
    }
  }

  async function handleReposition(x: number, y: number) {
    if (!reposition) return;
    await repositionImage(reposition.slot, x, y, reposition.galleryIdx);
  }

  return (
    <div className="space-y-4">
      <SlotCard
        label="Hero Image"
        url={images.hero?.url}
        onAssign={() => setPicker({ slot: "hero" })}
        onRemove={images.hero ? () => removeImage("hero") : undefined}
        onReposition={images.hero ? () => setReposition({ slot: "hero", originalUrl: images.hero!.originalUrl }) : undefined}
      />

      <SlotCard
        label="Secondary Image"
        url={images.secondary?.url}
        onAssign={() => setPicker({ slot: "secondary" })}
        onRemove={images.secondary ? () => removeImage("secondary") : undefined}
        onReposition={images.secondary ? () => setReposition({ slot: "secondary", originalUrl: images.secondary!.originalUrl }) : undefined}
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">Gallery ({images.gallery.length}/4)</span>
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
                <img src={img.url} alt={`Gallery ${i + 1}`} className="w-full aspect-video object-cover" />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                  <button
                    onClick={() => setReposition({ slot: "gallery", galleryIdx: i, originalUrl: img.originalUrl })}
                    className="text-white text-xs bg-black/60 rounded px-2 py-1"
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
          onPick={handlePick}
          onClose={() => setPicker(null)}
          onUpload={(url) => addToImageBank(url)}
        />
      )}

      {reposition && (
        <RepositionModal
          imageUrl={reposition.originalUrl}
          onClose={() => setReposition(null)}
          onSave={handleReposition}
        />
      )}
    </div>
  );
}
