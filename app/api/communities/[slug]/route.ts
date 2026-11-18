import { NextRequest, NextResponse } from "next/server";
import {
  updateCommunityContact,
  updateCommunityBrand,
  updateCommunityEmailRoles,
  setCommunityRegionals,
  setCommunityFacebookUrl,
} from "@/lib/db/queries";
import type { Address, CommunityBrand } from "@/lib/db/schema";

const CONTACT_ALLOWED = [
  "displayName",
  "address",
  "eventsAddress",
  "useEventsAddress",
  "trackingPhone",
  "websiteUrl",
];
/** The two addresses that are not the signature. Empty string clears them. */
const ROLES_ALLOWED = ["approverEmail", "hubspotFromEmail"];
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
      eventsAddress?: Address;
      useEventsAddress?: boolean;
      trackingPhone?: string | null;
      websiteUrl?: string | null;
    });
    if (!ok) return NextResponse.json({ error: "Community not found" }, { status: 404 });
    updatedSomething = true;
  }

  const rolesData: Record<string, unknown> = {};
  for (const key of ROLES_ALLOWED) {
    if (key in body) rolesData[key] = body[key];
  }
  if (Object.keys(rolesData).length > 0) {
    const ok = await updateCommunityEmailRoles(params.slug, rolesData as {
      approverEmail?: string | null;
      hubspotFromEmail?: string | null;
    });
    if (!ok) return NextResponse.json({ error: "Community not found" }, { status: 404 });
    updatedSomething = true;
  }

  // Empty clears it, so this too is checked by the key being present.
  if ("facebookUrl" in body) {
    const ok = await setCommunityFacebookUrl(params.slug, body.facebookUrl ?? null);
    if (!ok) return NextResponse.json({ error: "Community not found" }, { status: 404 });
    updatedSomething = true;
  }

  // An empty array is a real answer here — nobody copied — so this is checked
  // by the key being present rather than by the array having anything in it.
  if (Array.isArray(body.regionalIds)) {
    const ok = await setCommunityRegionals(params.slug, body.regionalIds as string[]);
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
