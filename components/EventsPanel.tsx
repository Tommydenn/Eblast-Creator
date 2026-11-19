"use client";

import { useEffect, useMemo, useState } from "react";

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
  /** Planner called it "FB & Website Event": the website wants this one too. */
  wantsWebsitePost: boolean;
  /** Whether there is a draft or a flyer behind this, so photos are possible. */
  hasSource: boolean;
}

const ALL = "__all__";
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

const FURTHER_URL =
  "https://dashboard.talkfurther.com/advanced/community-events/list-of-events/active-events";

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
type Shelf = "todo" | "done";

export function EventsPanel({ initialRows }: { initialRows: EventRow[] }) {
  const [rows, setRows] = useState(initialRows);
  /**
   * Two shelves, not a filter.
   *
   * Marking one posted has to take it off the list of things to do without
   * it vanishing — so it moves to Done, which is a place you can go back to,
   * rather than disappearing behind a toggle you have to remember exists.
   */
  const [shelf, setShelf] = useState<Shelf>("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

/**
   * Communities in the order their next deadline falls.
   *
   * Alphabetical put Amira at the top every day regardless of whether
   * anything there was due, which is a list that never tells you anything.
   * The one with work due soonest is the one to open first.
   */
  const communities = useMemo(() => {
    const byName = new Map<string, { open: number; next: string }>();
    for (const r of rows) {
      const name = r.community ?? "No community";
      const entry = byName.get(name) ?? { open: 0, next: "￿" };
      if (!r.postedToFacebookAt) {
        entry.open++;
        if (r.dueAt && r.dueAt < entry.next) entry.next = r.dueAt;
      }
      byName.set(name, entry);
    }
    return [...byName.entries()].sort(
      ([aName, a], [bName, b]) => a.next.localeCompare(b.next) || aName.localeCompare(bName),
    );
  }, [rows]);

  const firstCommunity = useMemo(() => communities[0]?.[0] ?? ALL, [communities]);

  const [community, setCommunity] = useState<string>(firstCommunity);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      rows
        .filter((r) => community === ALL || (r.community ?? "No community") === community)
        .filter((r) => (shelf === "done" ? r.postedToFacebookAt : !r.postedToFacebookAt))
        .sort((a, b) =>
          shelf === "done"
            ? (b.postedToFacebookAt ?? "").localeCompare(a.postedToFacebookAt ?? "")
            : (a.dueAt ?? "").localeCompare(b.dueAt ?? ""),
        ),
    [rows, community, shelf],
  );

  const counts = useMemo(() => {
    const here = rows.filter((r) => community === ALL || (r.community ?? "No community") === community);
    return {
      todo: here.filter((r) => !r.postedToFacebookAt).length,
      done: here.filter((r) => r.postedToFacebookAt).length,
    };
  }, [rows, community]);

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
    // Follow it onto the shelf it just moved to, so the thing you acted on
    // is still the thing in front of you.
    setShelf(posted ? "done" : "todo");
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
          {communities.map(([name, c]) => (
            <option key={name} value={name}>
              {name}
              {c.open > 0 ? ` · ${c.open} due ${SHORT.format(new Date(c.next))}` : ""}
            </option>
          ))}
        </select>

        <div className="mt-3 flex gap-1 rounded-xl bg-sand-100/80 p-1">
          {(
            [
              ["todo", "To post", counts.todo],
              ["done", "Done", counts.done],
            ] as Array<[Shelf, string, number]>
          ).map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => {
                setShelf(key);
                setSelectedId(null);
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                shelf === key ? "bg-white text-sand-900 shadow-sm" : "text-sand-500 hover:text-sand-800"
              }`}
            >
              {label}
              <span className={`ml-1.5 tabular-nums ${shelf === key ? "text-sand-400" : "text-sand-300"}`}>
                {n}
              </span>
            </button>
          ))}
        </div>

        {/* Separate rows on the page rather than one boxed-in list: each
            gets its own quiet surface and a little air around it, which is
            all that was missing before — they were running together because
            nothing told one from the next, not because they needed a frame. */}
        <ul className="mt-3 space-y-1.5">
          {list.length === 0 && (
            <li className="rounded-xl border border-dashed border-sand-200 px-4 py-10 text-center text-[12px] text-sand-400">
              {shelf === "done" ? "Nothing marked done here yet." : "Nothing left to post here."}
            </li>
          )}
          {list.map((r) => {
            const on = selected?.taskId === r.taskId;
            const done = Boolean(r.postedToFacebookAt);
            return (
              <li key={r.taskId}>
                <button
                  onClick={() => setSelectedId(r.taskId)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    on
                      ? "border-forest-700 bg-forest-700 shadow-sm"
                      : "border-sand-200/70 bg-white/70 hover:border-sand-300 hover:bg-white"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[13px] ${
                        on ? "text-white" : done ? "text-sand-400 line-through" : "text-sand-800"
                      }`}
                    >
                      {r.eventTitle ?? r.eventName}
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-[11px] ${
                        on ? "text-white/70" : "text-sand-400"
                      }`}
                    >
                      {community === ALL && r.community ? `${r.community} · ` : ""}
                      {r.dueAt ? `Due ${DATE.format(new Date(r.dueAt))}` : "No date"}
                    </span>
                  </span>
                  {done && !on && <Check className="h-3 w-3 shrink-0 text-sand-300" />}
                </button>
              </li>
            );
          })}
        </ul>

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
          <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-sand-500">
            <span>
              {row.community ?? "No community"}
              {row.dueAt && <> · due {LONG.format(new Date(row.dueAt))}</>}
            </span>
            {/* Planner's own distinction, carried through: this one also
                wants a post on the community's website. */}
            {row.wantsWebsitePost && (
              <span className="rounded-full bg-clay-100 px-2 py-0.5 text-[10.5px] font-medium text-clay-700">
                Website too
              </span>
            )}
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
            <Photos taskId={row.taskId} hasSource={row.hasSource} />
            <Flyer taskId={row.taskId} hasSource={row.hasSource} />
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

interface PhotoChoice {
  index: number;
  width: number;
  height: number;
  source: string;
  preview: string;
}

/**
 * The photos from the flyer, to pick from.
 *
 * One is chosen automatically — the eblast's hero, or the largest the flyer
 * has — but it is only a default. Which photo reads best as an event cover
 * is a judgement, so the rest are here, and none of them is cropped: both
 * platforms crop on upload and show you what they are doing while you do it.
 *
 * Loaded when asked for rather than with the page, because gathering them
 * means reading a PDF and most events are posted without ever looking past
 * the first one.
 */
function Photos({ taskId, hasSource }: { taskId: string; hasSource: boolean }) {
  const [photos, setPhotos] = useState<PhotoChoice[] | null>(null);
  const [chosen, setChosen] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Fetched as the event opens rather than on a click. They are a database
  // read now — gathered when the copy was written — so this is quick, and
  // asking first for something you always want is a click for nothing.
  useEffect(() => {
    let live = true;
    if (!hasSource) return;
    setPhotos(null);
    setChosen(0);
    setError(null);
    fetch(`/api/fb-events/${taskId}/photos`)
      .then((res) => res.json())
      .then((json) => {
        if (!live) return;
        if (!json.ok) throw new Error(json.error ?? "Could not read the photos");
        setPhotos(json.photos ?? []);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not read the photos"));
    return () => {
      live = false;
    };
  }, [taskId, hasSource]);

  if (!hasSource) {
    return (
      <div className="rounded-xl border border-dashed border-sand-200 px-5 py-6 text-[12px] text-sand-400">
        No flyer behind this one yet, so there are no photos.
      </div>
    );
  }

  if (!photos) {
    return (
      <div className="rounded-xl border border-sand-200 bg-white px-5 py-6 text-[12px] text-sand-400 shadow-sm">
        {error ?? "Loading the photos…"}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sand-200 px-5 py-6 text-[12px] text-sand-400">
        The flyer has no photo big enough to use.
      </div>
    );
  }

  const current = photos[chosen] ?? photos[0];

  return (
    <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sand-400">
          Photo
          {photos.length > 1 && (
            <span className="ml-2 font-normal tracking-normal text-sand-300">
              {chosen + 1} of {photos.length}
            </span>
          )}
        </span>
        <a
          href={`/api/fb-events/${taskId}/photos/${current.index}?download=1`}
          className="text-[11px] text-forest-700 transition-colors hover:text-forest-900"
        >
          Download
        </a>
      </div>

      <div className="border-t border-sand-100 bg-sand-50/60 p-4">
        {/* The stored preview, so it is there the moment the panel is. The
            full-size original is what Download hands over. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.preview}
          alt=""
          className="mx-auto block max-h-[320px] w-auto max-w-full rounded-lg"
        />
        <p className="mt-2 text-center text-[11px] text-sand-400">
          {current.width} × {current.height}, uncropped
        </p>
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-t border-sand-100 px-4 py-3">
          {photos.map((p, i) => (
            <button
              key={p.index}
              onClick={() => setChosen(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                i === chosen ? "border-forest-700" : "border-transparent hover:border-sand-300"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The flyer itself.
 *
 * The same thing the eblast editor shows beside the preview, for the same
 * reason: checking a detail against its source should not mean going back to
 * Planner to find the original. Folded away by default, because most of the
 * time the copy is right and the page is about the copy.
 */
function Flyer({ taskId, hasSource }: { taskId: string; hasSource: boolean }) {
  const [open, setOpen] = useState(true);
  if (!hasSource) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sand-400 transition-colors hover:text-sand-700"
        >
          <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          Flyer
        </button>
        <a
          href={`/api/fb-events/${taskId}/flyer`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-forest-700 transition-colors hover:text-forest-900"
        >
          Open in a tab ↗
        </a>
      </div>
      {open && (
        <div className="border-t border-sand-100 bg-sand-100">
          {/* The browser's own viewer with its toolbar off, as the editor
              does it: that toolbar is wider than this column and makes the
              page scroll sideways when it does not fit. */}
          <iframe
            src={`/api/fb-events/${taskId}/flyer#toolbar=0&view=FitH`}
            title="The flyer this event was written from"
            className="block h-[560px] w-full border-0"
          />
        </div>
      )}
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
