// CLI: pull last 365 days of BATCH_EMAIL marketing emails from HubSpot,
// map each to a community, fetch statistics, upsert into past_sends.
//
// Usage:
//   npx tsx scripts/sync-past-sends.ts                # full backfill
//   npx tsx scripts/sync-past-sends.ts --skip-stats   # faster, no stats
//   npx tsx scripts/sync-past-sends.ts --refresh-stats-only

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { syncPastSends } from "../lib/past-sends-sync";

async function main() {
  const args = process.argv.slice(2);
  const skipStats = args.includes("--skip-stats");
  const refreshStatsOnly = args.includes("--refresh-stats-only");

  console.log(
    `Sync mode: ${refreshStatsOnly ? "refresh stats only" : "full walk"}${skipStats ? " (no stats)" : ""}`,
  );

  const result = await syncPastSends({ skipStats, refreshStatsOnly, verbose: true });

  console.log("\n=== Sync result ===");
  console.log(`  Walked HubSpot list:   ${result.walked}`);
  console.log(`  Within 365-day window: ${result.inWindow}`);
  console.log(`  Upserted:              ${result.upserted}`);
  console.log(`  Mapped to community:   ${result.mapped}`);
  console.log(`  Unmapped:              ${result.unmapped}`);
  console.log(`  Stats fetched:         ${result.statsFetched}`);
  console.log(`  Stats errors:          ${result.statsErrors}`);
  console.log(`  Duration:              ${(result.durationMs / 1000).toFixed(1)}s`);

  if (result.unmappedSamples.length > 0) {
    console.log("\nUnmapped samples (first 10):");
    for (const u of result.unmappedSamples) {
      console.log(`  · "${u.subject ?? ""}" — from ${u.fromName ?? "?"} <${u.fromEmail ?? "?"}>`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exit(1);
  });
