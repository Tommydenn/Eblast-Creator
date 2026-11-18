import { NextRequest, NextResponse } from "next/server";
import { updateRegional, deleteRegional } from "@/lib/db/queries";

export const runtime = "nodejs";

/** PATCH /api/regionals/[id] — rename, re-address, or change coverage. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { name?: string; email?: string; title?: string | null; communityIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ ok: false, error: "name cannot be empty" }, { status: 400 });
  }
  if (body.email !== undefined && !body.email.trim()) {
    return NextResponse.json({ ok: false, error: "email cannot be empty" }, { status: 400 });
  }

  const regional = await updateRegional(params.id, {
    ...(body.name !== undefined ? { name: body.name.trim() } : {}),
    ...(body.email !== undefined ? { email: body.email.trim() } : {}),
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.communityIds !== undefined ? { communityIds: body.communityIds } : {}),
  });
  if (!regional) return NextResponse.json({ ok: false, error: "Regional not found" }, { status: 404 });
  return NextResponse.json({ ok: true, regional });
}

/** DELETE /api/regionals/[id] — remove them, and their coverage with them. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await deleteRegional(params.id);
  if (!ok) return NextResponse.json({ ok: false, error: "Regional not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
