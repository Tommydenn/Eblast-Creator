import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { eq, desc, inArray, isNull, and } from "drizzle-orm";

const MAX_PER_COMMUNITY = 8;

// GET /api/saved-drafts?communitySlug=X  — filter by community (omit for all)
// Only returns non-deleted drafts — see /api/saved-drafts/deleted for the trash view.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("communitySlug");
  try {
    const query = db
      .select({
        id: savedDrafts.id,
        communitySlug: savedDrafts.communitySlug,
        communityName: savedDrafts.communityName,
        savedAt: savedDrafts.savedAt,
        subject: savedDrafts.subject,
        imageCount: savedDrafts.imageCount,
        approvedAt: savedDrafts.approvedAt,
        data: savedDrafts.data,
      })
      .from(savedDrafts)
      .orderBy(desc(savedDrafts.savedAt));
    const rawRows = slug
      ? await query.where(and(eq(savedDrafts.communitySlug, slug), isNull(savedDrafts.deletedAt)))
      : await query.where(isNull(savedDrafts.deletedAt));
    const rows = rawRows.map(({ data, ...meta }) => ({
      ...meta,
      isNewFormat: !!(data as any)?.fields,
    }));
    return NextResponse.json({ ok: true, drafts: rows });
  } catch (err) {
    console.error("[saved-drafts GET]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// POST /api/saved-drafts  — saves a draft, enforces per-community cap
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.draft) {
    return NextResponse.json({ ok: false, error: "Missing draft" }, { status: 400 });
  }
  const { draft } = body;
  const { id, communitySlug, communityName, savedAt, subject, imageCount } = draft;
  if (!id || !communitySlug) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }
  try {
    await db.insert(savedDrafts)
      .values({
        id,
        communitySlug,
        communityName: communityName ?? communitySlug,
        savedAt: new Date(savedAt ?? Date.now()),
        subject: subject ?? "",
        imageCount: imageCount ?? 0,
        data: draft,
      })
      .onConflictDoUpdate({
        target: savedDrafts.id,
        set: {
          communitySlug,
          communityName: communityName ?? communitySlug,
          savedAt: new Date(savedAt ?? Date.now()),
          subject: subject ?? "",
          imageCount: imageCount ?? 0,
          data: draft,
        },
      });

    // Enforce the per-community cap — soft-delete (move to trash) the oldest
    // if over limit, same as a manual delete, so an auto-evicted draft is
    // still recoverable for 30 days rather than lost outright. Approved
    // drafts (a salesperson approved them via the approval email) are exempt
    // — they're a record of what actually went out, not work-in-progress.
    const existing = await db
      .select({ id: savedDrafts.id, approvedAt: savedDrafts.approvedAt })
      .from(savedDrafts)
      .where(and(eq(savedDrafts.communitySlug, communitySlug), isNull(savedDrafts.deletedAt)))
      .orderBy(desc(savedDrafts.savedAt));
    const evictionCandidates = existing.filter((r) => !r.approvedAt);
    if (evictionCandidates.length > MAX_PER_COMMUNITY) {
      const toDelete = evictionCandidates.slice(MAX_PER_COMMUNITY).map((r) => r.id);
      await db.update(savedDrafts).set({ deletedAt: new Date() }).where(inArray(savedDrafts.id, toDelete));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[saved-drafts POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
