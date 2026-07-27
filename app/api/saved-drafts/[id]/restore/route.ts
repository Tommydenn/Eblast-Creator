import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST /api/saved-drafts/[id]/restore — un-deletes a draft (clears deletedAt),
// making it reappear in the normal Saved Drafts list with everything intact.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const result = await db
      .update(savedDrafts)
      .set({ deletedAt: null })
      .where(eq(savedDrafts.id, id))
      .returning({ id: savedDrafts.id });
    if (result.length === 0) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[saved-drafts/[id]/restore POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
