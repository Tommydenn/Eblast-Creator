// Past-sends retrieval — what the drafter and critic actually consume.
// Returns a slim, ranked list of past sends for a community: subject,
// when sent, opens / clicks / recipient count, plus a quick top-line metric
// (open rate, click rate). The drafter uses these as voice/style references;
// the critic uses them to compare patterns and flag drift.

import { eq, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { pastSends } from "@/lib/db/schema";

export interface PastSendForContext {
  subject: string;
  sentAt: string | null;
  recipientCount: number | null;
  openCount: number | null;
  clickCount: number | null;
  openRatePct: number | null;
  clickRatePct: number | null;
  fromName: string | null;
}

function asPercent(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal
}

/**
 * Pull recent published sends for a community, sorted recency-first.
 * Returns the slim shape the agents see.
 */
export async function getRecentSendsForCommunity(opts: {
  communityId: string;
  limit?: number;
}): Promise<PastSendForContext[]> {
  const limit = opts.limit ?? 12;
  const rows = await db
    .select()
    .from(pastSends)
    .where(and(eq(pastSends.communityId, opts.communityId), eq(pastSends.state, "PUBLISHED")))
    .orderBy(sql`${pastSends.publishedAt} DESC NULLS LAST`)
    .limit(limit);

  return rows.map((r) => ({
    subject: r.subject ?? "",
    sentAt: r.publishedAt ? r.publishedAt.toISOString().slice(0, 10) : null,
    recipientCount: r.recipientCount,
    openCount: r.openCount,
    clickCount: r.clickCount,
    openRatePct: asPercent(r.openCount, r.recipientCount),
    clickRatePct: asPercent(r.clickCount, r.recipientCount),
    fromName: r.fromName,
  }));
}

/**
 * Format a list of past sends as a human-readable block to inject into a
 * Claude system prompt. Optimized for skim-readability, not pretty-printing.
 */
export function formatPastSendsForPrompt(sends: PastSendForContext[]): string {
  if (sends.length === 0) return "(no past sends on file yet for this community)";

  const lines = sends.map((s) => {
    const date = s.sentAt ?? "(date unknown)";
    const sender = s.fromName ?? "?";
    const stats = [
      s.openRatePct !== null ? `${s.openRatePct}% open` : null,
      s.clickRatePct !== null ? `${s.clickRatePct}% click` : null,
      s.recipientCount !== null ? `${s.recipientCount} recipients` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return `- ${date} · "${s.subject}" · from ${sender}${stats ? ` · ${stats}` : ""}`;
  });
  return lines.join("\n");
}
