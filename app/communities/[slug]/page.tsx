// Per-community detail page — complete redesign.
// Server-rendered against Postgres; uses community brand colors for visual identity.

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql, and } from "drizzle-orm";
import { getCommunity } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { pastSends } from "@/lib/db/schema";
import { Header } from "@/components/Header";
import { SendersPanel } from "@/components/SendersPanel";
import { ContactPanel } from "@/components/ContactPanel";
import { BrandPanel } from "@/components/BrandPanel";
import { RecentSendsPanel } from "@/components/RecentSendsPanel";

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
    .where(and(eq(pastSends.communityId, communityId), eq(pastSends.state, "PUBLISHED"), sql`${pastSends.recipientCount} > 0`));
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
    loadRecentSends(community.id, 12),
    loadAggregates(community.id),
  ]);

  const c = community;

  const websiteHref = c.websiteUrl
    ? (/^https?:\/\//.test(c.websiteUrl) ? c.websiteUrl : `https://${c.websiteUrl}`)
    : "";

  const addressLine = [
    c.address.street,
    [c.address.city, c.address.state].filter(Boolean).join(", "),
    c.address.zip,
  ].filter(Boolean).join(" · ");

  // Hero logo: prefer primary on light, fall back to any
  const heroLogo =
    c.logos.find((l) => (l.onColor === "light" || l.onColor === "any") && l.variant === "primary") ??
    c.logos.find((l) => l.onColor === "light" || l.onColor === "any") ??
    c.logos[0] ??
    null;

  const hasBrand = c.brandGuideExtracted != null || c.brand.paletteSource === "brand-guide-extracted";

  return (
    <>
      <Header active="communities" />

      {/* ── Brand hero ───────────────────────────────────────────────────────── */}
      <div className="relative" style={{ borderTop: `4px solid ${c.brand.accent}` }}>
        {/* Subtle brand color wash */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(135deg, ${c.brand.primary}08 0%, transparent 60%)` }}
        />
        <div className="relative mx-auto max-w-[1240px] px-6 py-10">
          <Link
            href="/communities"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-sand-500 hover:text-sand-700 mb-6"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All communities
          </Link>

          <div className="flex items-start justify-between gap-8 flex-wrap">
            <div>
              {/* Type + brand family */}
              <p
                className="text-[10.5px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: c.brand.accent, fontFamily: c.brand.fontBody }}
              >
                {c.brandFamily ?? c.shortName}
                {c.careTypes && c.careTypes.length > 0 && (
                  <span className="text-sand-400"> · {c.careTypes.join(" · ")}</span>
                )}
              </p>

              {/* Community name */}
              <h1
                className="mt-1 text-[40px] leading-tight"
                style={{ color: c.brand.primary, fontFamily: c.brand.fontHeadline }}
              >
                {c.displayName}
              </h1>

              {/* Address */}
              {addressLine && (
                <p className="mt-1.5 text-sm text-sand-500">{addressLine}</p>
              )}

              {/* Action buttons */}
              <div className="mt-5 flex items-center gap-3 flex-wrap">
                <Link
                  href={`/drafter?community=${c.slug}`}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-white rounded-lg px-4 py-2.5 transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: c.brand.primary }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                  Create Eblast
                </Link>
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-sand-600 hover:text-sand-800 border border-sand-200 rounded-lg px-3 py-2.5 bg-white/80 transition-colors"
                  >
                    Website
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>

            {/* Logo */}
            {heroLogo && (
              <div className="shrink-0 flex items-center justify-center bg-white/90 rounded-2xl border border-sand-200/60 shadow-sm px-6 py-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroLogo.url}
                  alt={c.displayName}
                  className="h-16 w-auto max-w-[200px] object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Performance KPIs ─────────────────────────────────────────────────── */}
      {aggregates.sendCount > 0 && (
        <div className="border-b border-sand-200 bg-white">
          <div className="mx-auto max-w-[1240px] px-6 py-4">
            {/* Seamless KPI strip — shared borders, no gaps */}
            <div className="flex rounded-xl border border-sand-200 overflow-hidden divide-x divide-sand-200">
              <Kpi label="Sends · 365d" value={aggregates.sendCount} accentColor={c.brand.accent} />
              <Kpi
                label="Avg open rate"
                value={aggregates.avgOpenPct !== null ? `${aggregates.avgOpenPct}%` : "—"}
                color={aggregates.avgOpenPct !== null && aggregates.avgOpenPct >= 40 ? "good" : "neutral"}
                accentColor={c.brand.accent}
              />
              <Kpi
                label="Avg click rate"
                value={aggregates.avgClickPct !== null ? `${aggregates.avgClickPct}%` : "—"}
                accentColor={c.brand.accent}
              />
              <Kpi
                label="Avg list size"
                value={aggregates.avgRecipients !== null ? aggregates.avgRecipients.toLocaleString() : "—"}
                accentColor={c.brand.accent}
              />
              <Kpi
                label="Best open rate"
                value={aggregates.bestOpenPct !== null ? `${aggregates.bestOpenPct}%` : "—"}
                color="good"
                accentColor={c.brand.accent}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1240px] px-6 pb-24 pt-8">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">

          {/* ── LEFT COLUMN: Brand & Identity ─────────────────────────────── */}
          <div className="space-y-6">

            {/* Brand card */}
            <Section title="Brand" badge={hasBrand ? "From guide" : "Placeholder"} badgeVariant={hasBrand ? "success" : "warning"}>

              {/* Color palette + typography — user-owned, edited only via BrandPanel */}
              <BrandPanel slug={c.slug} brand={c.brand} />

              {/* All logos */}
              {c.logos.length > 0 && (
                <div>
                  <SectionLabel>Logos ({c.logos.length})</SectionLabel>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.logos.map((logo, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div
                          className={`flex items-center justify-center rounded-xl border p-3 ${
                            logo.onColor === "dark" ? "bg-gray-900 border-gray-700" : "bg-sand-50 border-sand-200"
                          }`}
                          style={{ minWidth: 72, minHeight: 56 }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={logo.url}
                            alt={`${c.displayName} ${logo.variant}`}
                            className="max-h-10 max-w-[88px] w-auto object-contain"
                          />
                        </div>
                        <p className="text-[9px] text-sand-500 capitalize text-center leading-tight">
                          {logo.variant}
                          {logo.onColor ? ` · ${logo.onColor}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Brand guide link */}
              {c.brandGuideUrl && (
                <a
                  href={c.brandGuideUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 px-3 py-1.5 text-xs font-medium text-sand-700 hover:border-sand-300 hover:bg-sand-50 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                  </svg>
                  View brand guide PDF
                </a>
              )}

              {/* Photo library */}
              {c.photoLibrary && c.photoLibrary.length > 0 && (
                <div>
                  <SectionLabel>Photo library</SectionLabel>
                  <p className="mt-1 text-sm text-sand-700">
                    {c.photoLibrary.length} asset{c.photoLibrary.length === 1 ? "" : "s"} on file
                  </p>
                </div>
              )}
            </Section>

          </div>

          {/* ── RIGHT COLUMN: Contact, Sending ───────────────────────────── */}
          <div className="space-y-6">

            {/* Contact & Identity */}
            <Section title="Contact &amp; identity">
              <ContactPanel
                slug={c.slug}
                initialDisplayName={c.displayName}
                initialAddress={c.address}
                initialTrackingPhone={c.trackingPhone ?? null}
                initialWebsiteUrl={c.websiteUrl ?? null}
              />
              {c.hubspot?.acronym && (
                <Field label="HubSpot acronym">
                  <span className="font-mono text-sm">{c.hubspot.acronym}</span>
                </Field>
              )}
              {c.socials && Object.values(c.socials).some(Boolean) && (
                <Field label="Social media">
                  <span className="flex flex-wrap gap-3 text-sm">
                    {Object.entries(c.socials)
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <a key={k} href={v as string} target="_blank" rel="noreferrer" className="capitalize hover:underline" style={{ color: c.brand.accent }}>
                          {k}
                        </a>
                      ))}
                  </span>
                </Field>
              )}
            </Section>

            {/* Sending */}
            <Section title="Sending" description="Who appears in the From: field for this community.">
              <SendersPanel slug={c.slug} initialSenders={c.senders} />
            </Section>
          </div>
        </div>

        {/* ── Recent sends — full width, collapsible ───────────────────────── */}
        <div className="mt-6">
          <RecentSendsPanel sends={recentSends} />
        </div>
      </main>
    </>
  );
}

// ── Design primitives ─────────────────────────────────────────────────────────

function Section({
  title,
  description,
  badge,
  badgeVariant,
  children,
}: {
  title: string;
  description?: string;
  badge?: string;
  badgeVariant?: "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-sand-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-sand-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              className="text-sm font-semibold text-sand-900"
              dangerouslySetInnerHTML={{ __html: title }}
            />
            {description && <p className="mt-0.5 text-xs text-sand-500">{description}</p>}
          </div>
          {badge && (
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                badgeVariant === "success"
                  ? "text-forest-700 bg-forest-50 border-forest-200"
                  : "text-clay-600 bg-clay-50 border-clay-200"
              }`}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sand-500 ${className}`}>
      {children}
    </p>
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
  accentColor,
}: {
  label: string;
  value: React.ReactNode;
  color?: "good" | "neutral";
  accentColor: string;
}) {
  return (
    <div className="flex-1 bg-white px-4 py-3 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-sand-500 truncate">{label}</p>
      <p
        className="mt-1 text-2xl tabular-nums leading-none font-semibold"
        style={{ color: color === "good" ? accentColor : "#1a1a1a", fontFamily: "inherit" }}
      >
        {value}
      </p>
    </div>
  );
}
