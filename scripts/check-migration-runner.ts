/**
 * Checks that a .sql file is cut into statements the way Postgres reads it.
 *
 * The runner sends one statement per request, so where a file is cut decides
 * whether it runs at all. Splitting on every semicolon is what a careless
 * version does, and it is wrong the moment a semicolon appears inside a
 * string, a comment, or a function body — at which point two broken halves
 * are sent and the error names a line nobody wrote.
 *
 *   npx tsx scripts/check-migration-runner.ts
 */
import { readFileSync } from "node:fs";
import { splitStatements } from "@/lib/db/split-sql";

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

function expect(name: string, sql: string, count: number, contains?: string) {
  const parts = splitStatements(sql);
  if (parts.length !== count) {
    fail(`${name}: expected ${count} statement(s), got ${parts.length} — ${JSON.stringify(parts)}`);
    return;
  }
  if (contains && !parts.some((p) => p.includes(contains))) {
    fail(`${name}: no statement carries ${JSON.stringify(contains)}`);
  }
}

// ── The plain cases ───────────────────────────────────────────────────────
expect("one statement", "ALTER TABLE a ADD COLUMN b text;", 1);
expect("no trailing semicolon", "ALTER TABLE a ADD COLUMN b text", 1);
expect("three statements", "SELECT 1; SELECT 2; SELECT 3;", 3);
expect("blank between", "SELECT 1;\n\n\nSELECT 2;\n", 2);

// ── Semicolons that are not the end of anything ───────────────────────────
expect("inside a string", "UPDATE t SET a = 'x; y' WHERE b = 'c';", 1, "x; y");
expect("a doubled quote inside a string", "UPDATE t SET a = 'it''s; fine';", 1, "it''s; fine");
expect("inside a quoted name", 'ALTER TABLE "odd;name" ADD COLUMN b text;', 1, "odd;name");
expect("inside a line comment", "-- drop this; and that\nSELECT 1;", 1);
expect("inside a block comment", "/* a; b */ SELECT 1;", 1);
expect("inside a nested block comment", "/* a /* b; c */ d; */ SELECT 1;", 1);
expect(
  "inside a function body",
  "CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;",
  1,
  "RETURN 1;",
);
expect(
  "inside a tagged function body",
  "CREATE FUNCTION f() RETURNS int AS $body$ BEGIN RETURN 1; END; $body$ LANGUAGE plpgsql; SELECT 1;",
  2,
);

// ── Comments are not statements ───────────────────────────────────────────
expect("a file that is only a comment", "-- nothing to do here\n", 0);
expect("a trailing comment", "SELECT 1;\n-- that was all\n", 1);
expect("a leading comment stays with its statement", "-- why\nSELECT 1;", 1, "-- why");

// ── The file this was written for ─────────────────────────────────────────
{
  const sql = readFileSync("lib/db/migrations/0011_add_approval_push_tracking.sql", "utf-8");
  const parts = splitStatements(sql);
  if (parts.length !== 3) {
    fail(`0011 holds three statements, this found ${parts.length} — it is the file the runner used to die on`);
  }
  // The comment above it travels with it, so this looks inside rather than at the start.
  if (!parts[parts.length - 1]?.includes("UPDATE \"saved_draft_approvals\"")) {
    fail("0011's last statement should be the UPDATE that frees a half-claimed approval");
  }
}

// ── Every migration on file parses into something runnable ────────────────
{
  const dir = "lib/db/migrations";
  const files = require("node:fs").readdirSync(dir).filter((f: string) => f.endsWith(".sql"));
  for (const f of files) {
    const parts = splitStatements(readFileSync(`${dir}/${f}`, "utf-8"));
    if (parts.length === 0) fail(`${f} parses to no statements at all`);
    for (const p of parts) {
      if (p.endsWith(";")) fail(`${f} left a semicolon on the end of a statement`);
    }
  }
}

// ── What the runner does with them ────────────────────────────────────────
{
  const runner = readFileSync("lib/db/apply-migrations.ts", "utf-8");
  if (!runner.includes("splitStatements")) {
    fail("lib/db/apply-migrations.ts no longer cuts a file into statements");
  }
  // 0017 copies rows out of a table it then drops, so a second run of it is an
  // error rather than a no-op. The ledger is what stops that happening.
  if (!runner.includes("applied_migrations")) {
    fail("lib/db/apply-migrations.ts no longer records what it has applied, so a re-run would repeat 0017");
  }
  if (!runner.includes("--baseline")) {
    fail("lib/db/apply-migrations.ts no longer offers --baseline for a database migrated by hand");
  }
  if (!runner.includes("--dry-run")) {
    fail("lib/db/apply-migrations.ts no longer offers --dry-run");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "\nA semicolon ends a statement only outside strings, quoted names, comments\n" +
  "and function bodies; 0011 comes out as its three statements; every migration\n" +
  "on file parses; and the runner splits, records and can be rehearsed.",
);
process.exit(0);
