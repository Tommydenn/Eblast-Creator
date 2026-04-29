// Community list — control center home for the registry.

import Link from "next/link";
import { eq, sql, and } from "drizzle-orm";
import { listCommunities } from "@/data/communities";
import { db } from "@/lib/db";
import { pastSends } from "@/lib/db/schema";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

interface CommunityStats {
  sendCount: number;
  avgOpenPct: number | null;
  lastSentAt: string | null;
}

async function loadStats(): Promise<Map<string, CommunityStats>> {
  // One query: per-community published-send aggregates.
  const rows = await db
    .select({
      communityId: pastSends.communityId,
      sendCount: sql<number>`COUNT(*)::int`,
      avgOpenPct: sql<string | null>`ROUND(AVG((${pastSends.openCount}::numeric / NULLIF(${pastSends.recipientCount}, 0)) * 100)::numeric, 1)`,
      lastSentAt: sql<string | null>`MAX(${pastSends.publishedAt})::text`,
    })
    .from(pastSends)
    .where(and(eq(pastSends.state, "PUBLISHED"), sql`${pastSends.recipientCount} > 0`))
    .groupBy(pastSends.communityId);

  const map = new Map<string, CommunityStats>();
  for (const r of rows) {
    if (!r.communityId) continue;
    map.set(r.communityId, {
      sendCount: r.sendCount,
      avgOpenPct: r.avgOpenPct ? Number(r.avgOpenPct) : null,
      lastSentAt: r.lastSentAt,
    });
  }
  return map;
}

export default async function CommunitiesPage() {
  const [communities, statsByCommunity] = await Promise.all([listCommunities(), loadStats()]);

  // Group by brand family for visual scanning.
  const grouped = new Map<string, typeof communities>();
  for (const c of communities) {
    const fam = c.brandFamily ?? c.shortName;
    grouped.set(fam, [...(grouped.get(fam) ?? []), c]);
  }

  // Health roll-up so the user can see what needs filling at a glance.
  const totalCommunities = communities.length;
  const withTrackingPhone = communities.filter((c) => c.trackingPhone).length;
  const withBrandGuide = communities.filter((c) => c.brandGuideExtracted).length;
  const withSenders = communities.filter((c) => c.senders.length > 0).length;
  const withListId = communities.filter((c) => c.hubspot.listId).length;
  const withRecentSends = communities.filter((c) => statsByCommunity.has(c.id)).length;

  return (
    <>
      <Header active="communities" />
      <main className="mx-auto max-w-[1240px] px-6 pb-24 pt-10">
        <div className="mb-8 max-w-3xl">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-clay-600">Control center</p>
          <h1 className="mt-1 font-serif text-[40px] leading-tight text-sand-900">Communities</h1>
          <p className="mt-3 text-sm leading-relaxed text-sand-600">
            {totalCommunities} communities under Great Lakes Management. Click any row to open its brand guide,
            senders, tracking phone, send history, and brand voice.
          </p>
        </div>

        {/* Health summary */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <HealthStat label="Active sending" value={`${withRecentSends} / ${totalCommunities}`} pct={withRecentSends / totalCommunities} />
          <HealthStat label="Tracking phone" value={`${withTrackingPhone} / ${totalCommunities}`} pct={withTrackingPhone / totalCommunities} />
          <HealthStat label="Brand guide" value={`${withBrandGuide} / ${totalCommunities}`} pct={withBrandGuide / totalCommunities} />
          <HealthStat label="Senders" value={`${withSenders} / ${totalCommunities}`} pct={withSenders / totalCommunities} />
          <HealthStat label="HubSpot list ID" value={`${withListId} / ${totalCommunities}`} pct={withListId / totalCommunities} />
        </div>

        {/* Brand-family-grouped list */}
        <div className="space-y-8">
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([family, list]) => (
              <section key={family}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-serif text-base font-medium text-sand-700">
                    {family}
                    <span className="ml-2 text-[11px] font-normal text-sand-500">
                      {list.length} location{list.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                </div>
                <Card className="overflow-hidden p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sand-200 bg-sand-50/60 text-[10.5px] font-medium uppercase tracking-[0.12em] text-sand-500">
                        <th className="px-5 py-3 text-left font-medium">Community</th>
                        <th className="px-3 py-3 text-left font-medium">Sender</th>
                        <th className="px-3 py-3 text-left font-medium">Tracking #</th>
                        <th className="px-3 py-3 text-right font-medium">Sends · 365d</th>
                        <th className="px-3 py-3 text-right font-medium">Avg open</th>
                        <th className="px-3 py-3 text-left font-medium">Last sent</th>
                        <th className="px-5 py-3 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sand-100">
                      {list.map((c) => {
                        const stats = statsByCommunity.get(c.id);
                        const lastSent = stats?.lastSentAt ? new Date(stats.lastSentAt) : null;
                        const openPct = stats?.avgOpenPct ?? null;
                        return (
                          <tr key={c.slug} className="group hover:bg-sand-50/60">
                            <td className="px-5 py-3">
                              <Link href={`/communities/${c.slug}`} className="block">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="h-7 w-1 rounded-sm"
                                    style={{ backgroundColor: c.brand.primary }}
                                    aria-hidden
                                  />
                                  <div className="min-w-0">
                                    <div className="font-medium text-sand-900 group-hover:text-forest-700 transition-colors">
                                      {c.displayName}
                                    </div>
                                    <div className="text-[11px] text-sand-500">
                                      {c.address.city ? `${c.address.city}, ${c.address.state ?? ""}` : "—"}
                                      {c.careTypes && c.careTypes.length > 0 && (
                                        <span className="ml-1.5">· {c.careTypes.join(" · ")}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            </td>
                            <td className="px-3 py-3">
                              {c.senders[0] ? (
                                <div>
                                  <div className="text-sm text-sand-900">{c.senders[0].name}</div>
                                  {c.senders.length > 1 && (
                                    <div className="text-[11px] text-sand-500">
                                      + {c.senders.length - 1} other{c.senders.length === 2 ? "" : "s"}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-clay-600">none</span>
                              )}
                            </td>
                            <td className="px-3 py-3 tabular-nums text-sand-800">
                              {c.trackingPhone ?? <span className="text-xs text-clay-600">—</span>}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-sand-800">
                              {stats?.sendCount ?? <span className="text-sand-400">0</span>}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {openPct !== null ? (
                                <span
                                  className={
                                    openPct >= 40
                                      ? "text-forest-700 font-medium"
                                      : openPct >= 25
                                      ? "text-sand-800"
                                      : "text-clay-700"
                                  }
                                >
                                  {openPct}%
                                </span>
                              ) : (
                                <span className="text-sand-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-[11px] text-sand-500">
                              {lastSent ? lastSent.toISOString().slice(0, 10) : "—"}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-wrap gap-1">
                                {c.brandGuideExtracted ? (
                                  <Badge variant="success" title="Brand guide extracted">
                                    Brand
                                  </Badge>
                                ) : null}
                                {c.trackingPhone ? null : (
                                  <Badge variant="warning" title="No tracking phone">
                                    Phone
                                  </Badge>
                                )}
                                {c.hubspot.listId ? null : (
                                  <Badge variant="warning" title="No HubSpot list ID">
                                    List
                                  </Badge>
                                )}
                                {c.senders.length === 0 && (
                                  <Badge variant="danger" title="No senders configured">
                                    Sender
                                  </Badge>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              </section>
            ))}
        </div>
      </main>
    </>
  );
}

function HealthStat({ label, value, pct }: { label: string; value: string; pct: number }) {
  const color = pct >= 0.85 ? "bg-forest-500" : pct >= 0.5 ? "bg-amber-500" : "bg-clay-500";
  return (
    <Card className="px-4 py-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-sand-500">{label}</p>
      <p className="mt-1 font-serif text-xl text-sand-900 tabular-nums">{value}</p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand-100">
        <div className={`h-full ${color}`} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
    </Card>
  );
}
