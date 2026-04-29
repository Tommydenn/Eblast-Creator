// One-shot seed runner. Idempotent — safe to run multiple times.
// Usage: `npm run db:seed`.

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { eq } from "drizzle-orm";
import { db } from "./index";
import { communities, communitySenders } from "./schema";
import { seedCommunities } from "./seed-data";

async function main() {
  console.log(`Seeding ${seedCommunities.length} communities...`);

  for (const { community, senders } of seedCommunities) {
    // Upsert community by slug.
    const existing = await db
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.slug, community.slug))
      .limit(1);

    let communityId: string;
    if (existing.length > 0) {
      communityId = existing[0].id;
      await db.update(communities).set({ ...community, updatedAt: new Date() }).where(eq(communities.id, communityId));
      console.log(`  updated  ${community.slug}`);
    } else {
      const inserted = await db.insert(communities).values(community).returning({ id: communities.id });
      communityId = inserted[0].id;
      console.log(`  inserted ${community.slug}`);
    }

    // Replace senders for this community (drop and re-insert; senders are
    // small and the seed file is the source of truth).
    await db.delete(communitySenders).where(eq(communitySenders.communityId, communityId));
    if (senders.length > 0) {
      // Mark first sender as primary if none specified.
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
