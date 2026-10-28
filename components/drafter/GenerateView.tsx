"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDraft, type SavedDraft } from "@/context/DraftContext";
import { CommunityIntelligence } from "@/components/CommunityIntelligence";
import { Header } from "@/components/Header";
import { DeleteConfirmPopover } from "@/components/drafter/DeleteConfirmPopover";
import {
  FOLDER_LABELS,
  STATUS_LABELS,
  type DraftFolder,
  type DraftStatus,
} from "@/lib/draft-folders";

// ─── Saved Drafts ─────────────────────────────────────────────────────────────

/**
 * The tabs, in pipeline order, then the two places things are kept.
 *
 * "always" means the tab is shown even when empty, because its absence would
 * be confusing rather than tidy — there is always somewhere to look for
 * finished work and always a bin.
 */
const FOLDER_TABS: Array<{ folder: DraftFolder; always: boolean }> = [
  { folder: "pending", always: true },
  { folder: "in-progress", always: true },
  { folder: "waiting", always: false },
  { folder: "done", always: true },
  { folder: "archived", always: false },
  { folder: "deleted", always: true },
];

/** What an empty folder means, which differs enough to be worth saying. */
const EMPTY_FOLDER: Record<DraftFolder, string> = {
  pending: "Nothing waiting. Eblasts the schedule writes from your Planner tasks turn up here.",
  "in-progress": "Nothing on the go. Start one with New eblast, or open something from Pending.",
  waiting: "Nothing with a salesperson right now.",
  done: "Nothing has gone to HubSpot yet.",
  archived: "Nothing archived. Anything you put here is kept until you remove it.",
  deleted: "Nothing deleted.",
};

/** Where a number means there is something to do. */
const COUNTED = new Set<DraftFolder>(["pending", "in-progress", "waiting"]);

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
  /** Where it sits, and what it is doing there — both worked out server-side. */
  folder?: DraftFolder;
  status?: DraftStatus;
  archivedAt?: string | null;
  approvalSentAt?: string | null;
  /** Most recent time it was opened, which is not the same as last saved. */
  lastOpenedAt?: string | null;
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

/**
 * What has happened to this eblast, in one phrase.
 *
 * The words are fixed and mean one thing each. Pushed is it was put into
 * HubSpot from here. Approved is a salesperson put it into HubSpot by
 * clicking their link — the same outcome, named for who did it. Sent for
 * approval is the only place the word sent appears, and it refers to the
 * email asking them to look, never to the eblast reaching anybody.
 *
 * Nothing says published. Whether HubSpot has actually mailed it out is not
 * something the app acts on, and a badge that was a day behind the truth
 * would be worse than no badge at all.
 */
function StatusPill({ draft }: { draft: DraftMeta }) {
  const status: DraftStatus | null =
    draft.status ??
    (draft.approvedAt ? "approved" : draft.pushedAt ? "pushed" : draft.pendingApproval ? "sent-for-approval" : null);
  if (!status || status === "pending" || status === "in-progress") return null;

  const look: Record<string, { className: string; icon: React.ReactNode }> = {
    approved: {
      className: "text-[#2d6a4f]",
      icon: <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round" />,
    },
    pushed: {
      className: "text-[#2563eb]",
      icon: <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />,
    },
    "sent-for-approval": {
      className: "text-amber-700",
      icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" /></>,
    },
    "changes-requested": {
      className: "text-[#b3312c]",
      icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
    },
    "approval-expired": {
      className: "text-[#8a6d3b]",
      icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5" strokeLinecap="round" /><path d="M12 16v.01" strokeLinecap="round" /></>,
    },
  };
  const { className, icon } = look[status];

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${className}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        {icon}
      </svg>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** A Planner task the schedule looked at but couldn't draft, and why. */
interface StuckTask {
  taskId: string;
  title: string;
  dueAt: string | null;
  reason: string;
  kind: "missing_community" | "waiting_on_flyer" | "other";
}

/**
 * How long ago, in as few words as it takes.
 *
 * Rough on purpose. The exact moment is in the card's tooltip for telling two
 * similar drafts apart; here the only question is whether this is the one you
 * were just in, and "2h" answers that faster than a timestamp does.
 */
function shortAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The one line under the subject that says where this eblast stands.
 *
 * Which fact matters depends entirely on the folder. A deadline is the whole
 * point while an eblast is still being written and means nothing once it has
 * gone to HubSpot — a card in Done saying "send by" reads as work outstanding
 * when there is none. So each folder gets the date that answers the question
 * someone is actually asking there, and only that one.
 */
function contextLine(draft: DraftMeta): { text: string; tone: string } | null {
  const day = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const daysSince = (d: string) => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return Math.floor((midnight.getTime() - new Date(d).getTime()) / 86400000);
  };
  const ago = (d: string) => {
    const n = daysSince(d);
    return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
  };

  switch (draft.folder) {
    case "done":
      // It is in HubSpot. When, and who put it there.
      if (draft.approvedAt) return { text: `Approved ${day(draft.approvedAt)}`, tone: "text-[#2d6a4f]" };
      if (draft.pushedAt) return { text: `Pushed ${day(draft.pushedAt)}`, tone: "text-[#2563eb]" };
      return null;

    case "waiting":
      if (draft.status === "changes-requested") return { text: "Changes requested", tone: "text-[#b3312c]" };
      if (draft.status === "approval-expired") return { text: "Approval link expired", tone: "text-[#8a6d3b]" };
      if (draft.approvalSentAt) return { text: `Sent for approval ${ago(draft.approvalSentAt)}`, tone: "text-[#8a6d3b]" };
      return { text: "Sent for approval", tone: "text-[#8a6d3b]" };

    case "archived":
      return draft.archivedAt ? { text: `Archived ${day(draft.archivedAt)}`, tone: "text-[#7a8c85]" } : null;

    // Still to go out, so the deadline is the fact that matters. A deadline
    // already behind us almost always means a task was un-ticked by accident,
    // and the date on its own looks like any other date.
    default: {
      if (!draft.dueAt) return null;
      const late = daysSince(draft.dueAt);
      const when = new Date(draft.dueAt).toLocaleDateString(undefined, {
        weekday: "short", month: "short", day: "numeric",
      });
      if (late > 0) {
        return {
          text: `Was due ${when}, ${late === 1 ? "1 day" : `${late} days`} ago — check this is still wanted`,
          tone: "text-[#b3312c]",
        };
      }
      return { text: `Send by ${when}`, tone: "text-[#8a6d3b]" };
    }
  }
}

function DraftCard({
  draft,
  accentColor,
  isOpening,
  isDeleting,
  onOpen,
  onDelete,
  onArchive,
}: {
  draft: DraftMeta;
  accentColor: string;
  isOpening: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const archived = !!draft.archivedAt;
  const isLegacy = !draft.isNewFormat;
  const context = contextLine(draft);
  // Falls back to the save time for anything saved before opens were
  // recorded, which is the nearest thing those drafts have.
  const openedIso = draft.lastOpenedAt ?? draft.savedAt;
  const lastOpen = openedIso
    ? { ago: shortAgo(openedIso), exact: new Date(openedIso).toLocaleString() }
    : null;
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
        {/* The subject first and on its own, because that is what anyone is
            scanning for. Everything else used to come before it in smaller,
            fainter type, which made four grey things to read past. */}
        <p
          className={`text-sm font-medium leading-snug line-clamp-2 ${isLegacy ? "text-[#7a8c85]" : "text-[#1a1a1a]"}`}
          title={`Last saved ${relTime}`}
        >
          {draft.subject || "(no subject)"}
        </p>

        {/* Who it is for, the one date that matters where this card is, and
            when it was last open. The last of those sits at the far right on
            its own, so it reads as a note about the card rather than another
            thing competing with the subject. */}
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#9aaba4] min-w-0">
          <span className="truncate">{draft.communityName}</span>
          {context && (
            <>
              <span className="text-[#ddd8d0] shrink-0">&middot;</span>
              <span className={`${context.tone} font-medium shrink-0`}>{context.text}</span>
            </>
          )}
          {lastOpen && (
            <span className="ml-auto shrink-0 text-[#b0a89f]" title={`Last opened ${lastOpen.exact}`}>
              Opened {lastOpen.ago}
            </span>
          )}
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
            {draft.folder !== "done" && draft.folder !== "waiting" && <StatusPill draft={draft} />}
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
            {/* Archived is the one folder nothing clears on its own, so this
                is how an eblast is kept past the week. Same button both ways. */}
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              disabled={isDeleting || isOpening}
              title={archived ? "Take out of Archived" : "Keep this one — move to Archived"}
              className={[
                "p-1 rounded-lg transition-all disabled:opacity-30",
                archived
                  ? "text-[#1F4538] hover:bg-[#f0f5f2]"
                  : "text-[#c9c0b8] hover:text-[#1F4538] hover:bg-[#f0f5f2] opacity-0 group-hover:opacity-100",
              ].join(" ")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="4" width="18" height="4" rx="1" />
                <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                <line x1="10" y1="12" x2="14" y2="12" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={isDeleting || isOpening}
              title="Move to Deleted"
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

/**
 * The tasks the schedule looked at and could not draft.
 *
 * Grouped by the reason rather than listed flat. Twelve rows all saying the
 * same thing about the same plan is one problem, not twelve, and reading the
 * reason twelve times is what made the list hard to look at. The reason is
 * said once, with its tasks under it.
 *
 * Clearing is per row or all at once. Each run already clears a task that has
 * been completed or reassigned, so this is for the ones that will sit there
 * otherwise — a plan that will never be a community, an eblast handled some
 * other way. A cleared task comes back if a later run still cannot draft it.
 */
function NeedsAttentionPanel({ tasks, onCleared }: { tasks: StuckTask[]; onCleared: () => void }) {
  const [clearing, setClearing] = React.useState<string | null>(null);
  // Collapsed by hand and remembered, since the flyer list in particular is
  // long, needs nothing from anyone, and is mostly in the way.
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("eblast_attentionCollapsed");
      if (saved) setCollapsed(JSON.parse(saved));
    } catch {}
  }, []);
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("eblast_attentionCollapsed", JSON.stringify(next)); } catch {}
      return next;
    });

  /** The heading is the control, so the whole line is the hit area. */
  const chevron = (open: boolean, tone: string) => (
    <svg
      width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className={`${tone} shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );

  const blocked = tasks.filter((t) => t.kind === "missing_community" || t.kind === "other");
  const waiting = tasks.filter((t) => t.kind === "waiting_on_flyer");
  const when = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "no date";

  async function clear(taskIds: string[], key: string) {
    setClearing(key);
    try {
      await fetch("/api/planner/attention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds }),
      });
      onCleared();
    } finally {
      setClearing(null);
    }
  }

  /** One reason, with every task that gave it. */
  function byReason(list: StuckTask[]) {
    const groups = new Map<string, StuckTask[]>();
    for (const t of list) {
      const key = t.reason || "No reason recorded";
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }

  const clearAll = (list: StuckTask[], key: string) => clear(list.map((t) => t.taskId), key);

  const row = (t: StuckTask, tone: { text: string; meta: string; hover: string }) => (
    <li key={t.taskId} className="group flex items-baseline gap-2 py-0.5">
      <span className={`flex-1 min-w-0 truncate text-xs ${tone.text}`}>{t.title}</span>
      <span className={`shrink-0 text-[11px] tabular-nums ${tone.meta}`}>send by {when(t.dueAt)}</span>
      <button
        onClick={() => clear([t.taskId], t.taskId)}
        disabled={clearing === t.taskId}
        title="Clear this from the list"
        className={`shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${tone.hover} disabled:opacity-40`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </li>
  );

  return (
    <div className="mb-4 space-y-3">
      {blocked.length > 0 && (
        <div className="rounded-xl border border-[#f0d5d5] bg-[#fdf6f6] px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggle("blocked")}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#9a3a34]"
            >
              {chevron(!collapsed.blocked, "text-[#b08a86]")}
              {blocked.length === 1 ? "1 task needs your attention" : `${blocked.length} tasks need your attention`}
            </button>
            <button
              onClick={() => clearAll(blocked, "blocked")}
              disabled={clearing === "blocked"}
              className="ml-auto text-[11px] font-medium text-[#b08a86] hover:text-[#9a3a34] transition-colors disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
          <div className={`mt-2 space-y-2.5 ${collapsed.blocked ? "hidden" : ""}`}>
            {byReason(blocked).map(([reason, group]) => (
              <div key={reason}>
                <p className="text-[11px] font-medium text-[#9a3a34]">
                  {reason}
                  {group.length > 1 && <span className="text-[#b09a97]"> &middot; {group.length} tasks</span>}
                </p>
                <ul className="mt-0.5 pl-3 border-l border-[#f0d5d5]">
                  {group.map((t) => row(t, { text: "text-[#7a4a44]", meta: "text-[#b09a97]", hover: "text-[#b08a86] hover:text-[#9a3a34] hover:bg-[#f7e9e9]" }))}
                </ul>
              </div>
            ))}
          </div>
          {!collapsed.blocked && (
            <p className="mt-2.5 text-[11px] text-[#9a8582]">Add the community and it drafts on the next run.</p>
          )}
        </div>
      )}

      {waiting.length > 0 && (
        <div className="rounded-xl border border-[#e8e3dc] bg-[#faf8f4] px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggle("waiting")}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#7a8c85]"
            >
              {chevron(!collapsed.waiting, "text-[#b0a89f]")}
              {waiting.length === 1
                ? "1 eblast is waiting on a flyer"
                : `${waiting.length} eblasts are waiting on a flyer`}
            </button>
            <button
              onClick={() => clearAll(waiting, "waiting")}
              disabled={clearing === "waiting"}
              className="ml-auto text-[11px] font-medium text-[#b0a89f] hover:text-[#5a6b63] transition-colors disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
          {!collapsed.waiting && (
            <>
              <ul className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                {waiting.map((t) => row(t, { text: "text-[#5a6b63]", meta: "text-[#b0a89f]", hover: "text-[#b0a89f] hover:text-[#5a6b63] hover:bg-[#f0ede7]" }))}
              </ul>
              <p className="mt-2.5 text-[11px] text-[#9aaba4]">Nothing to do &mdash; each drafts once a flyer is attached.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Throw away every pending draft and let the automation write them again.
 *
 * For when the drafter has improved since these were made. Deleting them in
 * the list would not be enough: each one's Planner task still points at it, so
 * the next run counts it as done, and the task is still marked In progress, so
 * it is not a candidate either. This does all three.
 *
 * The drafts go to Deleted rather than being destroyed, so this is undoable
 * for as long as they sit there.
 */
function RedraftPendingButton({ count, onDone }: { count: number; onDone: () => void }) {
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/planner/redraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!d.ok) {
        setResult(d.error ?? "Could not redraft");
      } else {
        const stuck = (d.failedToUnmark ?? []).length;
        setResult(
          stuck > 0
            ? `Moved ${d.deleted} to Deleted. ${stuck} task${stuck === 1 ? "" : "s"} could not be set back to Not started in Planner — do those by hand, then press Run now.`
            : `Moved ${d.deleted} to Deleted and put their tasks back to Not started. Press Run now to write them again.`,
        );
        setAsking(false);
        onDone();
      }
    } catch (e: any) {
      setResult(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      {result && (
        <div className="mb-2 rounded-xl border border-[#d8e3dc] bg-[#f3f8f5] px-4 py-2.5 text-xs text-[#1F4538]">
          {result}
        </div>
      )}
      {asking ? (
        <div className="rounded-xl border border-[#f0d5d5] bg-[#fdf6f6] px-4 py-3">
          <p className="text-xs text-[#9a3a34]">
            Move all {count} pending draft{count === 1 ? "" : "s"} to Deleted and write them again from their flyers?
          </p>
          <p className="mt-1 text-[11px] text-[#9a8582]">The old ones stay in Deleted.</p>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={run}
              disabled={busy}
              className="rounded-lg bg-[#b3312c] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[#96271f] transition-colors disabled:opacity-40"
            >
              {busy ? "Working…" : "Redraft them"}
            </button>
            <button
              onClick={() => setAsking(false)}
              disabled={busy}
              className="rounded-lg border border-[#ddd8d0] text-[#5a6b63] text-xs font-medium px-3 py-1.5 hover:bg-[#f5f3ef] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAsking(true)}
          className="text-xs font-medium text-[#7a8c85] hover:text-[#1F4538] transition-colors flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Redraft all {count} pending
        </button>
      )}
    </div>
  );
}

function SavedDraftsView({
  folder,
  onCountsChanged,
}: {
  folder: DraftFolder;
  onCountsChanged?: () => void;
}) {
  // The old name, kept because the ordering and empty-state copy below still
  // read in terms of it.
  const view = folder;
  const { loadSavedDraft, communities } = useDraft();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterSlug, setFilterSlug] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DraftMeta | null>(null);

  // Archiving is reversible and moves nothing out of reach, so it just
  // happens — the card leaves the folder, which is the confirmation.
  const toggleArchive = useCallback(
    async (d: DraftMeta) => {
      const archived = !d.archivedAt;
      const res = await fetch(`/api/saved-drafts/${encodeURIComponent(d.id)}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      }).catch(() => null);
      if (res?.ok) {
        setDrafts((prev) => prev.filter((x) => x.id !== d.id));
        onCountsChanged?.();
      }
    },
    [onCountsChanged],
  );
  const [needsAttention, setNeedsAttention] = useState<StuckTask[]>([]);

  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/saved-drafts?folder=${folder}`)
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
        // Give the draft its own address so the back button returns here.
        router.push(`/draft/${encodeURIComponent(id)}`);
      }
    } finally {
      setOpeningId(null);
    }
  }, [loadSavedDraft, router]);

  const deleteDraft = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      // Soft-delete (default, no ?permanent param) — moves it to Deleted
      // Drafts, recoverable there for a week.
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

  // An empty folder used to return early, which took Run now and the
  // needs-attention list with it — so the moment Pending emptied there was no
  // way left to fill it. The empty state is part of the page now, not instead
  // of it.
  const isEmpty = drafts.length === 0;

  return (
    <div className="space-y-4">
      {/* Search + community dropdown */}
      <div className={`flex items-center gap-3 ${isEmpty ? "hidden" : ""}`}>
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

      {needsAttention.length > 0 && <NeedsAttentionPanel tasks={needsAttention} onCleared={reload} />}

      {view === "pending" && drafts.length > 0 && (
        <RedraftPendingButton count={drafts.length} onDone={reload} />
      )}

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#ddd8d0] py-12 text-center">
          <p className="text-sm text-[#9aaba4]">{isEmpty ? EMPTY_FOLDER[folder] : "No drafts match your search."}</p>
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
              onArchive={() => toggleArchive(d)}
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
                  <>Move <span className="font-semibold">{confirmDelete.subject || "this draft"}</span> to Deleted?</>
                }
                footerNote="Kept for a week."
                confirmLabel="Move to Deleted"
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

// ─── Deleted Drafts (the bin, a week to change your mind) ────────────────────

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

  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [emptying, setEmptying] = useState(false);

  const emptyBin = useCallback(async () => {
    setEmptying(true);
    try {
      const res = await fetch("/api/saved-drafts/purge-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) setDrafts([]);
    } finally {
      setEmptying(false);
      setConfirmEmpty(false);
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
        <p className="mt-1.5 text-xs text-[#9aaba4]">Kept for a week, then gone for good.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <p className="text-xs text-[#9aaba4]">
          {drafts.length} {drafts.length === 1 ? "draft" : "drafts"}, each gone for good a week after it was deleted.
        </p>
        <button
          onClick={() => setConfirmEmpty(true)}
          className="ml-auto text-xs font-medium text-[#b08a86] hover:text-[#b3312c] transition-colors"
        >
          Empty now
        </button>
      </div>
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

      {confirmEmpty && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setConfirmEmpty(false)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <DeleteConfirmPopover
                label="everything in Deleted"
                message={
                  <>Delete all {drafts.length} permanently?</>
                }
                confirmLabel={emptying ? "Deleting…" : "Delete all"}
                footerNote={undefined}
                onConfirm={emptyBin}
                onCancel={() => setConfirmEmpty(false)}
              />
            </div>
          </div>
        </>
      )}

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
                confirmLabel="Delete permanently"
                footerNote="This cannot be undone."
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
  const router = useRouter();
  const [tab, setTab] = useState<"new" | DraftFolder>("new");
  // Every folder's size, so a tab can show what is in it and stay out of the
  // way when it is empty. Refreshed whenever a folder view reloads.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const refreshCounts = useCallback(() => {
    fetch("/api/saved-drafts")
      .then((r) => r.json())
      .then((d) => { if (d.ok && d.counts) setCounts(d.counts); })
      .catch(() => null);
  }, []);
  useEffect(() => { refreshCounts(); }, [refreshCounts, tab]);
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
        router.push(`/draft/${encodeURIComponent(resumeDraft.id)}`);
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
    const id = await generate(file, notes);
    if (id) router.push(`/draft/${encodeURIComponent(id)}`);
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
              From a flyer PDF, pasted event details, or both.
            </p>
          </div>

          {/* Making a new eblast is an action, not a place, so it is a button.
              What is left reads as one thing: where the eblasts are.

              Waiting and Archived appear only when they hold something. Most
              days there is nothing waiting on a salesperson and nothing has
              been archived, and a tab for an empty folder is one more thing
              to read past. Counts go on the three that mean there is work. */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <button
              onClick={() => setTab("new")}
              className={[
                "rounded-lg px-4 py-2 text-sm font-semibold transition-colors flex items-center gap-1.5",
                tab === "new"
                  ? "bg-[#1F4538] text-white"
                  : "bg-[#1F4538] text-white hover:bg-[#173829]",
              ].join(" ")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New eblast
            </button>

            <div className="flex items-center gap-1 bg-[#f0ede7] rounded-xl p-1">
              {FOLDER_TABS.map(({ folder, always }) => {
                const n = counts[folder] ?? 0;
                if (!always && n === 0 && tab !== folder) return null;
                const divider = folder === "archived" || (folder === "deleted" && (counts.archived ?? 0) === 0);
                return (
                  <React.Fragment key={folder}>
                    {divider && <span className="w-px h-5 bg-[#ddd8d0] mx-1" aria-hidden />}
                    <button
                      onClick={() => setTab(folder)}
                      className={[
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-1.5",
                        tab === folder ? "bg-white text-[#1F4538] shadow-sm" : "text-[#7a8c85] hover:text-[#3d5249]",
                      ].join(" ")}
                    >
                      {FOLDER_LABELS[folder]}
                      {COUNTED.has(folder) && n > 0 && (
                        <span className={[
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                          tab === folder ? "bg-[#1F4538] text-white" : "bg-[#ddd8d0] text-[#5a6b63]",
                        ].join(" ")}>
                          {n}
                        </span>
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>


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

                {/* Inside the card, under the thing it is the alternative to.
                    Three placements failed because it was a lone element
                    belonging to no group — a banner over the page, then text
                    floating above the list, then a button in the tab row. Here
                    it is part of something: the last row of the panel whose
                    job is "start an eblast". */}
                {resumeDraft && (
                  <div className="mt-6 pt-4 border-t border-[#f0ede7] flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9aaba4]">
                        Or pick up where you left off
                      </p>
                      <p className="mt-0.5 text-sm text-[#3d5249] truncate">
                        {resumeDraft.subject || "(no subject)"}
                        <span className="text-[#9aaba4]"> · {resumeDraft.communityName}</span>
                      </p>
                    </div>
                    <button
                      onClick={handleResume}
                      disabled={isResuming}
                      className="shrink-0 rounded-lg border border-[#1F4538]/30 text-[#1F4538] text-xs font-semibold px-3 py-1.5 hover:bg-[#1F4538] hover:text-white transition-colors disabled:opacity-50"
                    >
                      {isResuming ? "Opening…" : "Open"}
                    </button>
                    <button
                      onClick={() => setResumeDraft(null)}
                      title="Hide this"
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[#c9c0b8] hover:text-[#5a6b63] hover:bg-[#f5f3ef] transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
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
          ) : tab === "deleted" ? (
            <DeletedDraftsView />
          ) : (
            <SavedDraftsView folder={tab} onCountsChanged={refreshCounts} />
          )}
        </div>
      </div>
    </div>
  );
}
