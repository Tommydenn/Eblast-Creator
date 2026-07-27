// One-shot fix: the past-sends mapping heuristic matches on the first
// community displayName found as a substring in the subject. "Exciting News:
// Amira Minnetonka Villas Now Complete!" contains "Amira Minnetonka" as a
// contiguous substring (word order: "Minnetonka Villas"), so it matched
// amira-minnetonka instead of amira-villas-minnetonka (whose displayName is
// "Amira Villas Minnetonka" — different word order, so it never matched).
// This re-points that one row to the correct community.
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { eq, and, ilike } from "drizzle-orm";
import { db } from "../lib/db/index";
import { communities, pastSends } from "../lib/db/schema";

async function main() {
  const [wrong] = await db.select().from(communities).where(eq(communities.slug, "amira-minnetonka")).limit(1);
  const [right] = await db.select().from(communities).where(eq(communities.slug, "amira-villas-minnetonka")).limit(1);
  if (!wrong || !right) throw new Error("Could not find one or both communities.");

  const rows = await db
    .select()
    .from(pastSends)
    .where(and(eq(pastSends.communityId, wrong.id), ilike(pastSends.subject, "%Villas%")));

  console.log(`Found ${rows.length} misattributed row(s):`);
  for (const r of rows) console.log(`  · "${r.subject}" (hubspotEmailId=${r.hubspotEmailId})`);

  if (rows.length === 0) {
    console.log("Nothing to fix.");
    process.exit(0);
  }

  for (const r of rows) {
    await db.update(pastSends).set({ communityId: right.id }).where(eq(pastSends.id, r.id));
  }
  console.log(`\nRe-pointed ${rows.length} row(s) to amira-villas-minnetonka.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
