// Past-sends sync. Walks HubSpot's marketing email list, filters to
// regular BATCH_EMAIL sends within the last 365 days, maps each to a
// community in our DB, fetches statistics, and upserts into `past_sends`.
//
// Designed to run:
//   - Once for the full 365-day backfill (initial setup).
//   - Daily thereafter via cron — a thin pass that picks up new sends and
//     refreshes stats on recently-published ones.
//
// Mapping strategy (in priority order):
//   1. Exact match: from.replyTo against community_senders.email.
//   2. Subject / email-name contains a community displayName.
//   3. Subject / email-name contains a community city name.
//   4. fromName contains a community displayName.
// If all four miss, the past-send is stored unmapped (communityId = null).

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { communities, communitySenders, pastSends } from "@/lib/db/schema";
import {
  listMarketingEmails,
  getMarketingEmail,
  getMarketingEmailCampaign,
} from "@/lib/hubspot";

const DAYS_BACKFILL = 365;
const HUBSPOT_TYPE_BATCH = "BATCH_EMAIL";

export interface SyncResult {
  walked: number;
  inWindow: number;
  upserted: number;
  mapped: number;
  unmapped: number;
  statsFetched: number;
  statsErrors: number;
  unmappedSamples: Array<{ id: string; subject?: string; fromName?: string; fromEmail?: string }>;
  durationMs: number;
}

interface CommunityForMap {
  id: string;
  slug: string;
  displayName: string;
  city: string | null;
}

interface SenderForMap {
  email: string;
  communityId: string;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

function mapEmailToCommunity(
  email: any,
  communitiesList: CommunityForMap[],
  sendersList: SenderForMap[],
): string | null {
  const fromEmail = normalize(email?.from?.replyTo);
  const fromName = normalize(email?.from?.fromName);
  const subject = normalize(email?.subject);
  const name = normalize(email?.name);
  const haystack = [subject, name].filter(Boolean).join(" ");

  // Priority 1: a community displayName explicitly in subject or email name.
  // This is the strongest signal — the marketer typed the community name.
  for (const c of communitiesList) {
    if (haystack.includes(c.displayName.toLowerCase())) return c.id;
  }

  // Priority 2: a community city in subject or email name. Necessary for
  // multi-location brands (Caretta Bellevue / Eau Claire / Holmen / Maplewood)
  // where the same sender owns several locations.
  for (const c of communitiesList) {
    if (c.city && haystack.includes(c.city.toLowerCase())) return c.id;
  }

  // Priority 3: sender email — only if it maps unambiguously to ONE community.
  if (fromEmail) {
    const senderHits = sendersList.filter((s) => s.email.toLowerCase() === fromEmail);
    const distinctCommunities = new Set(senderHits.map((s) => s.communityId));
    if (distinctCommunities.size === 1) return senderHits[0].communityId;
  }

  // Priority 4: fromName explicitly contains a community displayName.
  if (fromName) {
    for (const c of communitiesList) {
      if (fromName.includes(c.displayName.toLowerCase())) return c.id;
    }
  }

  // Last resort: ambiguous sender email — pick the FIRST associated community
  // so we at least get the brand right (e.g. "Caretta" generic emails go to
  // Caretta Bellevue rather than nothing).
  if (fromEmail) {
    const senderHits = sendersList.filter((s) => s.email.toLowerCase() === fromEmail);
    if (senderHits.length > 0) return senderHits[0].communityId;
  }

  return null;
}

/**
 * Normalise the HubSpot v1 campaign-stats counters into our per-row fields.
 * Defensive about field naming — `recipientCount` is whichever of
 * processed/sent/delivered actually has a value.
 */
function extractStatsCounters(campaignBody: any): {
  recipientCount: number | null;
  openCount: number | null;
  clickCount: number | null;
  bounceCount: number | null;
  unsubscribeCount: number | null;
} {
  if (!campaignBody || typeof campaignBody !== "object") {
    return { recipientCount: null, openCount: null, clickCount: null, bounceCount: null, unsubscribeCount: null };
  }
  const c = campaignBody.counters ?? {};

  const num = (v: any): number | null => {
    if (v === undefined || v === null) return null;
    if (typeof v === "number") return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    return null;
  };

  return {
    recipientCount: num(c.delivered) ?? num(c.sent) ?? num(c.processed) ?? null,
    openCount: num(c.open) ?? null,
    clickCount: num(c.click) ?? null,
    bounceCount: num(c.bounce) ?? null,
    unsubscribeCount: num(c.unsubscribed) ?? null,
  };
}

/**
 * Resolve campaign stats for a HubSpot marketing email.
 *
 * The /marketing/v3/emails list endpoint doesn't return primaryEmailCampaignId,
 * so we have to fetch the full email row to get it. Then call the v1 campaign
 * endpoint with that ID to get counters. Two HubSpot calls per row.
 *
 * Returns null if either call fails — caller continues with metadata-only.
 */
async function fetchStatsForEmail(emailId: string): Promise<{
  campaignId: number | null;
  campaignName: string | null;
  scheduledAt: number | null;
  counters: ReturnType<typeof extractStatsCounters>;
  raw: any;
} | null> {
  const fullRes = await getMarketingEmail(emailId);
  if (!fullRes.ok) return null;
  const campaignId = fullRes.body?.primaryEmailCampaignId;
  if (!campaignId) return null;

  const campRes = await getMarketingEmailCampaign(campaignId);
  if (!campRes.ok) return null;
  return {
    campaignId,
    campaignName: campRes.body?.name ?? null,
    scheduledAt: campRes.body?.scheduledAt ?? null,
    counters: extractStatsCounters(campRes.body),
    raw: campRes.body,
  };
}

export async function syncPastSends(opts: {
  /** Only refresh stats for sends already in the DB; don't walk full HubSpot list. */
  refreshStatsOnly?: boolean;
  /** Skip stats fetching entirely (faster smoke test). */
  skipStats?: boolean;
  /** Verbose logging. */
  verbose?: boolean;
} = {}): Promise<SyncResult> {
  const startedAt = Date.now();
  const log = (...args: any[]) => {
    if (opts.verbose) console.log(...args);
  };

  // Load communities + senders for mapping.
  const communitiesRows = await db.select().from(communities);
  const sendersRows = await db.select().from(communitySenders);
  const commForMap: CommunityForMap[] = communitiesRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    displayName: c.displayName,
    city: ((c.address as any) ?? {}).city ?? null,
  }));
  const sendForMap: SenderForMap[] = sendersRows.map((s) => ({
    email: s.email,
    communityId: s.communityId,
  }));

  log(`Loaded ${commForMap.length} communities + ${sendForMap.length} senders for mapping.`);

  // Walk HubSpot list, paginated.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_BACKFILL);

  const inWindow: any[] = [];
  let after: string | undefined;
  let walked = 0;

  if (!opts.refreshStatsOnly) {
    log(`Walking HubSpot marketing emails (cutoff: ${cutoff.toISOString().slice(0, 10)})...`);
    for (let i = 0; i < 60; i++) {
      const page = await listMarketingEmails({ limit: 100, after });
      if (!page.ok) {
        log(`HubSpot list call failed at page ${i}, status=${page.status}. Stopping pagination.`);
        break;
      }
      const results = page.results ?? [];
      walked += results.length;
      for (const e of results) {
        // Filter to regular marketing batches.
        if (e.type !== HUBSPOT_TYPE_BATCH) continue;
        // Filter to last 365 days. Use createdAt as the inclusion signal —
        // covers DRAFT + SCHEDULED + PUBLISHED that were created recently.
        const createdAt = e.createdAt ? new Date(e.createdAt) : null;
        if (!createdAt || createdAt < cutoff) continue;
        inWindow.push(e);
      }
      after = page.paging?.next?.after;
      if (!after || results.length === 0) break;
    }
    log(`Walked ${walked}, in-window ${inWindow.length}.`);
  } else {
    log("Refresh-stats-only mode: walking past_sends rows already in DB.");
    const existing = await db.select().from(pastSends);
    for (const row of existing) {
      const raw = (row.raw as any) ?? {};
      const email = raw.email ?? { id: row.hubspotEmailId, subject: row.subject, from: { fromName: row.fromName, replyTo: row.fromEmail }, state: row.state };
      inWindow.push(email);
    }
  }

  let upserted = 0;
  let mapped = 0;
  let unmapped = 0;
  let statsFetched = 0;
  let statsErrors = 0;
  const unmappedSamples: SyncResult["unmappedSamples"] = [];

  for (const email of inWindow) {
    const communityId = mapEmailToCommunity(email, commForMap, sendForMap);
    if (communityId) {
      mapped++;
    } else {
      unmapped++;
      if (unmappedSamples.length < 10) {
        unmappedSamples.push({
          id: email.id,
          subject: email.subject,
          fromName: email?.from?.fromName,
          fromEmail: email?.from?.replyTo,
        });
      }
    }

    let stats: ReturnType<typeof extractStatsCounters> = {
      recipientCount: null,
      openCount: null,
      clickCount: null,
      bounceCount: null,
      unsubscribeCount: null,
    };
    let statsRaw: any = null;

    if (!opts.skipStats && email.state === "PUBLISHED") {
      try {
        const fetched = await fetchStatsForEmail(email.id);
        if (fetched) {
          stats = fetched.counters;
          statsRaw = fetched.raw;
          statsFetched++;
        } else {
          statsErrors++;
        }
      } catch (e) {
        statsErrors++;
      }
    }

    await db
      .insert(pastSends)
      .values({
        hubspotEmailId: email.id,
        communityId,
        subject: email.subject ?? null,
        previewText: email.previewText ?? null,
        fromName: email?.from?.fromName ?? null,
        fromEmail: email?.from?.replyTo ?? null,
        state: email.state ?? null,
        publishedAt: email.publishDate ? new Date(email.publishDate) : null,
        recipientCount: stats.recipientCount,
        openCount: stats.openCount,
        clickCount: stats.clickCount,
        bounceCount: stats.bounceCount,
        unsubscribeCount: stats.unsubscribeCount,
        raw: { email, stats: statsRaw },
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pastSends.hubspotEmailId,
        set: {
          communityId,
          subject: email.subject ?? null,
          previewText: email.previewText ?? null,
          fromName: email?.from?.fromName ?? null,
          fromEmail: email?.from?.replyTo ?? null,
          state: email.state ?? null,
          publishedAt: email.publishDate ? new Date(email.publishDate) : null,
          recipientCount: stats.recipientCount,
          openCount: stats.openCount,
          clickCount: stats.clickCount,
          bounceCount: stats.bounceCount,
          unsubscribeCount: stats.unsubscribeCount,
          raw: { email, stats: statsRaw },
          syncedAt: new Date(),
        },
      });
    upserted++;

    if (opts.verbose && upserted % 25 === 0) {
      log(`  ...upserted ${upserted}/${inWindow.length}`);
    }
  }

  return {
    walked,
    inWindow: inWindow.length,
    upserted,
    mapped,
    unmapped,
    statsFetched,
    statsErrors,
    unmappedSamples,
    durationMs: Date.now() - startedAt,
  };
}
