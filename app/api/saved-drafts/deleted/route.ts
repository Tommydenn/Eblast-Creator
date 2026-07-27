import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { desc, isNotNull } from "drizzle-orm";

// Always fetch fresh from the DB — without this, Next tries to statically
// prerender this route at build time and errors on the dynamic DB call
// (harmless, but noisy in build logs).
export const dynamic = "force-dynamic";

const PURGE_AFTER_DAYS = 30;

// GET /api/saved-drafts/deleted — the trash view. Same slim meta shape as the
// normal saved-drafts list, plus deletedAt and the computed purgeAt date the
// daily cron will hard-delete it on.
export async function GET() {
  try {
    const rows = await db
      .select({
        id: savedDrafts.id,
        communitySlug: savedDrafts.communitySlug,
        communityName: savedDrafts.communityName,
        savedAt: savedDrafts.savedAt,
        subject: savedDrafts.subject,
        imageCount: savedDrafts.imageCount,
        approvedAt: savedDrafts.approvedAt,
        deletedAt: savedDrafts.deletedAt,
        data: savedDrafts.data,
      })
      .from(savedDrafts)
      .where(isNotNull(savedDrafts.deletedAt))
      .orderBy(desc(savedDrafts.deletedAt));

    const drafts = rows.map(({ data, deletedAt, ...meta }) => ({
      ...meta,
      deletedAt,
      isNewFormat: !!(data as any)?.fields,
      purgeAt: new Date(deletedAt!.getTime() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    }));
    return NextResponse.json({ ok: true, drafts });
  } catch (err) {
    console.error("[saved-drafts/deleted GET]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
