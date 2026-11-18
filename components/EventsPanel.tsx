"use client";

import { useMemo, useState } from "react";

export interface EventRow {
  taskId: string;
  eventName: string;
  community: string | null;
  dueAt: string | null;
  matchNote: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  eventTime: string | null;
  eventLocation: string | null;
  facebookDescription: string | null;
  furtherDescription: string | null;
  generatedAt: string | null;
  /** "draft" or "flyer" — written from the eblast, or straight from the flyer. */
  generatedFrom: string | null;
  /** The eblast was drafted again after this was written. */
  stale: boolean;
  postedToFacebookAt: string | null;
  /** Whether Further already holds an event of this name. Null if we could not ask. */
  inFurther: boolean | null;
  /** The community's Facebook events tab, when one is on file. */
  facebookEventsUrl: string | null;
  communitySlug: string | null;
}

const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
const MON = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const FULL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

type Filter = "todo" | "all";

/**
 * Pick an event on the left, work it on the right.
 *
 * The job here is copying four things into two websites, one event at a time.
 * The first version put all seventy-five in one column and opened each one
 * into a stack of boxes under its own row, which meant the thing being worked
 * on was never in the same place twice and never had room. So: a quiet index
 * on the left that stays put, and one event at a time on the right with the
 * width to be read.
 *
 * Only what still needs doing is shown by default. Most of the list is months
 * away, and a list that is mostly not-yet is a list nobody trusts.
 */
export function EventsPanel({ initialRows }: { initialRows: EventRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<Filter>("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => !r.postedToFacebookAt)),
    [rows, filter],
  );
  /**
   * The index, by community.
   *
   * Grouped this way because the work is done a building at a time: the
   * flyers, the photos and the voice all belong to one community, and jumping
   * between them is the expensive part. Within a community the soonest is
   * first, since that is the one that has to go up.
   */
  const byCommunity = useMemo(() => {
    const groups = new Map<string, EventRow[]>();
    for (const r of visible) {
      const key = r.community ?? "No community";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([community, list]) => {
        const sorted = [...list].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
        return [community, sorted] as const;
      });
  }, [visible]);

  const [selectedId, setSelectedId] = useState<string | null>(initialRows[0]?.taskId ?? null);
  const selected = visible.find((r) => r.taskId === selectedId) ?? byCommunity[0]?.[1][0] ?? null;
  const todo = rows.filter((r) => !r.postedToFacebookAt).length;

  async function generate(taskId: string) {
    setBusy(taskId);
    setErrors((e) => ({ ...e, [taskId]: "" }));
    try {
      const res = await fetch(`/api/fb-events/${taskId}/generate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not write it");
      setRows((prev) =>
        prev.map((r) =>
          r.taskId === taskId
            ? {
                ...r,
                eventTitle: json.name,
                facebookDescription: json.descriptions.facebook,
                furtherDescription: json.descriptions.further,
                generatedAt: new Date().toISOString(),
                generatedFrom: json.from ?? r.generatedFrom,
                stale: false,
              }
            : r,
        ),
      );
    } catch (e) {
      setErrors((p) => ({ ...p, [taskId]: e instanceof Error ? e.message : "Could not write it" }));
    } finally {
      setBusy(null);
    }
  }

  async function setPosted(taskId: string, posted: boolean) {
    const was = rows.find((r) => r.taskId === taskId)?.postedToFacebookAt ?? null;
    setRows((prev) =>
      prev.map((r) =>
        r.taskId === taskId ? { ...r, postedToFacebookAt: posted ? new Date().toISOString() : null } : r,
      ),
    );
    try {
      const res = await fetch(`/api/fb-events/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postedToFacebook: posted }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows((prev) => prev.map((r) => (r.taskId === taskId ? { ...r, postedToFacebookAt: was } : r)));
      setErrors((e) => ({ ...e, [taskId]: "Could not save that." }));
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-sand-200 bg-white px-4 py-10 text-center text-sm text-sand-400">
        Nothing yet. The daily Planner pass picks these up.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-sand-400">
            {visible.length} {filter === "todo" ? "to do" : "in all"}
          </span>
          <button
            onClick={() => setFilter(filter === "todo" ? "all" : "todo")}
            className="text-[11px] text-sand-400 transition-colors hover:text-sand-800"
          >
            {filter === "todo" ? "Show posted too" : `Show only the ${todo} to do`}
          </button>
        </div>

        <nav className="max-h-[70vh] overflow-y-auto rounded-2xl border border-sand-200 bg-white">
          {visible.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-sand-400">Nothing left to do.</p>
          )}
          {byCommunity.map(([community, list]) => (
            <section key={community}>
              {/* Sticky, so the building you are looking at is always named,
                  however far down the column you have scrolled. */}
              <h3 className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-sand-100 bg-white/95 px-3 py-1.5 backdrop-blur">
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-sand-500">
                  {community}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-sand-300">{list.length}</span>
              </h3>
              {list.map((r) => {
                const on = selected?.taskId === r.taskId;
                return (
                  <button
                    key={r.taskId}
                    onClick={() => setSelectedId(r.taskId)}
                    className={`flex w-full items-center gap-2.5 border-b border-sand-100 py-2 pl-3 pr-3 text-left transition-colors last:border-b-0 ${
                      on ? "bg-forest-50" : "hover:bg-sand-50"
                    }`}
                  >
                    <span
                      className={`w-11 shrink-0 text-[11px] tabular-nums ${
                        on ? "text-forest-800" : "text-sand-400"
                      }`}
                    >
                      {r.dueAt ? `${MON.format(new Date(r.dueAt))} ${DAY.format(new Date(r.dueAt))}` : "—"}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] ${
                        on ? "text-forest-900" : "text-sand-900"
                      }`}
                    >
                      {r.eventTitle ?? r.eventName}
                    </span>
                    <Dot row={r} />
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>

      {selected ? (
        <Detail
          key={selected.taskId}
          row={selected}
          busy={busy === selected.taskId}
          error={errors[selected.taskId]}
          onGenerate={() => generate(selected.taskId)}
          onPosted={(v) => setPosted(selected.taskId, v)}
        />
      ) : (
        <div className="rounded-2xl border border-sand-200 bg-white px-6 py-16 text-center text-sm text-sand-400">
          Nothing selected.
        </div>
      )}
    </div>
  );
}

/** Where this one is up to, in one dot. The row's words say the rest. */
function Dot({ row }: { row: EventRow }) {
  const [tone, title] = row.postedToFacebookAt
    ? ["bg-forest-600", "Posted"]
    : row.facebookDescription
      ? row.stale
        ? ["bg-amber-400", "Written, but the eblast changed since"]
        : ["bg-forest-300", "Written, not posted"]
      : ["bg-sand-200", "Not written yet"];
  return <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} title={title} aria-label={title} />;
}

function Detail({
  row,
  busy,
  error,
  onGenerate,
  onPosted,
}: {
  row: EventRow;
  busy: boolean;
  error?: string;
  onGenerate: () => void;
  onPosted: (v: boolean) => void;
}) {
  const written = Boolean(row.facebookDescription);

  return (
    <article className="min-w-0 rounded-2xl border border-sand-200 bg-white">
      <header className="border-b border-sand-100 px-6 py-5">
        <p className="text-[11px] text-sand-400">
          {row.community ?? "No community"}
          {row.dueAt && <> · due {FULL.format(new Date(row.dueAt))}</>}
        </p>
        <h2 className="mt-1 font-serif text-[22px] leading-tight text-sand-900">
          {row.eventTitle ?? row.eventName}
        </h2>
        {(row.eventDate || row.eventTime || row.eventLocation) && (
          <p className="mt-2 text-[12px] text-sand-500">
            {[row.eventDate, row.eventTime, row.eventLocation].filter(Boolean).join(" · ")}
          </p>
        )}
      </header>

      {!written ? (
        <div className="px-6 py-10 text-center">
          <p className="mx-auto max-w-sm text-sm text-sand-500">
            {row.matchNote && !row.facebookDescription
              ? row.matchNote
              : "Nothing written for this one yet."}
          </p>
          <button
            onClick={onGenerate}
            disabled={busy}
            className="mt-4 rounded-xl bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest-800 disabled:opacity-40"
          >
            {busy ? "Writing…" : "Write it"}
          </button>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="divide-y divide-sand-100">
          {row.stale && (
            <p className="bg-amber-50 px-6 py-2.5 text-xs text-amber-800">
              The eblast has been drafted again since this was written.
            </p>
          )}
          {row.generatedFrom === "flyer" && (
            <p className="px-6 py-2.5 text-[11px] text-sand-400">
              Written from the flyer, before the eblast was drafted.
            </p>
          )}

          <Copyable label="Event name" value={row.eventTitle ?? row.eventName} />
          <Copyable label="Facebook description" value={row.facebookDescription ?? ""} block />
          <Copyable
            label="TalkFurther description"
            value={row.furtherDescription ?? ""}
            block
            note="The prose alone — Further has its own fields for the date, time and place."
          />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-6 py-4">
            <a
              href={`/api/fb-events/${row.taskId}/cover`}
              className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs text-sand-700 transition-colors hover:border-sand-300 hover:text-sand-900"
            >
              Download cover
            </a>
            {row.facebookEventsUrl ? (
              <a
                href={row.facebookEventsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-forest-700 transition-colors hover:text-forest-800"
              >
                Open Facebook events ↗
              </a>
            ) : (
              row.communitySlug && (
                <a
                  href={`/communities/${row.communitySlug}`}
                  className="text-xs text-sand-400 transition-colors hover:text-sand-700"
                >
                  Add this community&rsquo;s Facebook page
                </a>
              )
            )}
            {row.inFurther === true && (
              <span className="text-xs text-forest-700">Already in Further</span>
            )}

            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-sand-600">
              <input
                type="checkbox"
                checked={Boolean(row.postedToFacebookAt)}
                onChange={(e) => onPosted(e.target.checked)}
                className="h-3.5 w-3.5 accent-forest-700"
              />
              Posted
            </label>
            <button
              onClick={onGenerate}
              disabled={busy}
              className="text-xs text-sand-400 transition-colors hover:text-sand-700 disabled:opacity-40"
            >
              {busy ? "Writing…" : "Rewrite"}
            </button>
          </div>
          {error && <p className="px-6 pb-4 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </article>
  );
}

/**
 * One thing to copy.
 *
 * The button is the whole label row, because every one of these exists to be
 * copied and hunting for a small word next to the text is the one motion this
 * page should not have.
 */
function Copyable({
  label,
  value,
  block,
  note,
}: {
  label: string;
  value: string;
  block?: boolean;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Refused by the browser; the text is on screen and selectable.
    }
  }

  return (
    <section className="group px-6 py-4">
      <button onClick={copy} className="mb-1.5 flex w-full items-center gap-2 text-left">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-sand-500">{label}</span>
        <span
          className={`text-[11px] transition-colors ${
            copied ? "text-forest-700" : "text-sand-300 group-hover:text-forest-700"
          }`}
        >
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
      <p
        className={`text-sand-900 ${
          block ? "max-w-[64ch] whitespace-pre-wrap text-[13.5px] leading-relaxed" : "text-sm"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1.5 text-[11px] text-sand-400">{note}</p>}
    </section>
  );
}
