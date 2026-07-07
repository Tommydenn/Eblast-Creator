"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useDraft, type SavedDraft } from "@/context/DraftContext";
import { CommunityIntelligence } from "@/components/CommunityIntelligence";
import { Header } from "@/components/Header";

// ─── Saved Drafts ─────────────────────────────────────────────────────────────

interface DraftMeta {
  id: string;
  communitySlug: string;
  communityName: string;
  savedAt: string;
  subject: string;
  imageCount: number;
  isNewFormat: boolean;
}

function DraftCard({
  draft,
  isOpening,
  isDeleting,
  onOpen,
  onDelete,
}: {
  draft: DraftMeta;
  isOpening: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const date = new Date(draft.savedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const isLegacy = !draft.isNewFormat;

  return (
    <div className={[
      "group relative bg-white rounded-xl border p-4 flex flex-col gap-2.5 transition-all duration-150",
      isLegacy
        ? "border-[#e8e3dc] opacity-60"
        : "border-[#e8e3dc] hover:border-[#1F4538]/30 hover:shadow-md",
    ].join(" ")}>
      <button
        onClick={onDelete}
        disabled={isDeleting || isOpening}
        title="Delete draft"
        className="absolute top-3 right-3 p-1 rounded text-[#c9c0b8] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5l.5-9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <p className="text-sm font-medium text-[#1a1a1a] leading-snug pr-6 line-clamp-2">
        {draft.subject || "(no subject)"}
      </p>

      <div className="flex items-center gap-1.5 mt-auto">
        <span className="text-[11px] text-[#9aaba4]">{date}</span>
        {draft.imageCount > 0 && (
          <>
            <span className="text-[#ddd8d0]">·</span>
            <span className="text-[11px] text-[#9aaba4]">
              {draft.imageCount} {draft.imageCount === 1 ? "image" : "images"}
            </span>
          </>
        )}
        {isLegacy && (
          <>
            <span className="text-[#ddd8d0]">·</span>
            <span className="text-[10px] font-medium text-[#b0a89f] uppercase tracking-wide">Outdated</span>
          </>
        )}
      </div>

      {isLegacy ? (
        <div className="w-full rounded-lg border border-dashed border-[#e0dbd3] text-[#b0a89f] text-[11px] text-center py-2">
          Regenerate to edit
        </div>
      ) : (
        <button
          onClick={onOpen}
          disabled={isOpening || isDeleting}
          className="w-full rounded-lg border border-[#e0dbd3] bg-[#f9f7f3] hover:bg-[#1F4538] hover:border-[#1F4538] hover:text-white text-[#5a6b63] text-[11px] font-semibold py-2 transition-all duration-150 disabled:opacity-40"
        >
          {isOpening ? "Opening…" : "Open draft"}
        </button>
      )}
    </div>
  );
}

function SavedDraftsView() {
  const { loadSavedDraft } = useDraft();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/saved-drafts")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          if (d.ok) setDrafts(d.drafts);
          else setFetchError(d.error ?? "Failed to load");
        }
      })
      .catch((e) => { if (!cancelled) setFetchError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const openDraft = useCallback(async (id: string) => {
    setOpeningId(id);
    try {
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.ok && data.draft) {
        loadSavedDraft(data.draft as SavedDraft);
      }
    } finally {
      setOpeningId(null);
    }
  }, [loadSavedDraft]);

  const deleteDraft = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-[#f0ede7] animate-pulse" />
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 px-6 py-10 text-center">
        <p className="text-sm text-red-600">Could not load drafts</p>
        <p className="mt-1 text-xs text-red-400">{fetchError}</p>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#ddd8d0] px-8 py-20 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f0ede7] mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aaba4" strokeWidth="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[#5a6b63]">No saved drafts yet</p>
        <p className="mt-1.5 text-xs text-[#9aaba4]">Generate an eblast and click "Save draft" to find it here.</p>
      </div>
    );
  }

  // Group by community — drafts are already sorted by savedAt desc, so first occurrence
  // of each community slug is the most recently active community.
  const communityOrder: string[] = [];
  const bySlug = new Map<string, { name: string; drafts: DraftMeta[] }>();
  for (const d of drafts) {
    if (!bySlug.has(d.communitySlug)) {
      communityOrder.push(d.communitySlug);
      bySlug.set(d.communitySlug, { name: d.communityName, drafts: [] });
    }
    bySlug.get(d.communitySlug)!.drafts.push(d);
  }

  return (
    <div className="space-y-10">
      {communityOrder.map((slug) => {
        const group = bySlug.get(slug)!;
        return (
          <section key={slug}>
            <div className="flex items-center gap-3 mb-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#7a8c85] shrink-0">
                {group.name}
              </p>
              <div className="flex-1 h-px bg-[#e8e3dc]" />
              <p className="text-[10px] text-[#b0a89f] shrink-0">
                {group.drafts.length} {group.drafts.length === 1 ? "draft" : "drafts"}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.drafts.map((d) => (
                <DraftCard
                  key={d.id}
                  draft={d}
                  isOpening={openingId === d.id}
                  isDeleting={deletingId === d.id}
                  onOpen={() => openDraft(d.id)}
                  onDelete={() => deleteDraft(d.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

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
  const [tab, setTab] = useState<"new" | "drafts">("new");

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

      <div className="flex-1 flex flex-col items-center justify-start pt-10 pb-16 px-4">
        <div className="w-full max-w-5xl">

          {/* Page title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-[#1F4538] tracking-tight">Eblast Drafter</h1>
            <p className="mt-2 text-[#5a6b63] text-sm">
              Create a new draft from a flyer PDF, or continue editing a saved one.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-[#f0ede7] rounded-xl p-1 mb-8 w-fit mx-auto">
            <button
              onClick={() => setTab("new")}
              className={[
                "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                tab === "new"
                  ? "bg-white text-[#1F4538] shadow-sm"
                  : "text-[#7a8c85] hover:text-[#3d5249]",
              ].join(" ")}
            >
              New Draft
            </button>
            <button
              onClick={() => setTab("drafts")}
              className={[
                "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                tab === "drafts"
                  ? "bg-white text-[#1F4538] shadow-sm"
                  : "text-[#7a8c85] hover:text-[#3d5249]",
              ].join(" ")}
            >
              Saved Drafts
            </button>
          </div>

          {/* Tab content */}
          {tab === "new" ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
              {/* Generate card */}
              <div className="bg-white rounded-2xl shadow-sm border border-[#e8e3dc] p-7">
                <div className="mb-6">
                  <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-2">
                    Community
                  </label>
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

                <div className="mb-6">
                  <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-2">
                    Flyer PDF
                  </label>
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
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1F4538" strokeWidth="1.8">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14,2 14,8 20,8" />
                        </svg>
                        <span className="font-medium text-[#1F4538]">{file.name}</span>
                        <span className="text-[#7a8c85] text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</span>
                      </>
                    ) : (
                      <>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9aaba4" strokeWidth="1.8">
                          <polyline points="16,16 12,12 8,16" />
                          <line x1="12" y1="12" x2="12" y2="21" />
                          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                        </svg>
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

                <button
                  onClick={handleGenerate}
                  disabled={!file || !selectedCommunitySlug || isGenerating}
                  className="w-full rounded-lg bg-[#1F4538] text-white font-semibold py-3 px-6 text-sm tracking-wide hover:bg-[#173829] active:bg-[#112d21] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGenerating ? "Generating…" : "Generate Eblast"}
                </button>

                {isGenerating && (
                  <div className="mt-4 flex items-center justify-between text-sm text-[#5a6b63]">
                    <span>This takes 30–90 seconds.</span>
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
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#1F4538" />
                      </svg>
                    </div>
                    <p className="text-xs text-[#3d5249] leading-relaxed">
                      Extracting images · Reading copy · Drafting subject · Building email · Running review
                    </p>
                  </div>
                )}

                {generateError && (
                  <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {generateError}
                  </div>
                )}
              </div>

              {/* Community Intelligence sidebar */}
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
          ) : (
            <SavedDraftsView />
          )}
        </div>
      </div>
    </div>
  );
}
