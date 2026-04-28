import { NextResponse } from "next/server";
import { listMarketingEmails } from "@/lib/hubspot";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/marketing-emails/recent
 *
 * Walks every marketing email in the HubSpot portal (paginated) and returns
 * a compact summary of the ones created in the last N days (default 90).
 *
 * We use this both for the in-app dashboard and as a research tool to see
 * what patterns past Great Lakes eblasts share — so the Community type
 * captures the actual fields the team uses, not guesses.
 *
 * Read-only. Doesn't write anything to HubSpot.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "90");
  const includeHtmlSummary = url.searchParams.get("html") === "1"; // future: fetch each body

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const all: any[] = [];
  let after: string | undefined;

  // Paginate up to 10 pages (500 emails). Generous for a small portal.
  for (let i = 0; i < 10; i++) {
    const page = await listMarketingEmails({ limit: 50, after });
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

  // Filter to anything created/published within the date window
  const recent = all.filter((e: any) => {
    const created = e.createdAt ? new Date(e.createdAt) : null;
    const published = e.publishDate ? new Date(e.publishDate) : null;
    return (created && created >= cutoff) || (published && published >= cutoff);
  });

  // Compact, signal-rich summary — enough to spot patterns by skimming.
  const summary = recent
    .map((e: any) => ({
      id: e.id,
      name: e.name,
      subject: e.subject,
      previewText: e.previewKey, // HubSpot's odd field name
      state: e.state,
      type: e.type,
      emailTemplateMode: e.emailTemplateMode,
      isPublished: e.isPublished,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      publishDate: e.publishDate,
      activeDomain: e.activeDomain,
      from: e.from,
      to: e.to,
      subcategory: e.subcategory,
      subscriptionDetails: e.subscriptionDetails,
      businessUnitId: e.businessUnitId,
      templatePath: e.content?.templatePath,
    }))
    .sort((a: any, b: any) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  // Aggregate signals — useful for designing the Community structure.
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
    totalScanned: all.length,
    inWindow: recent.length,
    aggregates: {
      senderEmails: topN(senderEmails),
      senderNames: topN(senderNames),
      activeDomains: topN(activeDomains),
      subjectPrefixes: topN(subjectPrefixes),
    },
    emails: summary,
  });
}
