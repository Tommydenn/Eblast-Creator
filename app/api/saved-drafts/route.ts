import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

const MAX_PER_COMMUNITY = 8;

// GET /api/saved-drafts?communitySlug=X  — filter by community (omit for all)
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
        data: savedDrafts.data,
      })
      .from(savedDrafts)
      .orderBy(desc(savedDrafts.savedAt));
    const rawRows = slug
      ? await query.where(eq(savedDrafts.communitySlug, slug))
      : await query;
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

    // Enforce the per-community cap — delete oldest if over limit.
    const existing = await db
      .select({ id: savedDrafts.id })
      .from(savedDrafts)
      .where(eq(savedDrafts.communitySlug, communitySlug))
      .orderBy(desc(savedDrafts.savedAt));
    if (existing.length > MAX_PER_COMMUNITY) {
      const toDelete = existing.slice(MAX_PER_COMMUNITY).map((r) => r.id);
      await db.delete(savedDrafts).where(inArray(savedDrafts.id, toDelete));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[saved-drafts POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
