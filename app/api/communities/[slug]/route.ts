import { NextRequest, NextResponse } from "next/server";
import { updateCommunityContact } from "@/lib/db/queries";
import type { Address } from "@/lib/db/schema";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const body = await req.json();

  const allowed = ["displayName", "address", "phone", "trackingPhone", "email", "websiteUrl"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const ok = await updateCommunityContact(params.slug, data as {
    displayName?: string;
    address?: Address;
    phone?: string | null;
    trackingPhone?: string | null;
    email?: string | null;
    websiteUrl?: string | null;
  });

  if (!ok) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
