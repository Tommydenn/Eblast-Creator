import { NextRequest, NextResponse } from "next/server";
import { updateCommunityContact, updateCommunityBrand } from "@/lib/db/queries";
import type { Address, CommunityBrand } from "@/lib/db/schema";

const CONTACT_ALLOWED = ["displayName", "address", "trackingPhone", "websiteUrl"];
const BRAND_ALLOWED = ["primary", "accent", "background", "secondary", "supporting", "fontHeadline", "fontBody"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const body = await req.json();
  let updatedSomething = false;

  const contactData: Record<string, unknown> = {};
  for (const key of CONTACT_ALLOWED) {
    if (key in body) contactData[key] = body[key];
  }
  if (Object.keys(contactData).length > 0) {
    const ok = await updateCommunityContact(params.slug, contactData as {
      displayName?: string;
      address?: Address;
      trackingPhone?: string | null;
      websiteUrl?: string | null;
    });
    if (!ok) return NextResponse.json({ error: "Community not found" }, { status: 404 });
    updatedSomething = true;
  }

  if (body.brand && typeof body.brand === "object") {
    const brandData: Record<string, unknown> = {};
    for (const key of BRAND_ALLOWED) {
      if (key in body.brand) brandData[key] = body.brand[key];
    }
    if (Object.keys(brandData).length > 0) {
      const ok = await updateCommunityBrand(params.slug, brandData as Partial<CommunityBrand>);
      if (!ok) return NextResponse.json({ error: "Community not found" }, { status: 404 });
      updatedSomething = true;
    }
  }

  if (!updatedSomething) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
