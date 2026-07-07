"use client";

import React, { useState } from "react";

interface RecentSend {
  hubspotEmailId: string;
  subject: string | null;
  sentAt: string | null;
  recipientCount: number | null;
  openCount: number | null;
  clickCount: number | null;
  fromName: string | null;
}

export function RecentSendsPanel({ sends }: { sends: RecentSend[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-sand-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 pt-5 pb-4 border-b border-sand-100 flex items-center justify-between hover:bg-sand-50/40 transition-colors text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-sand-900">Recent sends</h2>
          <p className="mt-0.5 text-xs text-sand-500">
            What the drafter and critic reference to match voice, format, and send cadence.
            {sends.length > 0 && (
              <> · <span className="font-medium">{sends.length} send{sends.length === 1 ? "" : "s"}</span> on record</>
            )}
          </p>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`ml-4 shrink-0 text-sand-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-6 py-5">
          {sends.length === 0 ? (
            <div className="rounded-xl bg-sand-50 px-4 py-10 text-center">
              <p className="text-sm text-sand-400">
                No past sends. Once this community sends its first eblast, the agents will use it as a reference.
              </p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-sand-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-100 bg-sand-50/60 text-[11px] font-semibold uppercase tracking-widest text-sand-400">
                    <th className="py-2.5 pr-3 text-left pl-4">Subject</th>
                    <th className="py-2.5 px-2 text-left">Sent</th>
                    <th className="py-2.5 px-2 text-left">From</th>
                    <th className="py-2.5 px-2 text-right">Recipients</th>
                    <th className="py-2.5 px-2 text-right">Open</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Click</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {sends.map((s) => {
                    const openPct =
                      s.openCount !== null && s.recipientCount && s.recipientCount > 0
                        ? Math.round((s.openCount / s.recipientCount) * 1000) / 10
                        : null;
                    const clickPct =
                      s.clickCount !== null && s.recipientCount && s.recipientCount > 0
                        ? Math.round((s.clickCount / s.recipientCount) * 1000) / 10
                        : null;
                    return (
                      <tr key={s.hubspotEmailId} className="hover:bg-sand-50/60 transition-colors duration-100">
                        <td className="py-2.5 pr-3 pl-4">
                          <p className="text-sand-900">{s.subject ?? "(no subject)"}</p>
                        </td>
                        <td className="py-2.5 px-2 text-xs text-sand-500 tabular-nums">{s.sentAt ?? "—"}</td>
                        <td className="py-2.5 px-2 text-xs text-sand-600">{s.fromName ?? "—"}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-sand-700">
                          {s.recipientCount?.toLocaleString() ?? "—"}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {openPct !== null ? (
                            <span className={openPct >= 40 ? "text-forest-700 font-medium" : openPct >= 25 ? "text-sand-800" : "text-clay-700"}>
                              {openPct}%
                            </span>
                          ) : (
                            <span className="text-sand-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-right tabular-nums text-sand-700">
                          {clickPct !== null ? `${clickPct}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
