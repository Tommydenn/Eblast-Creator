// Applies every .sql file under lib/db/migrations, in name order, against the
// Postgres URL in .env.local.
//
//   tsx lib/db/apply-migrations.ts              apply what has not been applied
//   tsx lib/db/apply-migrations.ts --dry-run    print what would run, change nothing
//   tsx lib/db/apply-migrations.ts --baseline   record every file as applied
//                                               without running it
//
// Two things had to be true for this to work on a database that is already in
// use, and neither was:
//
// A file may hold more than one statement. The connection sends each one as a
// prepared statement and Postgres takes exactly one command in one of those,
// so a file has to be cut into its statements first. 0011 holds three, which
// is where this used to stop, taking every later file down with it.
//
// A file that has run must not run again. Most of them are written with IF
// NOT EXISTS and would survive it, but 0017 copies rows out of a table it then
// drops: harmless once, an error forever after. So applied files are recorded
// in a table and skipped, and --baseline is how a database that was migrated
// by hand says it is already up to date.

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { splitStatements } from "./split-sql";

const MIGRATIONS_DIR = join(process.cwd(), "lib", "db", "migrations");
const LEDGER = `CREATE TABLE IF NOT EXISTS applied_migrations (
  file       text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

/** Re-running an idempotent statement is a skip, not a failure. */
function isHarmless(message: string): boolean {
  return (
    message.includes("already exists") ||
    message.includes("duplicate object") ||
    message.includes("already a primary key")
  );
}

const firstLine = (s: string) =>
  (s.split("\n").find((l) => l.trim() && !l.trim().startsWith("--")) ?? s).trim().slice(0, 90);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const baseline = process.argv.includes("--baseline");
  if (dryRun && baseline) throw new Error("--dry-run and --baseline do not go together");

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    console.log("No migration files found in", MIGRATIONS_DIR);
    return;
  }

  if (dryRun) {
    // Nothing is created and nothing is read, so this works against a database
    // that is unreachable or does not exist yet.
    let total = 0;
    for (const file of files) {
      const statements = splitStatements(readFileSync(join(MIGRATIONS_DIR, file), "utf-8"));
      total += statements.length;
      console.log(`\n${file}  (${statements.length} statement${statements.length === 1 ? "" : "s"})`);
      for (const s of statements) console.log(`    ${firstLine(s)}`);
    }
    console.log(`\n${files.length} files, ${total} statements. Nothing was run.`);
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const sql = neon(process.env.DATABASE_URL);

  await sql.query(LEDGER);
  const done = new Set(
    ((await sql.query("SELECT file FROM applied_migrations")) as Array<{ file: string }>).map((r) => r.file),
  );

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) {
      console.log(`  --   ${file}  (already applied)`);
      continue;
    }
    if (baseline) {
      await sql.query("INSERT INTO applied_migrations (file) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
      console.log(`  mark ${file}`);
      applied++;
      continue;
    }

    console.log(`\n=== ${file} ===`);
    for (const statement of splitStatements(readFileSync(join(MIGRATIONS_DIR, file), "utf-8"))) {
      try {
        await sql.query(statement);
        console.log(`  ok   ${firstLine(statement)}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isHarmless(msg)) {
          console.log(`  skip ${firstLine(statement)}  (already there)`);
        } else {
          console.error(`  FAIL ${firstLine(statement)}`);
          console.error(`       ${msg}`);
          // The file is left unrecorded, so a re-run picks up where this
          // stopped rather than skipping the half that never ran.
          throw e;
        }
      }
    }
    await sql.query("INSERT INTO applied_migrations (file) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
    applied++;
  }

  console.log(
    applied === 0
      ? "\nNothing to do — every migration is already applied."
      : `\n${applied} migration${applied === 1 ? "" : "s"} ${baseline ? "recorded" : "applied"}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
