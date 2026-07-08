// Async data-access layer. All app code reads communities through this file.
// Drizzle queries → composed `Community` shape with senders[] attached.

import { eq, sql } from "drizzle-orm";
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

// ---------- sender CRUD ---------------------------------------------------

export async function addSender(
  communityId: string,
  data: { name: string; email: string; title?: string; isPrimary: boolean }
): Promise<CommunitySender> {
  if (data.isPrimary) {
    await db.update(communitySenders).set({ isPrimary: false }).where(eq(communitySenders.communityId, communityId));
  }
  const [row] = await db
    .insert(communitySenders)
    .values({ communityId, name: data.name, email: data.email, title: data.title ?? null, isPrimary: data.isPrimary })
    .returning();
  return rowToSender(row);
}

export async function updateSender(
  id: string,
  communityId: string,
  data: { name?: string; email?: string; title?: string | null; isPrimary?: boolean }
): Promise<CommunitySender | null> {
  if (data.isPrimary) {
    await db.update(communitySenders).set({ isPrimary: false }).where(eq(communitySenders.communityId, communityId));
  }
  const patch: Partial<typeof communitySenders.$inferInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.email !== undefined) patch.email = data.email;
  if (data.title !== undefined) patch.title = data.title;
  if (data.isPrimary !== undefined) patch.isPrimary = data.isPrimary;
  const [row] = await db.update(communitySenders).set(patch).where(eq(communitySenders.id, id)).returning();
  return row ? rowToSender(row) : null;
}

export async function deleteSender(id: string): Promise<boolean> {
  const result = await db.delete(communitySenders).where(eq(communitySenders.id, id)).returning({ id: communitySenders.id });
  return result.length > 0;
}

export async function updateCommunityContact(
  slug: string,
  data: {
    displayName?: string;
    address?: Address;
    phone?: string | null;
    trackingPhone?: string | null;
    email?: string | null;
    websiteUrl?: string | null;
  }
): Promise<boolean> {
  const patch: Partial<typeof communities.$inferInsert> = { updatedAt: new Date() };
  if (data.displayName !== undefined) patch.displayName = data.displayName;
  if ("address" in data) patch.address = data.address;
  if ("phone" in data) patch.phone = data.phone;
  if ("trackingPhone" in data) patch.trackingPhone = data.trackingPhone;
  if ("email" in data) patch.email = data.email;
  if ("websiteUrl" in data) patch.websiteUrl = data.websiteUrl;
  const result = await db
    .update(communities)
    .set(patch)
    .where(eq(communities.slug, slug))
    .returning({ id: communities.id });
  return result.length > 0;
}

export async function updateCommunitySegments(
  slug: string,
  includedListIds: number[],
  excludedListIds: number[]
): Promise<boolean> {
  const patch = JSON.stringify({ includedListIds, excludedListIds });
  const result = await db
    .update(communities)
    .set({
      // Merge only the two segment fields into the existing JSONB, leaving all
      // other hubspot fields (listId, acronym, etc.) untouched.
      hubspot: sql`hubspot || ${patch}::jsonb`,
    })
    .where(eq(communities.slug, slug))
    .returning({ id: communities.id });
  return result.length > 0;
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
