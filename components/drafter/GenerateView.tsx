"use client";

import React, { useRef, useState } from "react";
import { useDraft } from "@/context/DraftContext";
import { CommunityIntelligence } from "@/components/CommunityIntelligence";
import { Header } from "@/components/Header";

export default function GenerateView() {
  const {
    communities,
    selectedCommunitySlug,
    selectCommunity,
    generate,
    cancelGenerate,
    isGenerating,
    generateError,
  } = useDraft();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const selectedCommunity = communities.find((c) => c.slug === selectedCommunitySlug) ?? null;

  function handleFile(f: File | null) {
    if (f?.type === "application/pdf") setFile(f);
  }

  async function handleGenerate() {
    if (!file || !selectedCommunitySlug) return;
    await generate(file);
  }

  return (
    <div className="min-h-screen bg-[#f9f7f3] flex flex-col">
      <Header active="drafter" />
    <div className="flex-1 flex flex-col items-center justify-start pt-12 pb-16 px-4">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-[#1F4538] tracking-tight">Create an Eblast</h1>
          <p className="mt-2 text-[#5a6b63] text-base">Upload a flyer PDF and select a community to generate a branded email draft.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          {/* Left: Generate card */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#e8e3dc] p-7">
            {/* Community selector */}
            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-2">Community</label>
              <select
                value={selectedCommunitySlug}
                onChange={(e) => selectCommunity(e.target.value)}
                className="w-full rounded-lg border border-[#ddd8d0] bg-white px-3.5 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538]"
                disabled={isGenerating}
              >
                <option value="">Select a community…</option>
                {communities.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.displayName}</option>
                ))}
              </select>
            </div>

            {/* PDF drop zone */}
            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-2">Flyer PDF</label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files[0] ?? null);
                }}
                disabled={isGenerating}
                className={[
                  "w-full rounded-xl border-2 border-dashed transition-colors py-10 flex flex-col items-center gap-2 text-sm",
                  dragOver
                    ? "border-[#1F4538] bg-[#1F4538]/5"
                    : file
                    ? "border-[#1F4538]/40 bg-[#f0f5f2]"
                    : "border-[#ddd8d0] bg-[#faf9f6] hover:border-[#1F4538]/40 hover:bg-[#f5f3ef]",
                ].join(" ")}
              >
                {file ? (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1F4538" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                    <span className="font-medium text-[#1F4538]">{file.name}</span>
                    <span className="text-[#7a8c85] text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</span>
                  </>
                ) : (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9aaba4" strokeWidth="1.8"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                    <span className="font-medium text-[#5a6b63]">Drop PDF here or click to browse</span>
                    <span className="text-[#9aaba4] text-xs">PDF files only</span>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!file || !selectedCommunitySlug || isGenerating}
              className="w-full rounded-lg bg-[#1F4538] text-white font-semibold py-3 px-6 text-sm tracking-wide hover:bg-[#173829] active:bg-[#112d21] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isGenerating ? "Generating…" : "Generate Eblast"}
            </button>

            {isGenerating && (
              <div className="mt-4 flex items-center justify-between text-sm text-[#5a6b63]">
                <span>This takes 30–90 seconds. The AI is reading the flyer and crafting your email.</span>
                <button
                  onClick={cancelGenerate}
                  className="text-xs text-[#9aaba4] hover:text-[#1F4538] underline underline-offset-2 ml-4 shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}

            {isGenerating && (
              <div className="mt-4 rounded-lg bg-[#f0f5f2] p-3 flex items-center gap-3">
                <div className="w-5 h-5 shrink-0">
                  <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="#1F4538" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#1F4538"/>
                  </svg>
                </div>
                <div className="text-xs text-[#3d5249] leading-relaxed">
                  Extracting images · Reading copy · Drafting subject · Building email · Running review
                </div>
              </div>
            )}

            {generateError && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {generateError}
              </div>
            )}
          </div>

          {/* Right: Intelligence panel */}
          {selectedCommunity && (
            <div className="bg-white rounded-2xl shadow-sm border border-[#e8e3dc] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f0ede7]">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">Community Intelligence</p>
                <p className="text-base font-semibold text-[#1F4538] mt-0.5">{selectedCommunity.displayName}</p>
              </div>
              <CommunityIntelligence communitySlug={selectedCommunity.slug} />
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
