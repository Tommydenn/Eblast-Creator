// Async data-access layer. All app code reads communities through this file.
// Drizzle queries → composed `Community` shape with senders[] attached.

import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import {
  communities,
  communitySenders,
  regionals as regionalsTable,
  regionalCommunities,
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
export interface Community extends Omit<CommunityRow, "address" | "brand" | "socials" | "hubspot" | "marketingDirector" | "logos" | "photoLibrary" | "brandGuideExtracted"> {
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

  /** Regionals covering this community, copied on its approval requests. */
  regionals: CommunityRegional[];
}

export interface CommunityRegional {
  id: string;
  name: string;
  email: string;
  title: string | null;
}

export interface CommunitySender {
  id: string;
  name: string;
  /** Null when only the name is on file. */
  email: string | null;
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

function rowToCommunity(
  row: CommunityRow,
  senders: CommunitySender[],
  regionals: CommunityRegional[] = [],
): Community {
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
    regionals: regionals.sort((a, b) => a.name.localeCompare(b.name)),
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
  const regionalRows = await db
    .select({
      id: regionalsTable.id,
      name: regionalsTable.name,
      email: regionalsTable.email,
      title: regionalsTable.title,
    })
    .from(regionalCommunities)
    .innerJoin(regionalsTable, eq(regionalsTable.id, regionalCommunities.regionalId))
    .where(eq(regionalCommunities.communityId, row.id));
  return rowToCommunity(row, sendersRows.map(rowToSender), regionalRows);
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

  // Same again for regionals: one query, grouped in memory.
  const allLinks = await db
    .select({
      communityId: regionalCommunities.communityId,
      id: regionalsTable.id,
      name: regionalsTable.name,
      email: regionalsTable.email,
      title: regionalsTable.title,
    })
    .from(regionalCommunities)
    .innerJoin(regionalsTable, eq(regionalsTable.id, regionalCommunities.regionalId));
  const regionalsByCommunity = new Map<string, CommunityRegional[]>();
  for (const { communityId, ...r } of allLinks) {
    const list = regionalsByCommunity.get(communityId) ?? [];
    list.push(r);
    regionalsByCommunity.set(communityId, list);
  }

  return rows
    .map((r) => rowToCommunity(r, byCommunity.get(r.id) ?? [], regionalsByCommunity.get(r.id) ?? []))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ---------- regionals -----------------------------------------------------

export interface Regional extends CommunityRegional {
  /** Every community this regional is copied on. */
  communityIds: string[];
}

export async function listRegionals(): Promise<Regional[]> {
  const rows = await db.select().from(regionalsTable);
  if (rows.length === 0) return [];
  const links = await db.select().from(regionalCommunities);
  const byRegional = new Map<string, string[]>();
  for (const l of links) {
    const list = byRegional.get(l.regionalId) ?? [];
    list.push(l.communityId);
    byRegional.set(l.regionalId, list);
  }
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      title: r.title,
      communityIds: byRegional.get(r.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addRegional(data: {
  name: string;
  email: string;
  title?: string | null;
  communityIds: string[];
}): Promise<Regional> {
  const [row] = await db
    .insert(regionalsTable)
    .values({ name: data.name, email: data.email, title: data.title?.trim() || null })
    .returning();
  await setRegionalCommunities(row.id, data.communityIds);
  return { id: row.id, name: row.name, email: row.email, title: row.title, communityIds: data.communityIds };
}

export async function updateRegional(
  id: string,
  data: { name?: string; email?: string; title?: string | null; communityIds?: string[] },
): Promise<Regional | null> {
  const patch: Partial<typeof regionalsTable.$inferInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.email !== undefined) patch.email = data.email;
  if (data.title !== undefined) patch.title = data.title?.trim() || null;
  const [row] = Object.keys(patch).length
    ? await db.update(regionalsTable).set(patch).where(eq(regionalsTable.id, id)).returning()
    : await db.select().from(regionalsTable).where(eq(regionalsTable.id, id)).limit(1);
  if (!row) return null;
  if (data.communityIds !== undefined) await setRegionalCommunities(id, data.communityIds);
  const links = await db
    .select({ communityId: regionalCommunities.communityId })
    .from(regionalCommunities)
    .where(eq(regionalCommunities.regionalId, id));
  return { id: row.id, name: row.name, email: row.email, title: row.title, communityIds: links.map((l) => l.communityId) };
}

export async function deleteRegional(id: string): Promise<boolean> {
  const result = await db.delete(regionalsTable).where(eq(regionalsTable.id, id)).returning({ id: regionalsTable.id });
  return result.length > 0;
}

/**
 * Replace a regional's coverage.
 *
 * Deleted then re-inserted rather than diffed: the driver has no interactive
 * transactions, the table holds nothing but the pair, so there is nothing to
 * lose in the gap and no cheaper correct version of this.
 */
export async function setRegionalCommunities(regionalId: string, communityIds: string[]): Promise<void> {
  await db.delete(regionalCommunities).where(eq(regionalCommunities.regionalId, regionalId));
  const unique = [...new Set(communityIds)];
  if (unique.length === 0) return;
  await db.insert(regionalCommunities).values(unique.map((communityId) => ({ regionalId, communityId })));
}

/**
 * Replace the set of regionals copied on one community's approvals.
 *
 * The same table read from the other side, because that is the side the
 * community page edits from: there the question is who covers this building,
 * not which buildings this person covers.
 */
export async function setCommunityRegionals(slug: string, regionalIds: string[]): Promise<boolean> {
  const [row] = await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, slug)).limit(1);
  if (!row) return false;
  await db.delete(regionalCommunities).where(eq(regionalCommunities.communityId, row.id));
  const unique = [...new Set(regionalIds)];
  if (unique.length) {
    await db.insert(regionalCommunities).values(unique.map((regionalId) => ({ regionalId, communityId: row.id })));
  }
  return true;
}

/**
 * The two addresses that are not the signature: who approves, and what
 * HubSpot sends as. Empty means "the primary sender", which is the answer
 * almost everywhere, so both are cleared by sending an empty string.
 */
export async function updateCommunityEmailRoles(
  slug: string,
  data: { approverEmail?: string | null; hubspotFromEmail?: string | null },
): Promise<boolean> {
  const patch: Partial<typeof communities.$inferInsert> = { updatedAt: new Date() };
  if (data.approverEmail !== undefined) patch.approverEmail = data.approverEmail?.trim() || null;
  if (data.hubspotFromEmail !== undefined) patch.hubspotFromEmail = data.hubspotFromEmail?.trim() || null;
  const result = await db.update(communities).set(patch).where(eq(communities.slug, slug)).returning({ id: communities.id });
  return result.length > 0;
}

// ---------- sender CRUD ---------------------------------------------------

export async function addSender(
  communityId: string,
  data: { name: string; email?: string | null; title?: string; isPrimary: boolean }
): Promise<CommunitySender> {
  if (data.isPrimary) {
    await db.update(communitySenders).set({ isPrimary: false }).where(eq(communitySenders.communityId, communityId));
  }
  const [row] = await db
    .insert(communitySenders)
    .values({ communityId, name: data.name, email: data.email?.trim() || null, title: data.title ?? null, isPrimary: data.isPrimary })
    .returning();
  return rowToSender(row);
}

export async function updateSender(
  id: string,
  communityId: string,
  data: { name?: string; email?: string | null; title?: string | null; isPrimary?: boolean }
): Promise<CommunitySender | null> {
  if (data.isPrimary) {
    await db.update(communitySenders).set({ isPrimary: false }).where(eq(communitySenders.communityId, communityId));
  }
  const patch: Partial<typeof communitySenders.$inferInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  // An address cleared in the form arrives as "", which means remove it.
  if (data.email !== undefined) patch.email = data.email?.trim() || null;
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
    trackingPhone?: string | null;
    websiteUrl?: string | null;
  }
): Promise<boolean> {
  const patch: Partial<typeof communities.$inferInsert> = { updatedAt: new Date() };
  if (data.displayName !== undefined) patch.displayName = data.displayName;
  if ("address" in data) patch.address = data.address;
  if ("trackingPhone" in data) patch.trackingPhone = data.trackingPhone;
  if ("websiteUrl" in data) patch.websiteUrl = data.websiteUrl;
  const result = await db
    .update(communities)
    .set(patch)
    .where(eq(communities.slug, slug))
    .returning({ id: communities.id });
  return result.length > 0;
}

/**
 * The community's Facebook page.
 *
 * Kept in the socials object it belongs to rather than given a column of its
 * own, and merged rather than replaced so setting it cannot drop the other
 * networks. Empty clears it.
 */
export async function setCommunityFacebookUrl(slug: string, url: string | null): Promise<boolean> {
  const [row] = await db
    .select({ socials: communities.socials })
    .from(communities)
    .where(eq(communities.slug, slug))
    .limit(1);
  if (!row) return false;
  const socials = { ...(row.socials ?? {}) };
  const trimmed = url?.trim();
  if (trimmed) socials.facebook = trimmed;
  else delete socials.facebook;
  const result = await db
    .update(communities)
    .set({ socials, updatedAt: new Date() })
    .where(eq(communities.slug, slug))
    .returning({ id: communities.id });
  return result.length > 0;
}

/**
 * The events tab of a community's Facebook page.
 *
 * Built rather than stored, so there is one thing to keep up to date. Copes
 * with a page given without a scheme, and with one that already points at its
 * own events.
 */
export function facebookEventsUrl(facebook: string | null | undefined): string | null {
  const raw = (facebook ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const base = withScheme.replace(/\/+$/, "");
  return /\/events\/?$/i.test(base) ? base : `${base}/events`;
}

/**
 * Partial update of a community's brand palette/typography — the fields
 * editable via the Community page's Brand panel. Read-modify-write against
 * the existing `brand` JSONB so unrelated sub-fields (paletteSource,
 * fontsSource, textOnPrimary/Accent, fonts) are never touched. These values
 * are exclusively user-edited from this point on — the seed script must
 * never overwrite them (see lib/db/seed.ts's brand-merge logic).
 */
export async function updateCommunityBrand(
  slug: string,
  patch: Partial<Pick<CommunityBrand, "primary" | "accent" | "background" | "secondary" | "supporting" | "fontHeadline" | "fontBody">>
): Promise<boolean> {
  const rows = await db.select({ id: communities.id, brand: communities.brand }).from(communities).where(eq(communities.slug, slug)).limit(1);
  if (rows.length === 0) return false;
  const current = (rows[0].brand ?? {}) as CommunityBrand;
  const merged: CommunityBrand = { ...current, ...patch };
  const result = await db
    .update(communities)
    .set({ brand: merged, updatedAt: new Date() })
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

