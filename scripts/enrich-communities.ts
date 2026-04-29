// CLI: read each community's past sends and fill in missing community
// fields (tracking phone, website, email, senders, optionally address).
//
// Usage:
//   npx tsx scripts/enrich-communities.ts                       # all communities, regex only
//   npx tsx scripts/enrich-communities.ts --address              # also Claude-extract address
//   npx tsx scripts/enrich-communities.ts --slug=caretta-bellevue
//   npx tsx scripts/enrich-communities.ts --force               # overwrite even existing values

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { enrichAllCommunities, enrichCommunity } from "../lib/community-enricher";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const extractAddress = args.includes("--address");
  const slugArg = args.find((a) => a.startsWith("--slug="));
  const slug = slugArg ? slugArg.replace("--slug=", "") : null;

  if (slug) {
    console.log(`Enriching ${slug}${force ? " (force)" : ""}${extractAddress ? " (+address)" : ""}...`);
    const r = await enrichCommunity({ slug, force, extractAddress, log: (m) => console.log(m) });
    console.log("\n=== Result ===");
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  console.log(`Enriching all communities${force ? " (force)" : ""}${extractAddress ? " (+address)" : ""}...\n`);
  const results = await enrichAllCommunities({ force, extractAddress });

  console.log("\n=== Summary ===");
  let totalUpdated = 0;
  for (const r of results) {
    if (r.fieldsUpdated.length > 0) {
      totalUpdated++;
      console.log(`  ${r.slug}: ${r.fieldsUpdated.join(", ")}`);
    }
  }
  console.log(`\n  ${totalUpdated}/${results.length} communities updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Enrichment failed:", e);
    process.exit(1);
  });
