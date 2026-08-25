/**
 * One-time cleanup: point repeated photos at the single row that stores them.
 *
 * A photo placed without cropping is byte-identical in its "as shown" and
 * "original" rows, and every placed photo also has an identical copy in the
 * flyer pool it was picked from. Saves made from now on deduplicate as they
 * write (see lib/image-bank); this brings existing drafts to the same state.
 *
 * Deliberately conservative:
 *   - Rows are only ever REWRITTEN to a pointer, never deleted.
 *   - Only exact duplicates within one draft are touched (same length and
 *     same checksum), and the keeper is always the copy that loads earliest,
 *     so a pointer never depends on a row that arrives later.
 *   - Every draft is verified after writing: each index must still resolve to
 *     the same checksum it had before. A draft that fails verification is
 *     rolled back and reported.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npx tsx scripts/dedupe-image-bank.mts
 *   npx tsx scripts/dedupe-image-bank.mts --apply
 */
import fs from "fs";
import crypto from "crypto";

const env = fs.readFileSync(".env.local", "utf8");
process.env.DATABASE_URL = env.match(/DATABASE_URL=(.*)/)![1].trim().replace(/^["']|["']$/g, "");
const { imagePhase, IMAGE_REF_PREFIX } = await import("../lib/image-bank");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL!);

const APPLY = process.argv.includes("--apply");
const MB = (n: number) => (n / 1048576).toFixed(1) + " MB";

type Row = { idx: number; h: string; len: number };

const drafts = await sql`SELECT DISTINCT draft_id FROM draft_image_bank ORDER BY draft_id`;
let totalFreed = 0, totalRows = 0, changedDrafts = 0, failed: string[] = [];

for (const { draft_id: id } of drafts as any[]) {
  const rows: Row[] = (await sql`
    SELECT idx, md5(url) h, length(url) len FROM draft_image_bank WHERE draft_id=${id}
  `) as any[];

  const before = new Map(rows.map((r) => [r.idx, r.h]));
  const stored = rows.filter((r) => r.len > 20); // pointers are a few characters

  // Keeper = the copy that loads earliest, matching dedupeImageRows().
  const keeper = new Map<string, number>();
  for (const r of [...stored].sort((a, b) => imagePhase(a.idx) - imagePhase(b.idx) || a.idx - b.idx)) {
    const key = `${r.h}:${r.len}`;
    if (!keeper.has(key)) keeper.set(key, r.idx);
  }

  const changes = stored
    .map((r) => ({ r, to: keeper.get(`${r.h}:${r.len}`)! }))
    .filter(({ r, to }) => to !== r.idx);

  if (changes.length === 0) continue;
  changedDrafts++;
  const freed = changes.reduce((a, c) => a + c.r.len, 0);
  totalFreed += freed;
  totalRows += changes.length;
  console.log(`${id}: ${changes.length} duplicate row(s), ${MB(freed)} recovered  [${changes.map((c) => `${c.r.idx}->${c.to}`).join(" ")}]`);

  if (!APPLY) continue;

  for (const { r, to } of changes) {
    await sql`UPDATE draft_image_bank SET url=${IMAGE_REF_PREFIX + to} WHERE draft_id=${id} AND idx=${r.idx}`;
  }

  // Verify: every index must still resolve to exactly the checksum it had.
  const after: Array<{ idx: number; url: string }> = (await sql`
    SELECT idx, url FROM draft_image_bank WHERE draft_id=${id}
  `) as any[];
  const real = new Map(after.filter((r) => !r.url.startsWith(IMAGE_REF_PREFIX)).map((r) => [r.idx, r.url]));
  const bad: number[] = [];
  for (const r of after) {
    const url = r.url.startsWith(IMAGE_REF_PREFIX)
      ? real.get(Number(r.url.slice(IMAGE_REF_PREFIX.length)))
      : r.url;
    const h = url ? crypto.createHash("md5").update(url).digest("hex") : "missing";
    if (h !== before.get(r.idx)) bad.push(r.idx);
  }
  if (bad.length) {
    failed.push(id);
    console.log(`  VERIFY FAILED at ${bad.join(",")} — rolling back this draft`);
    for (const { r, to } of changes) {
      await sql`UPDATE draft_image_bank d SET url=s.url FROM draft_image_bank s
                WHERE d.draft_id=${id} AND d.idx=${r.idx} AND s.draft_id=${id} AND s.idx=${to}`;
    }
  }
}

console.log(
  `\n${APPLY ? "APPLIED" : "DRY RUN"}: ${totalRows} duplicate rows across ${changedDrafts} drafts, ${MB(totalFreed)} recovered.`,
);
if (failed.length) console.log(`ROLLED BACK (unchanged): ${failed.join(", ")}`);
else if (APPLY) console.log("Every draft verified: all photos resolve to exactly the same content as before.");
