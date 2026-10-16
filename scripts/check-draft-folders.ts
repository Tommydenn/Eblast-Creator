/**
 * Checks that every draft lands in exactly one folder, and the right one.
 *
 * The folder rules decide three separate things — what the list shows, what
 * the tab counts say, and what the nightly tidy-up may move — so a draft that
 * falls between them would be invisible in one place and acted on in another.
 * This runs the real rules over the real drafts and reports where everything
 * sits.
 *
 *   npx tsx scripts/check-draft-folders.ts
 */
import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import {
  DRAFT_FOLDERS,
  FOLDER_LABELS,
  STATUS_LABELS,
  folderFor,
  statusFor,
  type DraftFolder,
  type DraftState,
} from "@/lib/draft-folders";

const sql = neon(process.env.DATABASE_URL!);
const failures: string[] = [];

/** Every shape a draft can be in, and where each belongs. */
const CASES: Array<[string, DraftState, DraftFolder]> = [
  ["schedule wrote it, untouched", { fromPlanner: true }, "pending"],
  ["schedule wrote it, opened", { fromPlanner: true, openedAt: new Date() }, "in-progress"],
  ["made by hand", { fromPlanner: false, openedAt: new Date() }, "in-progress"],
  ["out for approval", { fromPlanner: true, openedAt: new Date(), awaitingApproval: true }, "waiting"],
  ["changes requested", { fromPlanner: false, openedAt: new Date(), changesRequested: true }, "waiting"],
  ["approval ran out", { fromPlanner: false, openedAt: new Date(), approvalExpired: true }, "waiting"],
  ["pushed", { fromPlanner: true, openedAt: new Date(), pushedAt: new Date() }, "done"],
  ["approved", { fromPlanner: true, openedAt: new Date(), approvedAt: new Date() }, "done"],
  ["pushed, then archived", { fromPlanner: false, pushedAt: new Date(), archivedAt: new Date() }, "archived"],
  ["archived, then deleted", { fromPlanner: false, archivedAt: new Date(), deletedAt: new Date() }, "deleted"],
  // A draft out for approval that then gets pushed is done, not waiting: the
  // thing being waited for has happened by another route.
  ["out for approval, then pushed", { fromPlanner: false, awaitingApproval: true, pushedAt: new Date() }, "done"],
];

for (const [name, state, want] of CASES) {
  const got = folderFor(state);
  if (got !== want) failures.push(`${name}: landed in ${got}, expected ${want}`);
  // Whatever the folder, the status has to be a thing we have words for.
  const status = statusFor(state);
  if (!STATUS_LABELS[status]) failures.push(`${name}: status ${status} has no label`);
}

// Nothing may say "sent" except sent for approval.
for (const [status, label] of Object.entries(STATUS_LABELS)) {
  if (/\bsent\b/i.test(label) && status !== "sent-for-approval") {
    failures.push(`the label for ${status} says "sent", which only ever means sent for approval`);
  }
  if (/publish/i.test(label)) failures.push(`the label for ${status} mentions publishing, which the app does not act on`);
}

async function main() {
  const rows: any[] = await sql`
    select d.id, d.community_slug, d.subject,
           d.opened_at, d.pushed_at, d.approved_at, d.archived_at, d.deleted_at,
           (p.task_id is not null) as from_planner
    from saved_drafts d
    left join planner_tasks p on p.saved_draft_id = d.id`;

  const tally: Record<string, number> = {};
  for (const f of DRAFT_FOLDERS) tally[f] = 0;

  for (const r of rows) {
    const folder = folderFor({
      fromPlanner: !!r.from_planner,
      openedAt: r.opened_at,
      pushedAt: r.pushed_at,
      approvedAt: r.approved_at,
      archivedAt: r.archived_at,
      deletedAt: r.deleted_at,
    });
    tally[folder]++;
    // Every draft lands somewhere, and a live one is never filed as deleted.
    if (!DRAFT_FOLDERS.includes(folder)) failures.push(`${r.id} landed in "${folder}", which is not a folder`);
    if (folder === "deleted" && !r.deleted_at) failures.push(`${r.id} is filed as deleted but was never deleted`);
  }

  console.log(`${rows.length} drafts, by folder:\n`);
  for (const f of DRAFT_FOLDERS) console.log(`  ${FOLDER_LABELS[f].padEnd(14)} ${tally[f]}`);

  // Done should hold roughly one per community once the tidy-up has run; it
  // is reported rather than asserted, since the tidy-up runs nightly.
  const done = rows.filter(
    (r) => !r.deleted_at && !r.archived_at && (r.pushed_at || r.approved_at),
  );
  const communities = new Set(done.map((r) => r.community_slug));
  console.log(`\nDone holds ${done.length} drafts across ${communities.size} communities.`);
  console.log(`The nightly tidy-up will retire ${done.length - communities.size} of them, keeping the newest for each.`);

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nAll ${CASES.length} shapes file correctly, and no label says "sent" except sent for approval.`);
}

main();
