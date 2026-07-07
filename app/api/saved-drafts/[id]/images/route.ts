import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draftImageBank } from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";

// GET /api/saved-drafts/[id]/images  — returns all images with their indices
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  try {
    const rows = await db
      .select({ idx: draftImageBank.idx, url: draftImageBank.url })
      .from(draftImageBank)
      .where(eq(draftImageBank.draftId, id))
      .orderBy(asc(draftImageBank.idx));
    return NextResponse.json({ ok: true, images: rows });
  } catch (err) {
    console.error("[saved-drafts/images GET]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// POST /api/saved-drafts/[id]/images  — upserts a batch of images by index
// Body: { images: Array<{ idx: number; url: string }> }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const body = await req.json().catch(() => null);
  if (!body?.images || !Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing images array" }, { status: 400 });
  }
  const images: Array<{ idx: number; url: string }> = body.images;
  try {
    await db
      .insert(draftImageBank)
      .values(images.map(({ idx, url }) => ({ draftId: id, idx, url })))
      .onConflictDoUpdate({
        target: [draftImageBank.draftId, draftImageBank.idx],
        set: { url: sql`excluded.url` },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[saved-drafts/images POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
