// One-shot migration applier. Reads every .sql file under lib/db/migrations
// (sorted) and runs each statement against the Postgres URL in .env.local.
//
// Usage: `tsx lib/db/apply-migrations.ts`
//
// Idempotent statements (using IF NOT EXISTS) work cleanly on re-runs. Other
// failures (duplicate enum, etc.) are logged and skipped so partial migrations
// can complete.

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "lib", "db", "migrations");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }
  const sql = neon(process.env.DATABASE_URL);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found in", MIGRATIONS_DIR);
    return;
  }

  for (const file of files) {
    console.log(`\n=== Applying ${file} ===`);
    const contents = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");

    // Split on the Drizzle migration breakpoint marker, then on `;` for
    // individual statements within a block.
    const blocks = contents.split(/-->\s*statement-breakpoint/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      // Each block is one statement (DDL); run it directly.
      try {
        await sql.query(trimmed);
        const summary = trimmed.split("\n")[0].slice(0, 80);
        console.log(`  ok   ${summary}`);
      } catch (e: any) {
        const msg = e.message ?? String(e);
        // Idempotency: skip "already exists" errors. Anything else is a real bug.
        if (
          msg.includes("already exists") ||
          msg.includes("duplicate object") ||
          msg.includes("already a primary key")
        ) {
          const summary = trimmed.split("\n")[0].slice(0, 80);
          console.log(`  skip ${summary}  (already exists)`);
        } else {
          console.error(`  FAIL ${trimmed.split("\n")[0].slice(0, 80)}`);
          console.error(`       ${msg}`);
          throw e;
        }
      }
    }
  }
  console.log("\nAll migrations applied.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
