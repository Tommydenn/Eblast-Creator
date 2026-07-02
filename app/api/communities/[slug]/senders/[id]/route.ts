import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { communities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateSender, deleteSender } from "@/lib/db/queries";

export const runtime = "nodejs";

async function getCommunityId(slug: string): Promise<string | null> {
  const [row] = await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, slug)).limit(1);
  return row?.id ?? null;
}

/** PUT /api/communities/[slug]/senders/[id] — update a sender */
export async function PUT(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const communityId = await getCommunityId(params.slug);
  if (!communityId) return NextResponse.json({ ok: false, error: "Community not found" }, { status: 404 });

  let body: { name?: string; email?: string; title?: string | null; isPrimary?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const sender = await updateSender(params.id, communityId, {
    name: body.name?.trim(),
    email: body.email?.trim(),
    title: body.title !== undefined ? (body.title?.trim() || null) : undefined,
    isPrimary: body.isPrimary,
  });

  if (!sender) return NextResponse.json({ ok: false, error: "Sender not found" }, { status: 404 });
  return NextResponse.json({ ok: true, sender });
}

/** DELETE /api/communities/[slug]/senders/[id] — remove a sender */
export async function DELETE(_req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const deleted = await deleteSender(params.id);
  if (!deleted) return NextResponse.json({ ok: false, error: "Sender not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
