import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/hubspot-office-locations
 *
 * Fetches the portal's configured office/physical addresses from HubSpot so
 * you can find the correct `officeLocationId` to set per community.
 *
 * After finding the right IDs, set `hubspot.officeLocationId` on each
 * community row in the DB (via the admin UI or a direct SQL update).
 */
export async function GET() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_PRIVATE_APP_TOKEN not set" }, { status: 500 });
  }

  const headers = { Authorization: `Bearer ${token}` };

  // HubSpot stores email footer office locations as "Additional Addresses"
  // on the portal's marketing email settings.
  const res = await fetch(
    "https://api.hubapi.com/email/public/v1/portalSettings",
    { headers },
  );

  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }

  if (!res.ok) {
    return NextResponse.json({
      error: "HubSpot API returned an error",
      status: res.status,
      body,
      note: "If this endpoint is unavailable, check portal settings in HubSpot UI under Settings → Marketing → Email → Footer to see configured addresses and their IDs.",
    }, { status: res.status });
  }

  // Extract address-like fields for easier scanning.
  const addresses =
    body?.additionalAddresses ??
    body?.officeLocations ??
    body?.addresses ??
    null;

  return NextResponse.json({
    ok: true,
    note: "Set hubspot.officeLocationId on each community to the matching ID below.",
    addresses,
    raw: body,
  });
}
