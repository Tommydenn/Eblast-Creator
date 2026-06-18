// Quick diagnostic: print brand values from the live database
import { config } from "dotenv";
config({ path: ".env.local", override: true });

const { db } = await import("../lib/db/index.ts");
const { communities } = await import("../lib/db/schema.ts");

const rows = await db.select({
  slug: communities.slug,
  brand: communities.brand,
}).from(communities);

for (const r of rows) {
  console.log(`\n${r.slug}`);
  console.log(`  primary:    ${r.brand?.primary}`);
  console.log(`  accent:     ${r.brand?.accent}`);
  console.log(`  background: ${r.brand?.background}`);
  console.log(`  source:     ${r.brand?.paletteSource}`);
}

process.exit(0);
