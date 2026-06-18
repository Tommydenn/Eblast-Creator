import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { db } from "../lib/db/index";
import { communities } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({ id: communities.id, slug: communities.slug, brand: communities.brand, createdAt: communities.createdAt })
    .from(communities)
    .where(eq(communities.slug, "global-pointe"));

  console.log(`global-pointe row count: ${rows.length}`);
  for (const r of rows) {
    const b = r.brand as Record<string, string>;
    console.log(`  id=${r.id}  primary=${b?.primary}  created=${r.createdAt?.toISOString()}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
