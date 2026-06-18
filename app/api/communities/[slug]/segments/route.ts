import { NextRequest, NextResponse } from "next/server";
import { updateCommunitySegments } from "@/lib/db/queries";

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const body = await req.json();
  const { includedListIds, excludedListIds } = body;
  if (!Array.isArray(includedListIds) || !Array.isArray(excludedListIds)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const ok = await updateCommunitySegments(
    params.slug,
    includedListIds.map(Number),
    excludedListIds.map(Number)
  );
  if (!ok) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
