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
  /** Already formatted the way the description carries them. */
  eventDate: string | null;
  eventTime: string | null;
  eventLocation: string | null;
  facebookDescription: string | null;
  furtherDescription: string | null;
  generatedFrom: string | null;
  stale: boolean;
  postedToFacebookAt: string | null;
  inFurther: boolean | null;
  facebookEventsUrl: string | null;
  hasCover: boolean;
}

const ALL = "__all__";
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

const FURTHER_URL = "https://app.talkfurther.com";

/**
 * Two forms, filled from one screen.
 *
 * This is not a record to be browsed. It is the sheet you work from while a
 * Facebook event form is open in one tab and Further's is open in another,
 * and the whole job is a dozen copies and two uploads. So the page is laid
 * out as those forms are: one destination at a time, its fields in the order
 * that form asks for them, each one a single click to the clipboard, and a
 * tick that stays so you can see what you have already taken.
 *
 * What that replaced was a list of everything the app happened to know about
 * an event, in the order the database happened to hold it — three blocks of
 * prose, no way to copy the date, and the actions in a row underneath.
 */
export function EventsPanel({ initialRows }: { initialRows: EventRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [showPosted, setShowPosted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const communities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const name = r.community ?? "No community";
      counts.set(name, (counts.get(name) ?? 0) + (r.postedToFacebookAt ? 0 : 1));
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const firstCommunity = useMemo(() => {
    const open = rows.filter((r) => !r.postedToFacebookAt && r.dueAt);
    const soonest = [...open].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))[0];
    return soonest?.community ?? communities[0]?.[0] ?? ALL;
  }, [rows, communities]);

  const [community, setCommunity] = useState<string>(firstCommunity);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      rows
        .filter((r) => community === ALL || (r.community ?? "No community") === community)
        // The one being worked on never leaves the list, whatever the filter
        // says — that was what made marking something posted look broken.
        .filter((r) => showPosted || !r.postedToFacebookAt || r.taskId === selectedId)
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
    [rows, community, showPosted, selectedId],
  );

  const selected = list.find((r) => r.taskId === selectedId) ?? list[0] ?? null;

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
                eventDate: json.details?.date ?? r.eventDate,
                eventTime: json.details?.time ?? r.eventTime,
                eventLocation: json.details?.location ?? r.eventLocation,
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
      <p className="rounded-2xl border border-sand-200 bg-white px-4 py-14 text-center text-[13px] text-sand-400">
        Nothing yet. The daily Planner pass picks these up.
      </p>
    );
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <select
          value={community}
          onChange={(e) => {
            setCommunity(e.target.value);
            setSelectedId(null);
          }}
          className="w-full cursor-pointer rounded-xl border border-sand-200 bg-white px-3.5 py-3 text-[13px] text-sand-900 shadow-sm transition-colors hover:border-sand-300 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-600/15"
        >
          <option value={ALL}>All communities</option>
          {communities.map(([name, open]) => (
            <option key={name} value={name}>
              {name}
              {open > 0 ? ` · ${open}` : ""}
            </option>
          ))}
        </select>

        {/* One surface with hairlines between the rows, rather than rows
            floating on the page background — which is what made one event
            hard to tell from the next. The selected one carries an edge on
            its left as well as a tint, so it is obvious at a glance which
            row the right-hand side belongs to. */}
        <ul className="mt-3 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          {list.length === 0 && (
            <li className="px-4 py-10 text-center text-[12px] text-sand-400">Nothing left here.</li>
          )}
          {list.map((r) => {
            const on = selected?.taskId === r.taskId;
            const done = Boolean(r.postedToFacebookAt);
            return (
              <li key={r.taskId} className="border-b border-sand-100 last:border-b-0">
                <button
                  onClick={() => setSelectedId(r.taskId)}
                  className={`flex w-full items-baseline gap-3 border-l-[3px] py-3 pl-3 pr-3.5 text-left transition-colors ${
                    on
                      ? "border-l-forest-700 bg-forest-50"
                      : "border-l-transparent hover:bg-sand-50"
                  }`}
                >
                  <span
                    className={`w-11 shrink-0 text-[11px] tabular-nums ${
                      on ? "text-forest-700" : "text-sand-400"
                    }`}
                  >
                    {r.dueAt ? DATE.format(new Date(r.dueAt)) : "—"}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      on
                        ? "font-medium text-forest-900"
                        : done
                          ? "text-sand-400 line-through"
                          : "text-sand-800"
                    }`}
                  >
                    {r.eventTitle ?? r.eventName}
                  </span>
                  {done && !on && <Check className="h-3 w-3 shrink-0 text-sand-300" />}
                </button>
              </li>
            );
          })}
        </ul>

        <button
          onClick={() => setShowPosted(!showPosted)}
          className="mt-3 px-3.5 text-[11px] text-sand-400 transition-colors hover:text-sand-700"
        >
          {showPosted ? "Hide the posted ones" : "Show posted too"}
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
        <div className="rounded-2xl border border-dashed border-sand-200 px-6 py-24 text-center text-[13px] text-sand-400">
          Nothing selected.
        </div>
      )}
    </div>
  );
}

type Tab = "facebook" | "further";

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
  const [tab, setTab] = useState<Tab>("facebook");
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const written = Boolean(row.facebookDescription);
  const posted = Boolean(row.postedToFacebookAt);
  const name = row.eventTitle ?? row.eventName;

  const took = (key: string) => setTaken((prev) => new Set(prev).add(key));

  return (
    <article className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 pb-6">
        <div className="min-w-0">
          <p className="text-[12px] text-sand-500">
            {row.community ?? "No community"}
            {row.dueAt && <> · due {LONG.format(new Date(row.dueAt))}</>}
          </p>
          <h2 className="mt-1.5 font-serif text-[26px] leading-tight text-sand-900">{name}</h2>
        </div>

        {written &&
          (posted ? (
            <span className="flex shrink-0 items-center gap-2.5 rounded-xl bg-forest-50 px-4 py-2.5 text-[13px] text-forest-800">
              <Check className="h-4 w-4" />
              Posted
              <button
                onClick={() => onPosted(false)}
                className="text-forest-700/60 underline underline-offset-2 transition-colors hover:text-forest-900"
              >
                undo
              </button>
            </span>
          ) : (
            <button
              onClick={() => onPosted(true)}
              className="shrink-0 rounded-xl bg-forest-700 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-forest-800"
            >
              Mark posted
            </button>
          ))}
      </header>

      {!written ? (
        <div className="rounded-2xl border border-sand-200 bg-white px-7 py-20 text-center">
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-sand-500">
            {row.matchNote ?? "Nothing written for this one yet."}
          </p>
          <button
            onClick={onGenerate}
            disabled={busy}
            className="mt-6 rounded-xl bg-forest-700 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-forest-800 disabled:opacity-40"
          >
            {busy ? "Writing…" : "Write it"}
          </button>
          {error && <p className="mt-4 text-[12px] text-red-600">{error}</p>}
        </div>
      ) : (
        <>
          {/* One destination at a time, because that is how the work is done:
              Facebook's form, then Further's. */}
          <div className="flex items-center gap-1 border-b border-sand-200">
            {(
              [
                ["facebook", "Facebook"],
                ["further", "TalkFurther"],
              ] as Array<[Tab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                  tab === key
                    ? "border-forest-700 text-forest-800"
                    : "border-transparent text-sand-400 hover:text-sand-700"
                }`}
              >
                {label}
              </button>
            ))}
            <a
              href={tab === "facebook" ? row.facebookEventsUrl ?? "#" : FURTHER_URL}
              target="_blank"
              rel="noreferrer"
              className={`ml-auto mr-1 text-[12px] transition-colors ${
                tab === "facebook" && !row.facebookEventsUrl
                  ? "pointer-events-none text-sand-300"
                  : "text-forest-700 hover:text-forest-900"
              }`}
            >
              Open {tab === "facebook" ? "Facebook" : "Further"} ↗
            </a>
          </div>

          {(row.stale || error || row.inFurther === true) && (
            <div className="mt-4 space-y-2">
              {row.stale && (
                <Notice tone="warn">The eblast has been drafted again since this was written.</Notice>
              )}
              {row.inFurther === true && tab === "further" && (
                <Notice tone="ok">Further already has an event with this name.</Notice>
              )}
              {error && <Notice tone="bad">{error}</Notice>}
            </div>
          )}

          <div className="mt-5 space-y-3">
            <Field label="Event name" value={name} taken={taken} onCopied={took} />
            {row.eventDate && (
              <Field label="Date" value={row.eventDate} taken={taken} onCopied={took} />
            )}
            {row.eventTime && (
              <Field label="Time" value={row.eventTime} taken={taken} onCopied={took} />
            )}
            {row.eventLocation && (
              <Field label="Location" value={row.eventLocation} taken={taken} onCopied={took} />
            )}
            <Field
              label="Description"
              value={(tab === "facebook" ? row.facebookDescription : row.furtherDescription) ?? ""}
              taken={taken}
              onCopied={took}
              prose
              hint={
                tab === "further"
                  ? "The prose alone — Further has its own fields for the three above."
                  : undefined
              }
            />
            <Cover taskId={row.taskId} hasCover={row.hasCover} />
          </div>

          <div className="mt-5 flex items-center justify-between text-[11px] text-sand-400">
            <span>
              {row.generatedFrom === "flyer"
                ? "Written from the flyer, before the eblast was drafted."
                : "Written from the eblast draft."}
            </span>
            <button
              onClick={onGenerate}
              disabled={busy}
              className="transition-colors hover:text-sand-700 disabled:opacity-40"
            >
              {busy ? "Writing…" : "Write it again"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

/**
 * One value, and the click that takes it.
 *
 * The whole card is the target — these exist to be copied, so the smallest
 * possible motion is the right one — and the tick stays, because a dozen of
 * these get copied into two forms and the only question that keeps coming up
 * is which ones have been done.
 */
function Field({
  label,
  value,
  prose,
  hint,
  taken,
  onCopied,
}: {
  label: string;
  value: string;
  prose?: boolean;
  hint?: string;
  taken: Set<string>;
  onCopied: (key: string) => void;
}) {
  const key = `${label}:${value}`;
  const done = taken.has(key);
  const [flash, setFlash] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      onCopied(key);
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    } catch {
      // Refused by the browser; the text is on screen and selectable.
    }
  }

  return (
    <div>
      <button
        onClick={copy}
        className={`group block w-full rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition-all ${
          flash ? "border-forest-400 ring-2 ring-forest-600/15" : "border-sand-200 hover:border-sand-300"
        }`}
      >
        <span className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sand-400">
            {label}
          </span>
          <span
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              done ? "text-forest-700" : "text-sand-300 group-hover:text-forest-700"
            }`}
          >
            {done && <Check className="h-3.5 w-3.5" />}
            {done ? "Copied" : "Copy"}
          </span>
        </span>
        <span
          className={`block text-sand-900 ${
            prose ? "whitespace-pre-wrap text-[14px] leading-[1.65]" : "text-[15px]"
          }`}
        >
          {value}
        </span>
      </button>
      {hint && <p className="mt-1.5 px-5 text-[11px] text-sand-400">{hint}</p>}
    </div>
  );
}

/** The cover, shown at the shape it will be, because a crop is worth seeing. */
function Cover({ taskId, hasCover }: { taskId: string; hasCover: boolean }) {
  const [failed, setFailed] = useState(false);

  if (!hasCover || failed) {
    return (
      <div className="rounded-xl border border-dashed border-sand-200 px-5 py-6 text-[12px] text-sand-400">
        No photo for this one — the flyer has none big enough and the eblast has no hero yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sand-400">
          Cover photo
        </span>
        <a
          href={`/api/fb-events/${taskId}/cover`}
          className="text-[11px] text-forest-700 transition-colors hover:text-forest-900"
        >
          Download
        </a>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/fb-events/${taskId}/cover?inline=1`}
        alt=""
        onError={() => setFailed(true)}
        className="block w-full border-t border-sand-100"
        style={{ aspectRatio: "1.91 / 1", objectFit: "cover" }}
      />
    </div>
  );
}

function Notice({ tone, children }: { tone: "warn" | "ok" | "bad"; children: React.ReactNode }) {
  const skin =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "ok"
        ? "border-forest-200 bg-forest-50 text-forest-800"
        : "border-red-200 bg-red-50 text-red-700";
  return <p className={`rounded-xl border px-4 py-2.5 text-[12px] ${skin}`}>{children}</p>;
}

function Check({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
