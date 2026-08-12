import { config } from "dotenv";
config({ path: ".env.local", override: true });
import { eq } from "drizzle-orm";
import { db } from "../lib/db/index";
import { savedDrafts } from "../lib/db/schema";
async function main() {
  const rows = await db.select({
    id: savedDrafts.id,
    subject: savedDrafts.subject,
    savedAt: savedDrafts.savedAt,
    deletedAt: savedDrafts.deletedAt,
    approvedAt: savedDrafts.approvedAt,
  }).from(savedDrafts).where(eq(savedDrafts.communitySlug, "hayden-grove-bloomington"));
  rows.sort((a,b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  for (const r of rows) {
    console.log(`${r.id} | savedAt=${r.savedAt} | deletedAt=${r.deletedAt} | approvedAt=${r.approvedAt} | "${r.subject}"`);
  }
  console.log("total:", rows.length, "non-deleted non-approved:", rows.filter(r=>!r.deletedAt && !r.approvedAt).length);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
