// One-shot seed runner. Idempotent — safe to run multiple times.
// Usage: `npm run db:seed`.

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { eq } from "drizzle-orm";
import { db } from "./index";
import { communities, communitySenders, type CommunityBrand } from "./schema";
import { seedCommunities } from "./seed-data";

// Brand sub-fields the Community page lets a user edit directly — once a
// community exists, re-seeding must never overwrite these (see BrandPanel.tsx).
const USER_OWNED_BRAND_FIELDS = ["primary", "accent", "background", "secondary", "supporting", "fontHeadline", "fontBody"] as const;

async function main() {
  console.log(`Seeding ${seedCommunities.length} communities...`);

  for (const { community, senders } of seedCommunities) {
    // Upsert community by slug.
    const existing = await db
      .select({ id: communities.id, brand: communities.brand })
      .from(communities)
      .where(eq(communities.slug, community.slug))
      .limit(1);

    let communityId: string;
    const isNew = existing.length === 0;
    if (!isNew) {
      communityId = existing[0].id;
      // Exclude user-editable contact fields from seed updates so manual
      // changes made through the UI are never overwritten.
      const { displayName, address, trackingPhone, websiteUrl, brand, ...seedFields } = community;
      void displayName; void address; void trackingPhone; void websiteUrl;

      // Brand: keep whatever the user has already set for the editable
      // sub-fields; only let seed data fill in fields still unset.
      const existingBrand = (existing[0].brand ?? {}) as CommunityBrand;
      const mergedBrand = { ...brand } as Record<string, unknown>;
      for (const key of USER_OWNED_BRAND_FIELDS) {
        if (existingBrand[key] !== undefined) {
          mergedBrand[key] = existingBrand[key];
        }
      }

      await db.update(communities).set({ ...seedFields, brand: mergedBrand as unknown as CommunityBrand, updatedAt: new Date() }).where(eq(communities.id, communityId));
      console.log(`  updated  ${community.slug}`);
    } else {
      const inserted = await db.insert(communities).values(community).returning({ id: communities.id });
      communityId = inserted[0].id;
      console.log(`  inserted ${community.slug}`);
    }

    // Senders: only seed on first insert. For existing communities, senders are
    // managed through the UI and must not be overwritten by the seed.
    if (isNew && senders.length > 0) {
      const anyPrimary = senders.some((s) => s.isPrimary);
      const senderRows = senders.map((s, i) => ({
        communityId,
        name: s.name,
        email: s.email,
        title: s.title ?? null,
        isPrimary: s.isPrimary ?? (!anyPrimary && i === 0),
      }));
      await db.insert(communitySenders).values(senderRows);
    }
  }

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
