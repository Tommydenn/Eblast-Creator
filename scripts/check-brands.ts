import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { db } from "../lib/db/index";
import { communities } from "../lib/db/schema";

async function main() {
  const rows = await db.select({ slug: communities.slug, brand: communities.brand }).from(communities);
  for (const r of rows) {
    const b = r.brand as unknown as Record<string, string>;
    console.log(`${r.slug.padEnd(35)} primary=${b?.primary}  accent=${b?.accent}  src=${b?.paletteSource}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
