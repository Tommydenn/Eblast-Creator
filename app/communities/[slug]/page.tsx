// Per-community detail page — the polished "what does the agent know about
// this place" view. Server-rendered against Postgres.

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql, and } from "drizzle-orm";
import { getCommunity } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { pastSends } from "@/lib/db/schema";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, SectionLabel, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

interface RecentSend {
  hubspotEmailId: string;
  subject: string | null;
  sentAt: string | null;
  recipientCount: number | null;
  openCount: number | null;
  clickCount: number | null;
  fromName: string | null;
}

async function loadRecentSends(communityId: string, limit: number): Promise<RecentSend[]> {
  const rows = await db
    .select({
      hubspotEmailId: pastSends.hubspotEmailId,
      subject: pastSends.subject,
      publishedAt: pastSends.publishedAt,
      recipientCount: pastSends.recipientCount,
      openCount: pastSends.openCount,
      clickCount: pastSends.clickCount,
      fromName: pastSends.fromName,
    })
    .from(pastSends)
    .where(and(eq(pastSends.communityId, communityId), eq(pastSends.state, "PUBLISHED")))
    .orderBy(sql`${pastSends.publishedAt} DESC NULLS LAST`)
    .limit(limit);
  return rows.map((r) => ({
    hubspotEmailId: r.hubspotEmailId,
    subject: r.subject,
    sentAt: r.publishedAt ? r.publishedAt.toISOString().slice(0, 10) : null,
    recipientCount: r.recipientCount,
    openCount: r.openCount,
    clickCount: r.clickCount,
    fromName: r.fromName,
  }));
}

async function loadAggregates(communityId: string) {
  const rows = await db
    .select({
      sendCount: sql<number>`COUNT(*)::int`,
      avgOpenPct: sql<string | null>`ROUND(AVG((${pastSends.openCount}::numeric / NULLIF(${pastSends.recipientCount}, 0)) * 100)::numeric, 1)`,
      avgClickPct: sql<string | null>`ROUND(AVG((${pastSends.clickCount}::numeric / NULLIF(${pastSends.recipientCount}, 0)) * 100)::numeric, 2)`,
      avgRecipients: sql<string | null>`ROUND(AVG(${pastSends.recipientCount})::numeric)`,
      bestOpenPct: sql<string | null>`ROUND(MAX((${pastSends.openCount}::numeric / NULLIF(${pastSends.recipientCount}, 0)) * 100)::numeric, 1)`,
    })
    .from(pastSends)
    .where(
      and(eq(pastSends.communityId, communityId), eq(pastSends.state, "PUBLISHED"), sql`${pastSends.recipientCount} > 0`),
    );
  const r = rows[0];
  return {
    sendCount: r?.sendCount ?? 0,
    avgOpenPct: r?.avgOpenPct ? Number(r.avgOpenPct) : null,
    avgClickPct: r?.avgClickPct ? Number(r.avgClickPct) : null,
    avgRecipients: r?.avgRecipients ? Number(r.avgRecipients) : null,
    bestOpenPct: r?.bestOpenPct ? Number(r.bestOpenPct) : null,
  };
}

export default async function CommunityDetailPage({ params }: { params: { slug: string } }) {
  const community = await getCommunity(params.slug);
  if (!community) notFound();

  const [recentSends, aggregates] = await Promise.all([
    loadRecentSends(community.id, 10),
    loadAggregates(community.id),
  ]);

  const c = community;
  const hasBrand = c.brandGuideExtracted !== null && c.brandGuideExtracted !== undefined;

  return (
    <>
      <Header active="communities" />
      <main className="mx-auto max-w-[1240px] px-6 pb-24 pt-10">
        <Link
          href="/communities"
          className="inline-block text-[11px] font-medium uppercase tracking-[0.12em] text-sand-500 hover:text-sand-700"
        >
          ← All communities
        </Link>

        {/* Hero */}
        <header className="mt-3 mb-8">
          <div className="flex items-start justify-between gap-8 border-b border-sand-200 pb-6">
            <div>
              <p className="text-[10.5px] font-medium uppercase tracking-[0.16em]" style={{ color: c.brand.accent }}>
                {c.brandFamily ?? c.shortName}
                {c.careTypes && c.careTypes.length > 0 && (
                  <span className="text-sand-400"> · {c.careTypes.join(" · ")}</span>
                )}
              </p>
              <h1
                className="mt-1 font-serif text-[40px] leading-tight"
                style={{ color: c.brand.primary }}
              >
                {c.displayName}
              </h1>
              <p className="mt-2 text-sm text-sand-600">
                {[
                  c.address.street,
                  [c.address.city, c.address.state].filter(Boolean).join(", "),
                  c.address.zip,
                ]
                  .filter(Boolean)
                  .join(" · ") || (
                  <span className="text-clay-600">Address not set</span>
                )}
              </p>
            </div>

            {/* Color swatches — show real brand palette if extracted */}
            <div className="flex shrink-0 items-end gap-2">
              {[
                { color: c.brand.primary, label: "Primary" },
                { color: c.brand.accent, label: "Accent" },
                { color: c.brand.background, label: "Surface" },
                ...(c.brand.secondary ? [{ color: c.brand.secondary, label: "Secondary" }] : []),
              ].map((s) => (
                <div key={s.color} className="text-center">
                  <div
                    className="h-12 w-12 rounded border border-black/5"
                    style={{ backgroundColor: s.color }}
                    title={s.color}
                  />
                  <p className="mt-1 text-[9.5px] font-medium uppercase tracking-wider text-sand-500">{s.label}</p>
                  <p className="font-mono text-[9.5px] text-sand-400">{s.color}</p>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Performance KPIs (only if there are past sends) */}
        {aggregates.sendCount > 0 && (
          <Card className="mb-8 overflow-hidden p-0">
            <div className="grid grid-cols-2 divide-x divide-sand-200 sm:grid-cols-5">
              <Kpi label="Sends · 365d" value={aggregates.sendCount} />
              <Kpi
                label="Avg open"
                value={aggregates.avgOpenPct !== null ? `${aggregates.avgOpenPct}%` : "—"}
                color={aggregates.avgOpenPct !== null && aggregates.avgOpenPct >= 40 ? "good" : "neutral"}
              />
              <Kpi
                label="Avg click"
                value={aggregates.avgClickPct !== null ? `${aggregates.avgClickPct}%` : "—"}
              />
              <Kpi
                label="Avg list"
                value={aggregates.avgRecipients !== null ? aggregates.avgRecipients.toLocaleString() : "—"}
              />
              <Kpi
                label="Best open"
                value={aggregates.bestOpenPct !== null ? `${aggregates.bestOpenPct}%` : "—"}
                color="good"
              />
            </div>
          </Card>
        )}

        {/* Two-column layout: identity/brand left, sending/voice/history right */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Contact + identity */}
          <Card>
            <CardHeader>
              <CardTitle>Contact &amp; identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone (public)">
                  {c.phone ?? <span className="text-clay-600">not set</span>}
                </Field>
                <Field label="Tracking phone (CallRail)" highlight={!!c.trackingPhone}>
                  {c.trackingPhone ?? <span className="text-clay-600">not set</span>}
                </Field>
              </div>
              <Field label="Email">{c.email ?? <span className="text-clay-600">not set</span>}</Field>
              <Field label="Website">
                {c.websiteUrl ? (
                  <a
                    href={c.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                    style={{ color: c.brand.accent }}
                  >
                    {c.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                ) : (
                  <span className="text-clay-600">not set</span>
                )}
              </Field>
              {c.socials && Object.values(c.socials).some(Boolean) && (
                <Field label="Social">
                  <span className="flex flex-wrap gap-3 text-sm">
                    {Object.entries(c.socials)
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <a
                          key={k}
                          href={v as string}
                          target="_blank"
                          rel="noreferrer"
                          className="capitalize hover:underline"
                          style={{ color: c.brand.accent }}
                        >
                          {k}
                        </a>
                      ))}
                  </span>
                </Field>
              )}
            </CardContent>
          </Card>

          {/* Sending */}
          <Card>
            <CardHeader>
              <CardTitle>Sending</CardTitle>
              <CardDescription>Who appears in the From: field for this community.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <SectionLabel className="mb-2">From identities ({c.senders.length})</SectionLabel>
                {c.senders.length === 0 ? (
                  <p className="rounded-md border border-dashed border-clay-300 bg-clay-50/50 px-3 py-2.5 text-xs text-clay-700">
                    No senders configured. The drafter falls back to the community display name.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {c.senders.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded-md border border-sand-200 bg-sand-50/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-sand-900">{s.name}</p>
                          <p className="truncate text-xs text-sand-500">{s.email}</p>
                        </div>
                        {s.isPrimary && <Badge variant="success">Primary</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <Field label="HubSpot list ID" highlight={!!c.hubspot.listId}>
                  {c.hubspot.listId ? (
                    <code className="rounded bg-sand-100 px-1.5 py-0.5 font-mono text-xs">{c.hubspot.listId}</code>
                  ) : (
                    <span className="text-clay-600">not set</span>
                  )}
                </Field>
                <Field label="Marketing director">
                  {c.marketingDirector ? (
                    <>
                      {c.marketingDirector.name}
                      <br />
                      <span className="text-xs text-sand-500">{c.marketingDirector.email}</span>
                    </>
                  ) : (
                    <span className="text-sand-400">—</span>
                  )}
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Brand */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Brand</CardTitle>
                {hasBrand ? (
                  <Badge variant="success">Extracted from guide</Badge>
                ) : (
                  <Badge variant="warning">Placeholder</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <SectionLabel className="mb-2">Typography</SectionLabel>
                <div className="space-y-2 rounded-md border border-sand-200 bg-sand-50/40 p-3">
                  <div>
                    <p
                      className="text-2xl text-sand-900"
                      style={{ fontFamily: c.brand.fontHeadline }}
                    >
                      The quick brown fox
                    </p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-sand-500">
                      Display · {c.brand.fontHeadline}
                    </p>
                  </div>
                  <div>
                    <p className="text-base text-sand-800" style={{ fontFamily: c.brand.fontBody }}>
                      Warm, hospitality-forward copy goes here.
                    </p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-sand-500">
                      Body · {c.brand.fontBody}
                    </p>
                  </div>
                </div>
              </div>

              {c.brand.supporting && c.brand.supporting.length > 0 && (
                <div>
                  <SectionLabel className="mb-2">Supporting palette</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {c.brand.supporting.map((hex) => (
                      <div key={hex} className="flex items-center gap-1.5 rounded border border-sand-200 bg-white px-2 py-1">
                        <span className="block h-4 w-4 rounded-sm border border-black/5" style={{ backgroundColor: hex }} />
                        <span className="font-mono text-[10.5px] text-sand-600">{hex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {c.brandGuideUrl && (
                <a
                  href={c.brandGuideUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded border border-sand-200 px-3 py-1.5 text-xs font-medium text-sand-700 hover:border-sand-300 hover:bg-sand-50"
                >
                  View brand guide PDF →
                </a>
              )}
            </CardContent>
          </Card>

          {/* Voice */}
          <Card>
            <CardHeader>
              <CardTitle>Voice &amp; positioning</CardTitle>
              <CardDescription>Rules the agents read when drafting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {c.voice?.tone && c.voice.tone.length > 0 && (
                <div>
                  <SectionLabel className="mb-2">Tone</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {c.voice.tone.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {c.taglines && c.taglines.length > 0 && (
                <div>
                  <SectionLabel className="mb-2">Taglines</SectionLabel>
                  <ul className="space-y-1.5">
                    {c.taglines.map((t, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-sand-200 bg-sand-50/40 px-3 py-2 text-sm italic text-sand-800"
                      >
                        “{t}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.amenities && c.amenities.length > 0 && (
                <div>
                  <SectionLabel className="mb-2">Distinctive amenities</SectionLabel>
                  <ul className="space-y-1 text-sm text-sand-800">
                    {c.amenities.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sand-400" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.voice?.dos && c.voice.dos.length > 0 && (
                <div>
                  <SectionLabel className="mb-2">Do</SectionLabel>
                  <ul className="space-y-1 text-sm text-sand-800">
                    {c.voice.dos.map((d, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1 text-forest-600">✓</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.voice?.donts && c.voice.donts.length > 0 && (
                <div>
                  <SectionLabel className="mb-2">Don't</SectionLabel>
                  <ul className="space-y-1 text-sm text-sand-800">
                    {c.voice.donts.map((d, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1 text-clay-600">×</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!c.voice?.tone && !c.taglines?.length && !c.amenities?.length && (
                <p className="text-sm text-sand-500">
                  No structured voice rules yet. Upload the brand guide to populate this automatically.
                </p>
              )}

              {c.voiceNotes && (
                <div>
                  <SectionLabel className="mb-2">Notes</SectionLabel>
                  <p className="text-sm leading-relaxed text-sand-700">{c.voiceNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent sends — full-width */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Recent sends</CardTitle>
                <CardDescription>What the drafter and critic reference.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {recentSends.length === 0 ? (
                <p className="rounded-md border border-dashed border-sand-300 bg-sand-50/40 px-4 py-6 text-center text-sm text-sand-500">
                  No past sends in the last 365 days. Once this community sends its first eblast, the agents
                  will start using it as a reference.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand-100 text-[10.5px] font-medium uppercase tracking-[0.12em] text-sand-500">
                      <th className="py-2 pr-3 text-left">Subject</th>
                      <th className="py-2 px-2 text-left">Sent</th>
                      <th className="py-2 px-2 text-left">From</th>
                      <th className="py-2 px-2 text-right">Recipients</th>
                      <th className="py-2 px-2 text-right">Open</th>
                      <th className="py-2 pl-2 text-right">Click</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {recentSends.map((s) => {
                      const openPct =
                        s.openCount !== null && s.recipientCount && s.recipientCount > 0
                          ? Math.round((s.openCount / s.recipientCount) * 1000) / 10
                          : null;
                      const clickPct =
                        s.clickCount !== null && s.recipientCount && s.recipientCount > 0
                          ? Math.round((s.clickCount / s.recipientCount) * 1000) / 10
                          : null;
                      return (
                        <tr key={s.hubspotEmailId}>
                          <td className="py-2.5 pr-3">
                            <p className="text-sand-900">{s.subject ?? "(no subject)"}</p>
                          </td>
                          <td className="py-2.5 px-2 text-xs text-sand-500 tabular-nums">{s.sentAt ?? "—"}</td>
                          <td className="py-2.5 px-2 text-xs text-sand-600">{s.fromName ?? "—"}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-sand-700">
                            {s.recipientCount?.toLocaleString() ?? "—"}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums">
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
                          <td className="py-2.5 pl-2 text-right tabular-nums text-sand-700">
                            {clickPct !== null ? `${clickPct}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function Field({
  label,
  children,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-sand-500">{label}</p>
      <p className={`mt-0.5 text-sm leading-relaxed ${highlight ? "text-forest-700 font-medium" : "text-sand-900"}`}>
        {children}
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  color = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  color?: "good" | "neutral";
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-sand-500">{label}</p>
      <p
        className={`mt-1 font-serif text-2xl tabular-nums leading-none ${
          color === "good" ? "text-forest-700" : "text-sand-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
