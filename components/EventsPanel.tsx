"use client";

import { useState } from "react";

export interface EventRow {
  taskId: string;
  eventName: string;
  community: string | null;
  dueAt: string | null;
  hasDraft: boolean;
  matchNote: string | null;
  eventTitle: string | null;
  facebookDescription: string | null;
  furtherDescription: string | null;
  generatedAt: string | null;
  /** The eblast was re-drafted after this was written. */
  stale: boolean;
  postedToFacebookAt: string | null;
  furtherEventUuid: string | null;
  /** Whether Further already holds an event of this name. Null if we could not ask. */
  inFurther: boolean | null;
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One list, grouped by the month the event is due.
 *
 * Open a row and it shows exactly what has to go into Facebook, field by
 * field, each on its own copy button — because the thing being done here is
 * copying, and a wall of text with one button means picking the title back
 * out of it by hand every time.
 */
export function EventsPanel({ initialRows }: { initialRows: EventRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  async function generate(taskId: string) {
    setBusy(taskId);
    setError((e) => ({ ...e, [taskId]: "" }));
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
                stale: false,
              }
            : r,
        ),
      );
      setOpen(taskId);
    } catch (e) {
      setError((prev) => ({ ...prev, [taskId]: e instanceof Error ? e.message : "Could not write it" }));
    } finally {
      setBusy(null);
    }
  }

  async function setPosted(taskId: string, posted: boolean) {
    // Shown at once and corrected if the save fails: the tick is a note to
    // the person who just did the work, not something anything depends on.
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
      setError((e) => ({ ...e, [taskId]: "Could not save that." }));
    }
  }

  const groups = new Map<string, EventRow[]>();
  for (const r of rows) {
    const key = r.dueAt ? MONTH.format(new Date(r.dueAt)) : "No date";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-sand-200 bg-white px-4 py-8 text-center text-sm text-sand-400">
        Nothing yet. The daily Planner pass picks these up.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([month, list]) => (
        <section key={month}>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-sand-600">{month}</h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 bg-white">
            {list.map((r) => (
              <div key={r.taskId} className="border-b border-sand-100 last:border-b-0">
                <button
                  onClick={() => setOpen(open === r.taskId ? null : r.taskId)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-sand-50"
                >
                  <span className="w-14 shrink-0 text-[11px] tabular-nums text-sand-400">
                    {r.dueAt ? DAY.format(new Date(r.dueAt)) : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-sand-900">{r.eventTitle ?? r.eventName}</span>
                    <span className="block truncate text-[11px] text-sand-400">
                      {r.community ?? "Community not matched"}
                    </span>
                  </span>
                  <Status row={r} />
                </button>

                {open === r.taskId && (
                  <div className="space-y-3 border-t border-sand-100 bg-sand-50/60 px-4 py-4">
                    {!r.hasDraft ? (
                      <p className="text-xs text-sand-500">
                        {r.matchNote ?? "No eblast draft for this event yet."} The words and the photo come
                        from the eblast, so there is nothing to build until that exists.
                      </p>
                    ) : !r.facebookDescription ? (
                      <div>
                        <button
                          onClick={() => generate(r.taskId)}
                          disabled={busy === r.taskId}
                          className="rounded-lg bg-forest-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-forest-800 disabled:opacity-40"
                        >
                          {busy === r.taskId ? "Writing…" : "Write the event"}
                        </button>
                        {error[r.taskId] && <p className="mt-2 text-xs text-red-600">{error[r.taskId]}</p>}
                      </div>
                    ) : (
                      <>
                        {r.stale && (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            The eblast has been drafted again since this was written.
                          </p>
                        )}
                        <Field label="Event name" value={r.eventTitle ?? r.eventName} />
                        <Field label="Facebook description" value={r.facebookDescription} multiline />
                        <Field
                          label="Further description"
                          value={r.furtherDescription ?? ""}
                          multiline
                          note="Without the call-to-RSVP close, since Further collects the RSVP itself."
                        />
                        <div className="flex flex-wrap items-center gap-3 pt-0.5">
                          <a
                            href={`/api/fb-events/${r.taskId}/cover`}
                            className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs text-sand-700 transition-colors hover:text-sand-900"
                          >
                            Download cover (1.91:1)
                          </a>
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-sand-600">
                            <input
                              type="checkbox"
                              checked={Boolean(r.postedToFacebookAt)}
                              onChange={(e) => setPosted(r.taskId, e.target.checked)}
                              className="h-3.5 w-3.5 accent-forest-700"
                            />
                            Posted to Facebook
                          </label>
                          {r.inFurther === true && (
                            <span className="text-xs text-forest-700">Already in Further</span>
                          )}
                          <button
                            onClick={() => generate(r.taskId)}
                            disabled={busy === r.taskId}
                            className="text-xs text-sand-400 transition-colors hover:text-sand-700 disabled:opacity-40"
                          >
                            {busy === r.taskId ? "Writing…" : "Write it again"}
                          </button>
                          {error[r.taskId] && <span className="text-xs text-red-600">{error[r.taskId]}</span>}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Status({ row }: { row: EventRow }) {
  const [label, tone] = !row.hasDraft
    ? ["Waiting on the eblast", "text-sand-400"]
    : row.postedToFacebookAt
      ? ["Posted", "text-forest-700"]
      : row.facebookDescription
        ? [row.stale ? "Needs rewriting" : "Ready to copy", row.stale ? "text-amber-700" : "text-forest-700"]
        : ["Not written", "text-sand-400"];
  return <span className={`shrink-0 text-[11px] ${tone}`}>{label}</span>;
}

function Field({
  label,
  value,
  multiline,
  note,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard refused — the text is on screen and selectable either way.
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-sand-500">{label}</span>
        <button
          onClick={copy}
          className="text-[11px] text-sand-400 transition-colors hover:text-forest-700"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p
        className={`whitespace-pre-wrap rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 ${
          multiline ? "" : "truncate"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] text-sand-400">{note}</p>}
    </div>
  );
}
