import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const byState = await sql`SELECT state, COUNT(*)::int as count FROM past_sends GROUP BY state ORDER BY count DESC`;
  console.log("By state:", byState);

  const sample = await sql`SELECT hubspot_email_id, subject, state, recipient_count, open_count, click_count FROM past_sends WHERE state = 'PUBLISHED' ORDER BY published_at DESC NULLS LAST LIMIT 5`;
  console.log("\nFirst 5 PUBLISHED:");
  console.log(JSON.stringify(sample, null, 2));

  const mapped = await sql`SELECT c.slug, COUNT(*)::int as count FROM past_sends ps LEFT JOIN communities c ON ps.community_id = c.id GROUP BY c.slug ORDER BY count DESC`;
  console.log("\nMapped per community:");
  console.log(JSON.stringify(mapped, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
