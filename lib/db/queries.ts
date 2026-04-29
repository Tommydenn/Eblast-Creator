// Async data-access layer. All app code reads communities through this file.
// Drizzle queries → composed `Community` shape with senders[] attached.

import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  communities,
  communitySenders,
  type CommunityRow,
  type CommunitySenderRow,
  type Address,
  type CommunityBrand,
  type CommunitySocials,
  type CommunityHubSpot,
  type CommunityLogo,
  type CommunityAsset,
  type CommunityVoice,
  type CommunityMarketingDirector,
  type BrandGuideExtracted,
} from "./schema";

/**
 * The composed Community shape returned to the rest of the app. JSONB columns
 * are surfaced as their nested types; senders are joined in.
 */
export interface Community extends Omit<CommunityRow, "address" | "brand" | "socials" | "hubspot" | "voice" | "marketingDirector" | "logos" | "photoLibrary" | "brandGuideExtracted"> {
  address: Address;
  brand: CommunityBrand;
  socials: CommunitySocials;
  hubspot: CommunityHubSpot;
  voice: CommunityVoice | null;
  marketingDirector: CommunityMarketingDirector | null;
  logos: CommunityLogo[];
  photoLibrary: CommunityAsset[];
  brandGuideExtracted: BrandGuideExtracted | null;

  /** All senders for this community. Editorial choice per send picks one. */
  senders: CommunitySender[];
}

export interface CommunitySender {
  id: string;
  name: string;
  email: string;
  title: string | null;
  isPrimary: boolean;
}

function rowToSender(s: CommunitySenderRow): CommunitySender {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    title: s.title,
    isPrimary: s.isPrimary,
  };
}

function sortSenders(a: CommunitySender, b: CommunitySender): number {
  // Primary first, then by name.
  if (a.isPrimary && !b.isPrimary) return -1;
  if (b.isPrimary && !a.isPrimary) return 1;
  return a.name.localeCompare(b.name);
}

function rowToCommunity(row: CommunityRow, senders: CommunitySender[]): Community {
  return {
    ...row,
    address: (row.address ?? {}) as Address,
    brand: row.brand as CommunityBrand,
    socials: (row.socials ?? {}) as CommunitySocials,
    hubspot: (row.hubspot ?? {}) as CommunityHubSpot,
    voice: (row.voice ?? null) as CommunityVoice | null,
    marketingDirector: (row.marketingDirector ?? null) as CommunityMarketingDirector | null,
    logos: (row.logos ?? []) as CommunityLogo[],
    photoLibrary: (row.photoLibrary ?? []) as CommunityAsset[],
    brandGuideExtracted: (row.brandGuideExtracted ?? null) as BrandGuideExtracted | null,
    senders: senders.sort(sortSenders),
  };
}

// ---------- reads --------------------------------------------------------

export async function getCommunity(slug: string): Promise<Community | undefined> {
  const rows = await db.select().from(communities).where(eq(communities.slug, slug)).limit(1);
  if (rows.length === 0) return undefined;
  const row = rows[0];
  const sendersRows = await db
    .select()
    .from(communitySenders)
    .where(eq(communitySenders.communityId, row.id));
  return rowToCommunity(row, sendersRows.map(rowToSender));
}

export async function listCommunities(): Promise<Community[]> {
  const rows = await db.select().from(communities);
  if (rows.length === 0) return [];

  // One query for ALL senders, then group in memory — avoids N+1.
  const allSenders = await db.select().from(communitySenders);
  const byCommunity = new Map<string, CommunitySender[]>();
  for (const s of allSenders) {
    const list = byCommunity.get(s.communityId) ?? [];
    list.push(rowToSender(s));
    byCommunity.set(s.communityId, list);
  }

  return rows
    .map((r) => rowToCommunity(r, byCommunity.get(r.id) ?? []))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ---------- legacy compat shim --------------------------------------------
//
// Existing code accesses `community.sender.name` / `community.sender.email`.
// Provide a virtual `sender` getter on the returned object so callsites keep
// working while we incrementally migrate to `community.senders[0]`. This is
// declared as a separate helper instead of mutating the Community type so the
// Postgres-backed shape stays correct.

export interface CommunityWithLegacySender extends Community {
  /** Deprecated. Use `senders[0]` directly. Kept for backward compat. */
  sender: { name: string; email: string; title?: string };
}

export function withLegacySender(c: Community): CommunityWithLegacySender {
  const primary = c.senders[0];
  return {
    ...c,
    sender: primary
      ? { name: primary.name, email: primary.email, title: primary.title ?? undefined }
      : { name: c.displayName, email: c.email ?? "" },
  };
}
