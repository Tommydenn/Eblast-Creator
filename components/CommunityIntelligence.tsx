"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, SectionLabel } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Stat } from "./ui/Stat";

interface PastSend {
  subject: string;
  sentAt: string | null;
  recipientCount: number | null;
  openCount: number | null;
  openRatePct: number | null;
  clickRatePct: number | null;
  fromName: string | null;
}

interface IntelligenceResponse {
  ok: boolean;
  community?: {
    slug: string;
    displayName: string;
    trackingPhone: string | null;
    senders: Array<{ name: string; email: string; isPrimary: boolean }>;
  };
  summary?: {
    sendCount: number;
    avgOpenPct: number | null;
    avgClickPct: number | null;
    avgRecipients: number | null;
    lastSentAt: string | null;
  };
  recentSends?: PastSend[];
}

/**
 * The "this is what the agents see" panel. Shown next to the inputs card
 * once the user has picked a community, so the user knows the drafter and
 * critic aren't blind.
 */
export function CommunityIntelligence({ communitySlug }: { communitySlug: string }) {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!communitySlug) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/community-intelligence?slug=${encodeURIComponent(communitySlug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ ok: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [communitySlug]);

  if (!communitySlug) return null;

  return (
    <Card className="eb-rise">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Agent intelligence</CardTitle>
          <CardDescription>
            What the drafter and critic will read when they generate this eblast.
          </CardDescription>
        </div>
        <Badge variant={data?.summary && data.summary.sendCount > 0 ? "success" : "warning"}>
          {loading ? "Loading…" : data?.summary?.sendCount ? `${data.summary.sendCount} past sends` : "No history"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading && <div className="h-20 rounded bg-sand-100 eb-shimmer" />}

        {!loading && data?.summary && data.summary.sendCount > 0 && (
          <div className="grid grid-cols-3 divide-x divide-sand-200 rounded-md border border-sand-200 bg-sand-50/50">
            <div className="px-4 py-3">
              <Stat label="Avg open" value={data.summary.avgOpenPct !== null ? `${data.summary.avgOpenPct}%` : "—"} />
            </div>
            <div className="px-4 py-3">
              <Stat label="Avg click" value={data.summary.avgClickPct !== null ? `${data.summary.avgClickPct}%` : "—"} />
            </div>
            <div className="px-4 py-3">
              <Stat
                label="Avg list"
                value={data.summary.avgRecipients !== null ? data.summary.avgRecipients.toLocaleString() : "—"}
              />
            </div>
          </div>
        )}

        {!loading && data?.summary && data.summary.sendCount === 0 && (
          <div className="rounded-md border border-dashed border-sand-300 bg-sand-50/50 px-4 py-6 text-center">
            <p className="text-sm text-sand-600">
              No past sends in the last 365 days for this community.
            </p>
            <p className="mt-1 text-xs text-sand-500">
              The drafter will rely on the community's brand guide and voice rules only — no historical performance signals.
            </p>
          </div>
        )}

        {!loading && data?.recentSends && data.recentSends.length > 0 && (
          <div>
            <SectionLabel className="mb-2.5">Recent sends · the agents will reference these</SectionLabel>
            <ul className="divide-y divide-sand-100 rounded-md border border-sand-200">
              {data.recentSends.slice(0, 5).map((s, i) => (
                <li key={i} className="px-3 py-2.5 text-sm leading-snug">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sand-900" title={s.subject}>
                        {s.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-sand-500">
                        {s.sentAt ?? "no date"}
                        {s.fromName ? ` · from ${s.fromName}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
                      {s.openRatePct !== null ? (
                        <span
                          className={`text-sm font-medium ${
                            s.openRatePct >= 40
                              ? "text-forest-700"
                              : s.openRatePct >= 25
                              ? "text-sand-700"
                              : "text-clay-600"
                          }`}
                        >
                          {s.openRatePct}%
                        </span>
                      ) : (
                        <span className="text-xs text-sand-400">—</span>
                      )}
                      <span className="text-[10.5px] uppercase tracking-wider text-sand-400">open</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && data?.community && (
          <div className="grid grid-cols-2 gap-4 border-t border-sand-100 pt-4">
            <div>
              <SectionLabel className="mb-1">Tracking phone</SectionLabel>
              <p className="text-sm text-sand-900">
                {data.community.trackingPhone ?? <span className="text-clay-600">not set</span>}
              </p>
            </div>
            <div>
              <SectionLabel className="mb-1">Senders ({data.community.senders.length})</SectionLabel>
              <p className="text-sm text-sand-900">
                {data.community.senders[0]?.name ?? <span className="text-clay-600">none configured</span>}
                {data.community.senders.length > 1 && (
                  <span className="text-sand-500"> + {data.community.senders.length - 1} more</span>
                )}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
