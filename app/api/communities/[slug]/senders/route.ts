import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { communities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { addSender } from "@/lib/db/queries";

export const runtime = "nodejs";

/** POST /api/communities/[slug]/senders — add a sender to a community */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const [community] = await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, params.slug)).limit(1);
  if (!community) return NextResponse.json({ ok: false, error: "Community not found" }, { status: 404 });

  let body: { name: string; email?: string; title?: string; isPrimary?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Only the name is required. A sender can be on the record for the footer's
  // sign-off alone, with no address to show or send to.
  if (!body.name?.trim()) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  const sender = await addSender(community.id, {
    name: body.name.trim(),
    email: body.email?.trim() || null,
    title: body.title?.trim() || undefined,
    isPrimary: body.isPrimary ?? false,
  });

  return NextResponse.json({ ok: true, sender });
}
