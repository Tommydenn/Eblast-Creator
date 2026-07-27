// One-shot, additive-only update: flags the 7 Amira communities (excluding
// Amira Choice, a different brand family that stays on the Great Lakes
// account) with hubspot.account = "amira", so eblast pushes for them route
// to the Amira HubSpot portal's Private App token instead of the default.
//
// Deliberately does NOT touch seed.ts's normal upsert path (which replaces
// the whole `hubspot` JSONB blob) — merges only the `account` key into each
// row's existing hubspot config via `hubspot || patch::jsonb`, the same
// pattern lib/db/queries.ts's updateCommunitySegments() already uses, so any
// listId/includedListIds/excludedListIds already on these rows are preserved.
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { sql, eq, inArray } from "drizzle-orm";
import { db } from "../lib/db/index";
import { communities } from "../lib/db/schema";

const AMIRA_ACCOUNT_SLUGS = [
  "amira-corcoran",
  "amira-minnetonka",
  "amira-villas-minnetonka",
  "amira-lowry",
  "amira-lake-elmo",
  "amira-bloomington",
  "amira-roseville",
];

async function main() {
  const before = await db
    .select({ slug: communities.slug, hubspot: communities.hubspot })
    .from(communities)
    .where(inArray(communities.slug, AMIRA_ACCOUNT_SLUGS));

  if (before.length !== AMIRA_ACCOUNT_SLUGS.length) {
    const found = new Set(before.map((r) => r.slug));
    const missing = AMIRA_ACCOUNT_SLUGS.filter((s) => !found.has(s));
    throw new Error(`Missing expected community rows: ${missing.join(", ")}`);
  }

  console.log("Before:");
  for (const r of before) console.log(`  ${r.slug.padEnd(30)} ${JSON.stringify(r.hubspot)}`);

  const patch = JSON.stringify({ account: "amira" });
  await db
    .update(communities)
    .set({ hubspot: sql`hubspot || ${patch}::jsonb`, updatedAt: new Date() })
    .where(inArray(communities.slug, AMIRA_ACCOUNT_SLUGS));

  const after = await db
    .select({ slug: communities.slug, hubspot: communities.hubspot })
    .from(communities)
    .where(inArray(communities.slug, AMIRA_ACCOUNT_SLUGS));

  console.log("\nAfter:");
  for (const r of after) console.log(`  ${r.slug.padEnd(30)} ${JSON.stringify(r.hubspot)}`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
