// Community intelligence summary — surfaces the same data the drafter and
// critic see, so the user can verify the agents have memory before clicking
// "Generate eblast draft."

import { NextResponse } from "next/server";
import { eq, sql, and } from "drizzle-orm";
import { getCommunity } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { pastSends } from "@/lib/db/schema";
import { getRecentSendsForCommunity } from "@/lib/past-sends-retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  const community = await getCommunity(slug);
  if (!community) {
    return NextResponse.json({ ok: false, error: `Unknown community: ${slug}` }, { status: 404 });
  }

  const recentSends = await getRecentSendsForCommunity({ communityId: community.id, limit: 6 });

  // Aggregate over ALL published sends for this community (not just last 6) for accurate averages.
  const aggRows = await db
    .select({
      sendCount: sql<number>`COUNT(*)::int`,
      avgOpenPct: sql<string | null>`ROUND(AVG((${pastSends.openCount}::numeric / NULLIF(${pastSends.recipientCount}, 0)) * 100)::numeric, 1)`,
      avgClickPct: sql<string | null>`ROUND(AVG((${pastSends.clickCount}::numeric / NULLIF(${pastSends.recipientCount}, 0)) * 100)::numeric, 2)`,
      avgRecipients: sql<string | null>`ROUND(AVG(${pastSends.recipientCount})::numeric)`,
      lastSentAt: sql<string | null>`MAX(${pastSends.publishedAt})::text`,
    })
    .from(pastSends)
    .where(
      and(
        eq(pastSends.communityId, community.id),
        eq(pastSends.state, "PUBLISHED"),
        sql`${pastSends.recipientCount} > 0`,
      ),
    );

  const a = aggRows[0];
  const summary = {
    sendCount: a?.sendCount ?? 0,
    avgOpenPct: a?.avgOpenPct !== null && a?.avgOpenPct !== undefined ? Number(a.avgOpenPct) : null,
    avgClickPct: a?.avgClickPct !== null && a?.avgClickPct !== undefined ? Number(a.avgClickPct) : null,
    avgRecipients: a?.avgRecipients !== null && a?.avgRecipients !== undefined ? Number(a.avgRecipients) : null,
    lastSentAt: a?.lastSentAt ?? null,
  };

  return NextResponse.json({
    ok: true,
    community: {
      slug: community.slug,
      displayName: community.displayName,
      trackingPhone: community.trackingPhone,
      senders: community.senders.map((s) => ({ name: s.name, email: s.email, isPrimary: s.isPrimary })),
    },
    summary,
    recentSends,
  });
}
