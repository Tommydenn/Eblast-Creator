import { NextResponse } from "next/server";
import { listMarketingEmails } from "@/lib/hubspot";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/marketing-emails/recent?days=90&type=BATCH_EMAIL
 *
 * Walks every marketing email in the HubSpot portal (paginated) and returns
 * a breakdown plus a recent-window summary. Used both for the in-app
 * dashboard and as a research tool for understanding past eblast patterns.
 *
 * Query params:
 *   days   — recency window for "inWindow" emails (default 90)
 *   type   — filter to a specific type (BATCH_EMAIL / AUTOMATED_EMAIL / AB_EMAIL)
 *   include — comma list: "automated" to include AUTOMATED_EMAIL in results
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "90");
  const typeFilter = url.searchParams.get("type"); // optional
  const include = (url.searchParams.get("include") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const includeAutomated = include.includes("automated");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const all: any[] = [];
  let after: string | undefined;

  // Paginate up to 60 pages (6000 emails). The portal has 5+ years of
  // history including drafts, so we need to walk the full list.
  for (let i = 0; i < 60; i++) {
    const page = await listMarketingEmails({ limit: 100, after });
    if (!page.ok) {
      return NextResponse.json(
        {
          ok: false,
          step: "list_marketing_emails",
          status: page.status,
          body: page.body,
          fetchedSoFar: all.length,
        },
        { status: 200 },
      );
    }
    const results: any[] = page.results ?? [];
    all.push(...results);
    after = page.paging?.next?.after;
    if (!after || results.length === 0) break;
  }

  // ---------- distribution / breakdown ----------------------------------
  const byState: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byTemplateMode: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  const byBusinessUnit: Record<string, number> = {};

  let oldestCreated = "";
  let newestCreated = "";
  let oldestUpdated = "";
  let newestUpdated = "";
  let oldestPublished = "";
  let newestPublished = "";

  for (const e of all) {
    if (e.state) byState[e.state] = (byState[e.state] ?? 0) + 1;
    if (e.type) byType[e.type] = (byType[e.type] ?? 0) + 1;
    if (e.emailTemplateMode) {
      byTemplateMode[e.emailTemplateMode] = (byTemplateMode[e.emailTemplateMode] ?? 0) + 1;
    }
    if (e.activeDomain) byDomain[e.activeDomain] = (byDomain[e.activeDomain] ?? 0) + 1;
    if (e.businessUnitId !== undefined) {
      const k = String(e.businessUnitId);
      byBusinessUnit[k] = (byBusinessUnit[k] ?? 0) + 1;
    }

    if (e.createdAt) {
      if (!oldestCreated || e.createdAt < oldestCreated) oldestCreated = e.createdAt;
      if (!newestCreated || e.createdAt > newestCreated) newestCreated = e.createdAt;
    }
    if (e.updatedAt) {
      if (!oldestUpdated || e.updatedAt < oldestUpdated) oldestUpdated = e.updatedAt;
      if (!newestUpdated || e.updatedAt > newestUpdated) newestUpdated = e.updatedAt;
    }
    if (e.publishDate) {
      if (!oldestPublished || e.publishDate < oldestPublished) oldestPublished = e.publishDate;
      if (!newestPublished || e.publishDate > newestPublished) newestPublished = e.publishDate;
    }
  }

  // ---------- in-window filter ------------------------------------------
  const recent = all.filter((e: any) => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (!includeAutomated && e.type === "AUTOMATED_EMAIL") return false;

    const created = e.createdAt ? new Date(e.createdAt) : null;
    const updated = e.updatedAt ? new Date(e.updatedAt) : null;
    const published = e.publishDate ? new Date(e.publishDate) : null;
    return (
      (created && created >= cutoff) ||
      (updated && updated >= cutoff) ||
      (published && published >= cutoff)
    );
  });

  // Compact summary of in-window emails
  const summary = recent
    .map((e: any) => ({
      id: e.id,
      name: e.name,
      subject: e.subject,
      state: e.state,
      type: e.type,
      emailTemplateMode: e.emailTemplateMode,
      isPublished: e.isPublished,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      publishDate: e.publishDate,
      activeDomain: e.activeDomain,
      from: e.from,
      subscriptionDetails: e.subscriptionDetails,
      businessUnitId: e.businessUnitId,
      templatePath: e.content?.templatePath,
    }))
    .sort((a: any, b: any) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""));

  // ---------- in-window aggregates --------------------------------------
  const senderEmails = new Map<string, number>();
  const senderNames = new Map<string, number>();
  const activeDomains = new Map<string, number>();
  const subjectPrefixes = new Map<string, number>();
  for (const e of recent) {
    const from = e.from?.replyTo ?? "";
    const fromName = e.from?.fromName ?? "";
    const dom = e.activeDomain ?? "";
    const prefix = (e.subject ?? "").split(":")[0]?.trim() || "";
    if (from) senderEmails.set(from, (senderEmails.get(from) ?? 0) + 1);
    if (fromName) senderNames.set(fromName, (senderNames.get(fromName) ?? 0) + 1);
    if (dom) activeDomains.set(dom, (activeDomains.get(dom) ?? 0) + 1);
    if (prefix) subjectPrefixes.set(prefix, (subjectPrefixes.get(prefix) ?? 0) + 1);
  }
  const topN = (m: Map<string, number>, n = 30) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([value, count]) => ({ value, count }));

  return NextResponse.json({
    ok: true,
    days,
    cutoff: cutoff.toISOString(),
    typeFilter,
    includeAutomated,
    totalScanned: all.length,
    inWindow: recent.length,
    distribution: {
      byState,
      byType,
      byTemplateMode,
      byDomain: Object.fromEntries(
        Object.entries(byDomain).sort(([, a], [, b]) => b - a).slice(0, 50),
      ),
      byBusinessUnit,
      dateRanges: {
        createdAt: { oldest: oldestCreated, newest: newestCreated },
        updatedAt: { oldest: oldestUpdated, newest: newestUpdated },
        publishDate: { oldest: oldestPublished, newest: newestPublished },
      },
    },
    aggregates: {
      senderEmails: topN(senderEmails),
      senderNames: topN(senderNames),
      activeDomains: topN(activeDomains),
      subjectPrefixes: topN(subjectPrefixes),
    },
    emails: summary,
  });
}
