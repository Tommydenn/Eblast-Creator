"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useDraft, type SavedDraft } from "@/context/DraftContext";
import { CommunityIntelligence } from "@/components/CommunityIntelligence";
import { Header } from "@/components/Header";
import { DeleteConfirmPopover } from "@/components/drafter/DeleteConfirmPopover";

// ─── Saved Drafts ─────────────────────────────────────────────────────────────

interface DraftMeta {
  id: string;
  communitySlug: string;
  communityName: string;
  savedAt: string;
  subject: string;
  imageCount: number;
  approvedAt: string | null;
  pushedAt: string | null;
  pendingApproval: boolean;
  isNewFormat: boolean;
  /** True when the daily Planner pass created this draft rather than a person. */
  fromPlanner?: boolean;
  /** The Planner task's own title, e.g. "Eblast - Oktoberfest October 8". */
  taskTitle?: string | null;
  /** When the eblast has to go out, taken from the task's due date. */
  dueAt?: string | null;
  /** The flyer it was generated from was kept and can be opened alongside it. */
  hasFlyer?: boolean;
  flyerName?: string | null;
}

/** A Planner task the schedule looked at but couldn't draft, and why. */
interface StuckTask {
  taskId: string;
  title: string;
  dueAt: string | null;
  reason: string;
  kind: "missing_community" | "waiting_on_flyer" | "other";
}

function DraftCard({
  draft,
  accentColor,
  isOpening,
  isDeleting,
  onOpen,
  onDelete,
}: {
  draft: DraftMeta;
  accentColor: string;
  isOpening: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isLegacy = !draft.isNewFormat;
  // Exact save timestamp — e.g. "7/9/2026, 9:45 AM" — not a relative "2d ago"
  // bucket, since the precise moment matters for telling similarly-named
  // drafts apart.
  const relTime = new Date(draft.savedAt).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={[
        "group relative flex bg-white rounded-xl border overflow-hidden transition-all duration-150",
        isLegacy
          ? "border-[#e8e3dc] opacity-60"
          : "border-[#e8e3dc] hover:border-[#c8d8d0] hover:shadow-md cursor-pointer",
      ].join(" ")}
    >
      {/* Brand accent stripe */}
      <div className="w-1 shrink-0" style={{ backgroundColor: isLegacy ? "#ddd8d0" : accentColor }} />

      <div className="flex-1 min-w-0 p-4">
        {/* Community + date row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4] truncate">
            {draft.communityName}
          </p>
          <p className="text-[10px] text-[#b0a89f] shrink-0">{relTime}</p>
        </div>

        {draft.dueAt && (
          <p className="mb-1.5 text-[10px] font-semibold text-[#8a6d3b]">
            Send by{" "}
            {new Date(draft.dueAt).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
        )}

        {/* Subject */}
        <p className={`text-sm font-medium leading-snug line-clamp-2 ${isLegacy ? "text-[#7a8c85]" : "text-[#1a1a1a]"}`}>
          {draft.subject || "(no subject)"}
        </p>

        {/* Footer row */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {draft.imageCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#9aaba4]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21,15 16,10 5,21"/>
                </svg>
                {draft.imageCount}
              </span>
            )}
            {draft.approvedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2d6a4f]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Approved
              </span>
            )}
            {draft.pushedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2563eb]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Pushed
              </span>
            )}
            {draft.pendingApproval && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Pending Approval
              </span>
            )}
            {isLegacy && (
              <span className="text-[10px] text-[#b0a89f] italic">Outdated</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            {draft.hasFlyer && (
              <a
                href={`/api/drafts/${draft.id}/flyer`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={draft.flyerName ?? "The flyer this was written from"}
                className="text-[11px] font-medium text-[#7a8c85] hover:text-[#1F4538] underline decoration-dotted underline-offset-2 transition-colors"
              >
                Flyer
              </a>
            )}
            {!isLegacy && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpen(); }}
                disabled={isOpening || isDeleting}
                className="text-[11px] font-semibold text-[#1F4538] border border-[#1F4538]/30 hover:bg-[#1F4538] hover:text-white rounded-lg px-3 py-1 transition-all disabled:opacity-40"
              >
                {isOpening ? "Opening…" : "Open"}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={isDeleting || isOpening}
              title="Delete"
              className="p-1 rounded-lg text-[#c9c0b8] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5l.5-9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PlannerState {
  lookaheadDays: number;
  min: number;
  max: number;
  configured: boolean;
  running: { drafted: number; remaining: number | null; currentTask: string | null } | null;
  lastRun: { status: string; drafted: number; skipped: number; failed: number; remaining: number | null } | null;
}

/**
 * How far ahead to draft, and a button to run it now.
 *
 * The run keeps going across several passes until the backlog is clear, so
 * this polls while one is going rather than waiting on a single request.
 */
function PlannerControls({ onFinished }: { onFinished: () => void }) {
  const [state, setState] = useState<PlannerState | null>(null);
  const [days, setDays] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/planner");
      const d = await r.json();
      if (d.ok) {
        setState(d);
        setDays((prev) => (prev === "" ? String(d.lookaheadDays) : prev));
      }
      return d.ok ? (d as PlannerState) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // While a run is going, keep checking — it hands off between passes, so the
  // work continues after any one request has returned.
  //
  // If a run finishes with work still left, start the next one from here. The
  // server hands off on its own, but a serverless function can be cut off
  // before that request goes out. This makes the backlog finish either way,
  // for as long as the page is open.
  useEffect(() => {
    if (!state?.running) return;
    const timer = setInterval(async () => {
      const next = await load();
      if (next && !next.running) {
        clearInterval(timer);
        onFinished();
        if ((next.lastRun?.remaining ?? 0) > 0 && next.lastRun?.status === "done") {
          fetch("/api/planner", { method: "POST" }).then(load).catch(() => null);
        }
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [state?.running, load, onFinished]);

  async function saveDays(value: string) {
    setDays(value);
    const n = Number(value);
    if (!Number.isFinite(n) || !state) return;
    const clamped = Math.min(state.max, Math.max(state.min, Math.round(n)));
    const r = await fetch("/api/planner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookaheadDays: clamped }),
    });
    const d = await r.json();
    if (d.ok) setState((s) => (s ? { ...s, lookaheadDays: d.lookaheadDays } : s));
  }

  async function runNow() {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/planner", { method: "POST" });
      const d = await r.json();
      if (!d.ok) setError(d.error ?? "Couldn't start");
      await load();
      onFinished();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }

  if (!state) return null;
  if (!state.configured) {
    return (
      <div className="mb-4 rounded-xl border border-[#e8e3dc] bg-[#faf8f4] px-4 py-3">
        <p className="text-xs text-[#7a8c85]">No Planner account is connected, so nothing is drafted automatically.</p>
      </div>
    );
  }

  const running = state.running;
  const last = state.lastRun;

  return (
    <div className="mb-4 rounded-xl border border-[#e8e3dc] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-[#5a6b63]">
          Draft eblasts due in the next
          <input
            type="number"
            min={state.min}
            max={state.max}
            value={days}
            onChange={(e) => saveDays(e.target.value)}
            disabled={!!running}
            className="w-16 rounded-lg border border-[#ddd8d0] px-2 py-1 text-sm text-center text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 disabled:opacity-50"
          />
          days
          <span className="text-[#b0a89f]">(1&ndash;{state.max})</span>
        </label>

        <button
          onClick={runNow}
          disabled={!!running || starting}
          className="text-xs font-semibold rounded-lg px-4 py-1.5 bg-[#1F4538] text-white hover:bg-[#173829] transition-colors disabled:opacity-50"
        >
          {running || starting ? "Running…" : "Run now"}
        </button>
      </div>

      {running && (
        <div className="mt-2.5">
          <p className="text-xs text-[#5a6b63]">
            Drafted {running.drafted}
            {running.remaining !== null && running.remaining > 0 && ` · ${running.remaining} to go`}
            {running.currentTask && <span className="text-[#9aaba4]"> · {running.currentTask}</span>}
          </p>
          <div className="mt-1.5 h-1 rounded-full bg-[#f0ede7] overflow-hidden">
            <div
              className="h-full bg-[#1F4538] transition-all duration-500"
              style={{
                width: `${
                  running.remaining !== null && running.drafted + running.remaining > 0
                    ? Math.round((running.drafted / (running.drafted + running.remaining)) * 100)
                    : 10
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {!running && last && last.status !== "running" && (
        <p className="mt-2 text-[11px] text-[#9aaba4]">
          Last run: {last.drafted} drafted
          {last.skipped > 0 && `, ${last.skipped} skipped`}
          {last.failed > 0 && `, ${last.failed} failed`}
          {last.remaining ? `, ${last.remaining} still to do` : ""}
        </p>
      )}

      {error && <p className="mt-2 text-[11px] text-[#9a3a34]">{error}</p>}
    </div>
  );
}

function NeedsAttentionPanel({ tasks }: { tasks: StuckTask[] }) {
  const blocked = tasks.filter((t) => t.kind === "missing_community" || t.kind === "other");
  const waiting = tasks.filter((t) => t.kind === "waiting_on_flyer");
  const when = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "no date";

  return (
    <div className="mb-4 space-y-3">
      {blocked.length > 0 && (
        <div className="rounded-xl border border-[#f0d5d5] bg-[#fdf6f6] px-4 py-3">
          <p className="text-xs font-semibold text-[#9a3a34]">
            {blocked.length === 1 ? "1 task needs your attention" : `${blocked.length} tasks need your attention`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {blocked.map((t) => (
              <li key={t.taskId} className="text-xs text-[#7a4a44] leading-relaxed">
                <span className="font-medium">{t.title}</span>
                <span className="text-[#b09a97]"> · send by {when(t.dueAt)}</span>
                <br />
                <span className="text-[#9a3a34]">{t.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] text-[#9a8582]">
            Add the community on the Communities page and it&rsquo;ll be drafted on the next run.
          </p>
        </div>
      )}

      {waiting.length > 0 && (
        <div className="rounded-xl border border-[#e8e3dc] bg-[#faf8f4] px-4 py-3">
          <p className="text-xs font-semibold text-[#7a8c85]">
            {waiting.length === 1
              ? "1 eblast is waiting on a flyer"
              : `${waiting.length} eblasts are waiting on a flyer`}
          </p>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {waiting.map((t) => (
              <li key={t.taskId} className="text-xs text-[#5a6b63] truncate">
                {t.title}
                <span className="text-[#b0a89f]"> · {when(t.dueAt)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] text-[#9aaba4]">
            Nothing to do &mdash; each is checked again daily and drafted once a flyer is attached to the task.
          </p>
        </div>
      )}
    </div>
  );
}

function SavedDraftsView({ view = "saved" }: { view?: "saved" | "pending" }) {
  const { loadSavedDraft, communities } = useDraft();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterSlug, setFilterSlug] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DraftMeta | null>(null);
  const [needsAttention, setNeedsAttention] = useState<StuckTask[]>([]);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/saved-drafts?view=${view}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          if (d.ok) {
            setDrafts(d.drafts);
            setNeedsAttention(d.needsAttention ?? []);
          } else setFetchError(d.error ?? "Failed to load");
        }
      })
      .catch((e) => { if (!cancelled) setFetchError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view, reloadKey]);

  const openDraft = useCallback(async (id: string) => {
    setOpeningId(id);
    try {
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.ok && data.draft) {
        loadSavedDraft({
          ...(data.draft as SavedDraft),
          approvedAt: data.approvedAt,
          pushedAt: data.pushedAt,
          pendingApproval: data.pendingApproval,
        });
      }
    } finally {
      setOpeningId(null);
    }
  }, [loadSavedDraft]);

  const deleteDraft = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      // Soft-delete (default, no ?permanent param) — moves it to Deleted
      // Drafts, recoverable there for 30 days.
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  }, []);

  // Community accent color lookup
  const accentBySlug = new Map(communities.map((c) => [c.slug, c.brand.accent]));

  // Build community list from drafts (preserves order of most-recent activity)
  const communityOrder: string[] = [];
  const bySlug = new Map<string, { name: string; drafts: DraftMeta[] }>();
  for (const d of drafts) {
    if (!bySlug.has(d.communitySlug)) {
      communityOrder.push(d.communitySlug);
      bySlug.set(d.communitySlug, { name: d.communityName, drafts: [] });
    }
    bySlug.get(d.communitySlug)!.drafts.push(d);
  }

  // Filter
  const filtered = drafts.filter((d) => {
    if (filterSlug && d.communitySlug !== filterSlug) return false;
    if (search && !d.subject.toLowerCase().includes(search.toLowerCase()) &&
        !d.communityName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 bg-[#f0ede7] rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex bg-white rounded-xl border border-[#e8e3dc] overflow-hidden h-24 animate-pulse">
              <div className="w-1 bg-[#e8e3dc]" />
              <div className="flex-1 p-4 space-y-2">
                <div className="h-2.5 bg-[#f0ede7] rounded w-2/5" />
                <div className="h-3.5 bg-[#f0ede7] rounded w-4/5" />
                <div className="h-2.5 bg-[#f5f3ef] rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-[#5a6b63]">No saved drafts yet</p>
        <p className="mt-1.5 text-xs text-[#9aaba4]">Generate an eblast and click "Save draft" to find it here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + community dropdown */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aaba4] pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drafts…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#ddd8d0] bg-white text-sm text-[#1a1a1a] placeholder-[#b0a89f] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/20 focus:border-[#1F4538]"
          />
        </div>

        {communityOrder.length > 1 && (
          <select
            value={filterSlug ?? ""}
            onChange={(e) => setFilterSlug(e.target.value || null)}
            className="rounded-xl border border-[#ddd8d0] bg-white text-sm text-[#5a6b63] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1F4538]/20 focus:border-[#1F4538] min-w-[180px]"
          >
            <option value="">All communities</option>
            {communityOrder.map((slug) => {
              const g = bySlug.get(slug)!;
              return (
                <option key={slug} value={slug}>
                  {g.name} ({g.drafts.length})
                </option>
              );
            })}
          </select>
        )}

        <p className="text-xs text-[#9aaba4] shrink-0">
          {filtered.length} {filtered.length === 1 ? "draft" : "drafts"}
        </p>
      </div>

      {view === "pending" && <PlannerControls onFinished={reload} />}

      {needsAttention.length > 0 && <NeedsAttentionPanel tasks={needsAttention} />}

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#ddd8d0] py-12 text-center">
          <p className="text-sm text-[#9aaba4]">
            {view === "pending"
              ? "Nothing waiting. Drafts made from your Planner tasks show up here."
              : "No drafts match your search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              accentColor={accentBySlug.get(d.communitySlug) ?? "#1F4538"}
              isOpening={openingId === d.id}
              isDeleting={deletingId === d.id}
              onOpen={() => openDraft(d.id)}
              onDelete={() => setConfirmDelete(d)}
            />
          ))}
        </div>
      )}

      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setConfirmDelete(null)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <DeleteConfirmPopover
                label={confirmDelete.subject || "this draft"}
                message={
                  <>Delete <span className="font-semibold">{confirmDelete.subject || "this draft"}</span>?</>
                }
                footerNote="It'll move to Deleted Drafts, recoverable there for 30 days before it's permanently deleted."
                onConfirm={() => {
                  const id = confirmDelete.id;
                  setConfirmDelete(null);
                  deleteDraft(id);
                }}
                onCancel={() => setConfirmDelete(null)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Deleted Drafts (trash, 30-day recovery) ──────────────────────────────────

interface DeletedDraftMeta extends DraftMeta {
  deletedAt: string;
  purgeAt: string;
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function DeletedDraftCard({
  draft,
  accentColor,
  isBusy,
  onRestore,
  onDeleteForever,
}: {
  draft: DeletedDraftMeta;
  accentColor: string;
  isBusy: boolean;
  onRestore: () => void;
  onDeleteForever: () => void;
}) {
  const relTime = new Date(draft.savedAt).toLocaleString(undefined, {
    month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  const daysLeft = daysUntil(draft.purgeAt);

  return (
    <div className="group relative flex bg-white rounded-xl border border-[#e8e3dc] overflow-hidden opacity-90">
      <div className="w-1 shrink-0" style={{ backgroundColor: accentColor, opacity: 0.4 }} />
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4] truncate">
            {draft.communityName}
          </p>
          <p className="text-[10px] text-[#b0a89f] shrink-0">{relTime}</p>
        </div>
        <p className="text-sm font-medium leading-snug line-clamp-2 text-[#5a6b63]">
          {draft.subject || "(no subject)"}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
            {daysLeft <= 0 ? "Deleting soon" : `Expires in ${daysLeft}d`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRestore}
              disabled={isBusy}
              className="text-[11px] font-semibold text-[#1F4538] border border-[#1F4538]/30 hover:bg-[#1F4538] hover:text-white rounded-lg px-3 py-1 transition-all disabled:opacity-40"
            >
              Restore
            </button>
            <button
              onClick={onDeleteForever}
              disabled={isBusy}
              title="Delete forever"
              className="p-1 rounded-lg text-[#c9c0b8] hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5l.5-9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeletedDraftsView() {
  const { communities } = useDraft();
  const [drafts, setDrafts] = useState<DeletedDraftMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<DeletedDraftMeta | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/saved-drafts/deleted")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setDrafts(d.drafts);
        else setFetchError(d.error ?? "Failed to load");
      })
      .catch((e) => setFetchError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(id)}/restore`, { method: "POST" });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setBusyId(null);
    }
  }, []);

  const purgeForever = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(id)}?permanent=1`, { method: "DELETE" });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setBusyId(null);
    }
  }, []);

  const accentBySlug = new Map(communities.map((c) => [c.slug, c.brand.accent]));

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex bg-white rounded-xl border border-[#e8e3dc] overflow-hidden h-24 animate-pulse">
            <div className="w-1 bg-[#e8e3dc]" />
            <div className="flex-1 p-4 space-y-2">
              <div className="h-2.5 bg-[#f0ede7] rounded w-2/5" />
              <div className="h-3.5 bg-[#f0ede7] rounded w-4/5" />
              <div className="h-2.5 bg-[#f5f3ef] rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 px-6 py-10 text-center">
        <p className="text-sm text-red-600">Could not load deleted drafts</p>
        <p className="mt-1 text-xs text-red-400">{fetchError}</p>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#ddd8d0] px-8 py-20 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f0ede7] mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aaba4" strokeWidth="1.8">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-[#5a6b63]">Nothing in Deleted Drafts</p>
        <p className="mt-1.5 text-xs text-[#9aaba4]">Deleted drafts stay here for 30 days before being permanently removed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#9aaba4]">
        {drafts.length} {drafts.length === 1 ? "draft" : "drafts"} — each is permanently deleted 30 days after being removed.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {drafts.map((d) => (
          <DeletedDraftCard
            key={d.id}
            draft={d}
            accentColor={accentBySlug.get(d.communitySlug) ?? "#1F4538"}
            isBusy={busyId === d.id}
            onRestore={() => restore(d.id)}
            onDeleteForever={() => setConfirmPurge(d)}
          />
        ))}
      </div>

      {confirmPurge && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setConfirmPurge(null)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <DeleteConfirmPopover
                label={confirmPurge.subject || "this draft"}
                message={
                  <>Permanently delete <span className="font-semibold">{confirmPurge.subject || "this draft"}</span>?</>
                }
                confirmLabel="Delete Forever"
                footerNote="This cannot be undone — it will not go through the 30-day recovery period."
                onConfirm={() => {
                  const id = confirmPurge.id;
                  setConfirmPurge(null);
                  purgeForever(id);
                }}
                onCancel={() => setConfirmPurge(null)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface ResumeDraft {
  id: string;
  subject: string;
  communityName: string;
  savedAt: string;
}

/** Shared height for the two side-by-side inputs so they read as a pair. */
const INPUT_BOX_H = 150;

export default function GenerateView() {
  const {
    communities,
    selectedCommunitySlug,
    selectCommunity,
    generate,
    cancelGenerate,
    isGenerating,
    generateError,
    loadSavedDraft,
  } = useDraft();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<"new" | "pending" | "drafts" | "deleted">("new");
  const [resumeDraft, setResumeDraft] = useState<ResumeDraft | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  // Pre-select community from URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("community");
    if (slug && communities.some((c) => c.slug === slug)) {
      selectCommunity(slug);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communities.length]);

  // Check localStorage for a draft the user can resume
  useEffect(() => {
    let cancelled = false;
    try {
      const lastId = localStorage.getItem("eblast_lastDraftId");
      if (!lastId) return;
      fetch(`/api/saved-drafts/${encodeURIComponent(lastId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || !data.ok || !data.draft?.fields) return;
          const d = data.draft;
          const ageMs = Date.now() - new Date(d.savedAt).getTime();
          // Only offer resume if the draft is less than 7 days old
          if (ageMs < 7 * 24 * 60 * 60 * 1000) {
            setResumeDraft({ id: lastId, subject: d.subject, communityName: d.communityName, savedAt: d.savedAt });
          }
        })
        .catch(() => null);
    } catch {}
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleResume() {
    if (!resumeDraft) return;
    setIsResuming(true);
    try {
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(resumeDraft.id)}`);
      const data = await res.json();
      if (data.ok && data.draft) {
        loadSavedDraft({
          ...data.draft,
          approvedAt: data.approvedAt,
          pushedAt: data.pushedAt,
          pendingApproval: data.pendingApproval,
        });
        setResumeDraft(null);
      }
    } finally {
      setIsResuming(false);
    }
  }

  const selectedCommunity = communities.find((c) => c.slug === selectedCommunitySlug) ?? null;

  function handleFile(f: File | null) {
    if (f?.type === "application/pdf") setFile(f);
  }

  async function handleGenerate() {
    if ((!file && !notes.trim()) || !selectedCommunitySlug) return;
    await generate(file, notes);
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
              Create a new draft from a flyer PDF, pasted event details, or both — or continue editing a saved one.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-[#f0ede7] rounded-xl p-1 mb-8 w-fit mx-auto">
            <button
              onClick={() => setTab("new")}
              className={[
                "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                tab === "new" ? "bg-white text-[#1F4538] shadow-sm" : "text-[#7a8c85] hover:text-[#3d5249]",
              ].join(" ")}
            >
              New Draft
            </button>
            <button
              onClick={() => setTab("pending")}
              className={[
                "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                tab === "pending" ? "bg-white text-[#1F4538] shadow-sm" : "text-[#7a8c85] hover:text-[#3d5249]",
              ].join(" ")}
            >
              Pending Drafts
            </button>
            <button
              onClick={() => setTab("drafts")}
              className={[
                "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                tab === "drafts" ? "bg-white text-[#1F4538] shadow-sm" : "text-[#7a8c85] hover:text-[#3d5249]",
              ].join(" ")}
            >
              Saved Drafts
            </button>
            <button
              onClick={() => setTab("deleted")}
              className={[
                "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                tab === "deleted" ? "bg-white text-[#1F4538] shadow-sm" : "text-[#7a8c85] hover:text-[#3d5249]",
              ].join(" ")}
            >
              Deleted Drafts
            </button>
          </div>

          {/* Resume banner */}
          {resumeDraft && (
            <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-[#c8d8d0] bg-[#f0f5f2] px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#1F4538]">Resume where you left off</p>
                <p className="text-sm text-[#3d5249] truncate mt-0.5">
                  {resumeDraft.communityName} · <span className="text-[#5a6b63]">{resumeDraft.subject || "(no subject)"}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setResumeDraft(null)}
                  className="text-xs text-[#9aaba4] hover:text-[#5a6b63] transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleResume}
                  disabled={isResuming}
                  className="text-xs font-semibold text-white bg-[#1F4538] hover:bg-[#173829] rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50"
                >
                  {isResuming ? "Opening…" : "Resume Draft →"}
                </button>
              </div>
            </div>
          )}

          {/* Tab content */}
          {tab === "new" ? (
            <div className="flex gap-6 items-stretch">
              {/* Generate card — flex-1 so it fills space left by CI card */}
              <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-[#e8e3dc] p-7">
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

                {/* Neither field is individually required, but one of them is —
                    so the requirement lives here rather than as "(optional)" on
                    both, which read as though you could skip both. */}
                <p className="mb-2 text-xs text-[#9aaba4]">Add a flyer, some context, or both.</p>
                <div className="mb-6 grid gap-4 md:grid-cols-2">
                  <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-2">
                    Flyer PDF
                  </label>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0] ?? null); }}
                    disabled={isGenerating}
                    className={[
                      // Height is fixed rather than derived from padding so the
                      // notes box beside it can match exactly — see INPUT_BOX_H.
                      "w-full rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 text-sm",
                      dragOver ? "border-[#1F4538] bg-[#1F4538]/5"
                        : file ? "border-[#1F4538]/40 bg-[#f0f5f2]"
                        : "border-[#ddd8d0] bg-[#faf9f6] hover:border-[#1F4538]/40 hover:bg-[#f5f3ef]",
                    ].join(" ")}
                    style={{ height: INPUT_BOX_H }}
                  >
                    {file ? (
                      <>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1F4538" strokeWidth="1.8">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14,2 14,8 20,8"/>
                        </svg>
                        {/* Long PDF names have no natural break point, so they
                            must be clamped or they run past the box edges. */}
                        <span className="font-medium text-[#1F4538] max-w-full truncate px-4" title={file.name}>{file.name}</span>
                        <span className="text-[#7a8c85] text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</span>
                      </>
                    ) : (
                      <>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9aaba4" strokeWidth="1.8">
                          <polyline points="16,16 12,12 8,16"/>
                          <line x1="12" y1="12" x2="12" y2="21"/>
                          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                        </svg>
                        <span className="font-medium text-[#5a6b63]">Drop PDF here or click to browse</span>
                        <span className="text-[#9aaba4] text-xs">PDF files only</span>
                      </>
                    )}
                  </button>
                  <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
                  </div>

                  {/* Either input works on its own. With both, the pasted
                      details take precedence where they contradict the flyer. */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-[#7a8c85] mb-2">
                      More context
                    </label>
                    {/* A textarea's own placeholder can't be vertically centred
                        or carry an icon, so the empty state is an overlay that
                        mirrors the flyer box exactly. pointer-events-none keeps
                        clicks falling through to the textarea underneath. */}
                    <div className="relative">
                      {/* `block` matters: as an inline-block the textarea adds a
                          descender gap to its wrapper, which offsets the centred
                          overlay by a few pixels. */}
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={isGenerating}
                        className="block w-full rounded-xl border-2 border-dashed border-[#ddd8d0] bg-[#faf9f6] px-3.5 py-3 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#1F4538]/40 focus:bg-white transition-colors resize-none"
                        style={{ height: INPUT_BOX_H }}
                      />
                      {!notes && (
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9aaba4" strokeWidth="1.8">
                            <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h9" />
                          </svg>
                          <span className="font-medium text-[#5a6b63]">Type or paste details</span>
                          <span className="text-[#9aaba4] text-xs">Dates, RSVP info, anything else</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {file && notes.trim() && (
                  <p className="-mt-2 mb-4 text-xs text-[#7a8c85]">
                    Your notes override the flyer.
                  </p>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={(!file && !notes.trim()) || !selectedCommunitySlug || isGenerating}
                  className="w-full rounded-lg bg-[#1F4538] text-white font-semibold py-3 px-6 text-sm tracking-wide hover:bg-[#173829] active:bg-[#112d21] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGenerating ? "Generating…" : "Generate Eblast"}
                </button>

                {isGenerating && (
                  <div className="mt-4 flex items-center justify-between text-sm text-[#5a6b63]">
                    <span>This takes 30–90 seconds.</span>
                    <button onClick={cancelGenerate} className="text-xs text-[#9aaba4] hover:text-[#1F4538] underline underline-offset-2 ml-4 shrink-0">
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
                    <p className="text-xs text-[#3d5249] leading-relaxed">
                      Extracting images · Reading copy · Drafting subject · Building email
                    </p>
                  </div>
                )}

                {generateError && (
                  <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {generateError}
                  </div>
                )}
              </div>

              {/* Community Intelligence sidebar — slides in when a community is selected */}
              <div
                className="overflow-hidden shrink-0"
                style={{
                  width: selectedCommunity ? 380 : 0,
                  opacity: selectedCommunity ? 1 : 0,
                  transition: "width 420ms cubic-bezier(0.4,0,0.2,1), opacity 320ms ease",
                }}
              >
                <div style={{ width: 380 }} className="h-full">
                  {selectedCommunity && (
                    <div className="bg-white rounded-2xl shadow-sm border border-[#e8e3dc] overflow-hidden flex flex-col h-full">
                      <div className="px-5 py-4 border-b border-[#f0ede7] shrink-0">
                        <p className="text-xs font-semibold uppercase tracking-widest text-[#7a8c85]">Community Intelligence</p>
                        <p className="text-base font-semibold text-[#1F4538] mt-0.5">{selectedCommunity.displayName}</p>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <CommunityIntelligence communitySlug={selectedCommunity.slug} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : tab === "pending" ? (
            <SavedDraftsView view="pending" />
          ) : tab === "drafts" ? (
            <SavedDraftsView view="saved" />
          ) : (
            <DeletedDraftsView />
          )}
        </div>
      </div>
    </div>
  );
}
