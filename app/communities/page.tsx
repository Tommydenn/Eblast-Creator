import Link from "next/link";
import { eq, sql, and } from "drizzle-orm";
import { listCommunities } from "@/data/communities";
import { db } from "@/lib/db";
import { pastSends } from "@/lib/db/schema";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

const FAMILY_COLORS: Record<string, string> = {
  "Amira Choice":                "#8b9eb5",
  "Caretta":                     "#7a9e8a",
  "Cottagewood":                 "#c4a87a",
  "Global Pointe":               "#9ab5c4",
  "Hayden Grove":                "#8fa878",
  "Orchards of Minnetonka":      "#a8c4a0",
  "Seven Hills":                 "#b59e7a",
  "The Glenn":                   "#9b8bb5",
  "The Pillars of Grand Rapids": "#b59b8b",
  "Talamore":                    "#7a9bb5",
};
const DEFAULT_BAR_COLOR = "#a0a89e";

interface CommunityStats {
  sendCount: number;
  avgOpenPct: number | null;
  lastSentAt: string | null;
}

async function loadStats(): Promise<Map<string, CommunityStats>> {
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

  const grouped = new Map<string, typeof communities>();
  for (const c of communities) {
    const fam = c.brandFamily ?? c.shortName;
    grouped.set(fam, [...(grouped.get(fam) ?? []), c]);
  }

  const total = communities.length;
  const withRecentSends = communities.filter((c) => statsByCommunity.has(c.id)).length;
  const pushReady = communities.filter(
    (c) => c.senders.length > 0 && (c.hubspot.includedListIds?.length ?? 0) > 0 && !!c.trackingPhone
  ).length;
  const withSenders = communities.filter((c) => c.senders.length > 0).length;

  return (
    <>
      <Header active="communities" />
      <main className="mx-auto max-w-[1160px] px-6 pb-24 pt-10">

        {/* Page header */}
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-clay-600">Control center</p>
            <h1 className="mt-1 font-serif text-[30px] font-bold leading-tight text-sand-900">Communities</h1>
            <p className="mt-1.5 text-sm text-sand-500">
              {total} communities · Great Lakes Management
            </p>
          </div>

          {/* Inline health summary */}
          <div className="hidden sm:flex items-stretch gap-px rounded-xl border border-sand-200 bg-sand-200 overflow-hidden shrink-0">
            <StatPill label="Active sending" value={`${withRecentSends}/${total}`} pct={withRecentSends / total} />
            <StatPill label="Push-ready" value={`${pushReady}/${total}`} pct={pushReady / total} />
            <StatPill label="Senders" value={`${withSenders}/${total}`} pct={withSenders / total} />
          </div>
        </div>

        {/* Community groups */}
        <div className="space-y-6">
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([family, list]) => (
              <section key={family}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: FAMILY_COLORS[family] ?? DEFAULT_BAR_COLOR }}
                  />
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-sand-600">
                    {family}
                  </h2>
                  <span className="text-[11px] text-sand-400">
                    {list.length === 1 ? "1 location" : `${list.length} locations`}
                  </span>
                </div>

                <div className="rounded-xl border border-sand-200 bg-white overflow-hidden">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "36%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "18%" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-sand-100 bg-sand-50/70 text-[10px] font-semibold uppercase tracking-widest text-sand-400">
                        <th className="px-5 py-2.5 text-left">Community</th>
                        <th className="px-4 py-2.5 text-left">Sender</th>
                        <th className="px-4 py-2.5 text-right">Sends</th>
                        <th className="px-4 py-2.5 text-right">Avg open</th>
                        <th className="px-5 py-2.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sand-100">
                      {list.map((c) => {
                        const stats = statsByCommunity.get(c.id);
                        const openPct = stats?.avgOpenPct ?? null;
                        const barColor = FAMILY_COLORS[family] ?? DEFAULT_BAR_COLOR;

                        const gaps: string[] = [];
                        if (c.senders.length === 0) gaps.push("No sender");
                        if (!c.trackingPhone) gaps.push("No tracking #");
                        const isReady = gaps.length === 0;

                        return (
                          <tr key={c.slug} className="group align-middle hover:bg-sand-50 transition-colors duration-100">
                            <td className="px-5 py-3">
                              <Link href={`/communities/${c.slug}`} className="block">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="h-6 w-[3px] shrink-0 rounded-full opacity-70"
                                    style={{ backgroundColor: barColor }}
                                    aria-hidden
                                  />
                                  <div className="min-w-0">
                                    <div className="font-medium text-sand-900 group-hover:text-forest-700 transition-colors truncate">
                                      {c.displayName}
                                    </div>
                                    <div className="text-[11px] text-sand-400 truncate">
                                      {c.address.city
                                        ? `${c.address.city}, ${c.address.state ?? ""}`
                                        : "—"}
                                      {c.careTypes && c.careTypes.length > 0 && (
                                        <span className="ml-1.5">· {c.careTypes.join(" · ")}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              {c.senders[0] ? (
                                <div className="min-w-0">
                                  <div className="text-sm text-sand-900 truncate">{c.senders[0].name}</div>
                                  {c.senders.length > 1 && (
                                    <div className="text-[11px] text-sand-400">+{c.senders.length - 1} more</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-sand-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-sm text-sand-700">
                              {stats?.sendCount ?? <span className="text-sand-300">0</span>}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-sm">
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
                                <span className="text-sand-300">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              {isReady ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-forest-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-forest-500 shrink-0" />
                                  Ready
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-clay-700 cursor-help"
                                  title={gaps.join(" · ")}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-clay-400 shrink-0" />
                                  {gaps.length === 1 ? gaps[0] : `${gaps.length} gaps`}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
        </div>
      </main>
    </>
  );
}

function StatPill({ label, value, pct }: { label: string; value: string; pct: number }) {
  const dotColor = pct >= 0.85 ? "bg-forest-500" : pct >= 0.5 ? "bg-amber-400" : "bg-clay-500";
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 bg-white px-5 py-3 min-w-[100px]">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-sm font-semibold tabular-nums text-sand-900">{value}</span>
      </div>
      <span className="text-[10px] text-sand-400 whitespace-nowrap">{label}</span>
    </div>
  );
}
