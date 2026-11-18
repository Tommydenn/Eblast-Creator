"use client";

import { useMemo, useState } from "react";

export interface EventRow {
  taskId: string;
  eventName: string;
  community: string | null;
  communitySlug: string | null;
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
}

const ALL = "__all__";
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Pick an event on the left, do it on the right.
 *
 * The task is: read the words, paste them into Facebook, paste them into
 * Further, tick it off. So the right-hand side carries one button — the tick
 * — and everything else is either the words themselves or a quiet link. The
 * earlier version put five controls in a row at the foot of a column you had
 * to scroll past the words to reach, which is the opposite of that.
 *
 * The list shows one community at a time, chosen from the picker. Thirty
 * headings stacked in one column was still thirty headings.
 */
export function EventsPanel({ initialRows }: { initialRows: EventRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [showPosted, setShowPosted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Communities that have anything, with how much is still open in each. */
  const communities = useMemo(() => {
    const counts = new Map<string, { open: number; total: number }>();
    for (const r of rows) {
      const name = r.community ?? "No community";
      const c = counts.get(name) ?? { open: 0, total: 0 };
      c.total++;
      if (!r.postedToFacebookAt) c.open++;
      counts.set(name, c);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const soonest = useMemo(() => {
    const open = rows.filter((r) => !r.postedToFacebookAt && r.dueAt);
    const first = [...open].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))[0];
    return first?.community ?? communities[0]?.[0] ?? ALL;
  }, [rows, communities]);

  const [community, setCommunity] = useState<string>(soonest);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => {
    const inCommunity = rows.filter((r) => community === ALL || (r.community ?? "No community") === community);
    return inCommunity
      .filter((r) => showPosted || !r.postedToFacebookAt || r.taskId === selectedId)
      .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  }, [rows, community, showPosted, selectedId]);

  // Always something selected, and always something that is actually on the
  // list, so the two halves can never disagree about what is being worked on.
  const selected = list.find((r) => r.taskId === selectedId) ?? list[0] ?? null;
  const openHere = rows.filter(
    (r) => !r.postedToFacebookAt && (community === ALL || (r.community ?? "No community") === community),
  ).length;

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
    // Kept selected, so marking one does not throw you somewhere else — and
    // so undoing it is right there if the tick was a mis-click.
    setSelectedId(taskId);
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save that");
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.taskId === taskId ? { ...r, postedToFacebookAt: was } : r)));
      setErrors((p) => ({ ...p, [taskId]: e instanceof Error ? e.message : "Could not save that" }));
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-sand-200 bg-white px-4 py-12 text-center text-sm text-sand-400">
        Nothing yet. The daily Planner pass picks these up.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[286px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <select
          value={community}
          onChange={(e) => {
            setCommunity(e.target.value);
            setSelectedId(null);
          }}
          className="w-full cursor-pointer rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm text-sand-900 shadow-sm transition-colors hover:border-sand-300 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-600/20"
        >
          <option value={ALL}>All communities</option>
          {communities.map(([name, c]) => (
            <option key={name} value={name}>
              {name}
              {c.open > 0 ? ` · ${c.open}` : ""}
            </option>
          ))}
        </select>

        <div className="mt-3 overflow-hidden rounded-xl border border-sand-200 bg-white">
          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-sand-400">Nothing left here.</p>
          ) : (
            list.map((r) => {
              const on = selected?.taskId === r.taskId;
              const done = Boolean(r.postedToFacebookAt);
              return (
                <button
                  key={r.taskId}
                  onClick={() => setSelectedId(r.taskId)}
                  className={`flex w-full items-baseline gap-2.5 border-b border-sand-100 px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                    on ? "bg-forest-50" : "hover:bg-sand-50"
                  }`}
                >
                  <span
                    className={`w-12 shrink-0 text-[11px] tabular-nums ${
                      on ? "text-forest-700" : "text-sand-400"
                    }`}
                  >
                    {r.dueAt ? DATE.format(new Date(r.dueAt)) : "—"}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      done ? "text-sand-400 line-through" : on ? "text-forest-900" : "text-sand-800"
                    }`}
                  >
                    {r.eventTitle ?? r.eventName}
                  </span>
                  {community === ALL && (
                    <span className="hidden shrink-0 text-[10px] text-sand-300 xl:inline">
                      {(r.community ?? "").split(" ")[0]}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <button
          onClick={() => setShowPosted(!showPosted)}
          className="mt-2 px-1 text-[11px] text-sand-400 transition-colors hover:text-sand-700"
        >
          {showPosted ? `Hide posted · ${openHere} open` : "Show posted too"}
        </button>
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
        <div className="rounded-2xl border border-sand-200 bg-white px-6 py-20 text-center text-sm text-sand-400">
          Nothing selected.
        </div>
      )}
    </div>
  );
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
  const posted = Boolean(row.postedToFacebookAt);

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-sand-200 bg-white">
      {/* The one button lives up here, where it is reachable without first
          scrolling past everything it refers to. */}
      <header className="flex items-start justify-between gap-6 border-b border-sand-100 px-7 py-5">
        <div className="min-w-0">
          <p className="text-[11px] text-sand-400">
            {row.community ?? "No community"}
            {row.dueAt && <> · due {LONG.format(new Date(row.dueAt))}</>}
          </p>
          <h2 className="mt-1 truncate font-serif text-[21px] leading-tight text-sand-900">
            {row.eventTitle ?? row.eventName}
          </h2>
        </div>

        {written &&
          (posted ? (
            <span className="flex shrink-0 items-baseline gap-2 text-xs text-sand-400">
              Posted
              <button
                onClick={() => onPosted(false)}
                className="text-sand-400 underline underline-offset-2 transition-colors hover:text-sand-800"
              >
                undo
              </button>
            </span>
          ) : (
            <button
              onClick={() => onPosted(true)}
              className="shrink-0 rounded-xl bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
            >
              Mark posted
            </button>
          ))}
      </header>

      {!written ? (
        <div className="px-7 py-16 text-center">
          <p className="mx-auto max-w-sm text-sm text-sand-500">
            {row.matchNote ?? "Nothing written for this one yet."}
          </p>
          <button
            onClick={onGenerate}
            disabled={busy}
            className="mt-5 rounded-xl bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest-800 disabled:opacity-40"
          >
            {busy ? "Writing…" : "Write it"}
          </button>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <>
          {/* Everything that is not the one button: quiet, in one line, above
              the words rather than buried under them. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-sand-100 bg-sand-50/50 px-7 py-2.5 text-xs">
            {row.facebookEventsUrl ? (
              <a
                href={row.facebookEventsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-forest-700 transition-colors hover:text-forest-900"
              >
                Facebook events ↗
              </a>
            ) : (
              row.communitySlug && (
                <a
                  href={`/communities/${row.communitySlug}`}
                  className="text-sand-400 transition-colors hover:text-sand-700"
                >
                  Add the Facebook page
                </a>
              )
            )}
            <a
              href={`/api/fb-events/${row.taskId}/cover`}
              className="text-sand-500 transition-colors hover:text-sand-900"
            >
              Cover photo
            </a>
            <button
              onClick={onGenerate}
              disabled={busy}
              className="text-sand-400 transition-colors hover:text-sand-700 disabled:opacity-40"
            >
              {busy ? "Writing…" : "Rewrite"}
            </button>
            {row.inFurther === true && <span className="ml-auto text-sand-400">Already in Further</span>}
          </div>

          {row.stale && (
            <p className="bg-amber-50 px-7 py-2 text-xs text-amber-800">
              The eblast has been drafted again since this was written.
            </p>
          )}
          {error && <p className="bg-red-50 px-7 py-2 text-xs text-red-700">{error}</p>}

          <div className="px-7 py-6">
            {(row.eventDate || row.eventTime || row.eventLocation) && (
              <p className="mb-6 text-[12px] text-sand-500">
                {[row.eventDate, row.eventTime, row.eventLocation].filter(Boolean).join(" · ")}
              </p>
            )}
            <Copyable label="Event name" value={row.eventTitle ?? row.eventName} />
            <Copyable label="Facebook description" value={row.facebookDescription ?? ""} block />
            <Copyable
              label="TalkFurther description"
              value={row.furtherDescription ?? ""}
              block
              last
              note="Further has its own fields for the date, time and place."
            />
          </div>
        </>
      )}
    </article>
  );
}

/**
 * One thing to copy.
 *
 * The whole block is the button. Every one of these exists to be copied, so
 * hunting for a small word beside the text is a motion this page should not
 * have — and the text being clickable is the shortest possible way to say so.
 */
function Copyable({
  label,
  value,
  block,
  note,
  last,
}: {
  label: string;
  value: string;
  block?: boolean;
  note?: string;
  last?: boolean;
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
    <section className={last ? "" : "mb-7"}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-sand-400">{label}</span>
        <span className={`text-[10px] ${copied ? "text-forest-700" : "text-transparent"}`}>Copied</span>
      </div>
      <button
        onClick={copy}
        className="group block w-full rounded-lg text-left transition-colors hover:bg-sand-50"
        title="Click to copy"
      >
        <span
          className={`block rounded-lg border border-transparent px-3 py-2 text-sand-900 transition-colors group-hover:border-sand-200 ${
            block ? "max-w-[66ch] whitespace-pre-wrap text-[13.5px] leading-relaxed" : "text-sm"
          }`}
        >
          {value}
        </span>
      </button>
      {note && <p className="mt-1.5 px-3 text-[11px] text-sand-400">{note}</p>}
    </section>
  );
}
