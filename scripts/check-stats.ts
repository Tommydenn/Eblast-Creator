import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const top = await sql`
    SELECT
      c.slug,
      ps.subject,
      ps.recipient_count,
      ps.open_count,
      ROUND((ps.open_count::numeric / NULLIF(ps.recipient_count, 0)) * 100, 1) as open_pct,
      ps.click_count,
      ROUND((ps.click_count::numeric / NULLIF(ps.recipient_count, 0)) * 100, 1) as click_pct
    FROM past_sends ps
    JOIN communities c ON ps.community_id = c.id
    WHERE ps.state = 'PUBLISHED' AND ps.recipient_count > 0
    ORDER BY open_pct DESC NULLS LAST
    LIMIT 10
  `;
  console.log("Top 10 by open %:");
  console.log(JSON.stringify(top, null, 2));

  const summary = await sql`
    SELECT
      c.slug,
      COUNT(*)::int as sends,
      ROUND(AVG(ps.recipient_count)::numeric) as avg_recipients,
      ROUND(AVG((ps.open_count::numeric / NULLIF(ps.recipient_count, 0)) * 100)::numeric, 1) as avg_open_pct,
      ROUND(AVG((ps.click_count::numeric / NULLIF(ps.recipient_count, 0)) * 100)::numeric, 2) as avg_click_pct
    FROM past_sends ps
    JOIN communities c ON ps.community_id = c.id
    WHERE ps.state = 'PUBLISHED' AND ps.recipient_count > 0
    GROUP BY c.slug
    ORDER BY sends DESC
  `;
  console.log("\nPer-community summary (PUBLISHED only):");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
