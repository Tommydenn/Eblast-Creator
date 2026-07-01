import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/hubspot-office-locations
 *
 * Probes multiple HubSpot endpoints to find the configured office/physical
 * addresses and their IDs. Returns all raw responses so we can see exactly
 * where the data lives and what IDs to use per community.
 */
export async function GET() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_PRIVATE_APP_TOKEN not set" }, { status: 500 });
  }

  const h = { Authorization: `Bearer ${token}` };

  async function probe(label: string, url: string) {
    try {
      const res = await fetch(url, { headers: h });
      const text = await res.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text; }
      return { label, url, status: res.status, ok: res.ok, body };
    } catch (e: any) {
      return { label, url, status: 0, ok: false, body: e?.message ?? String(e) };
    }
  }

  // Probe every endpoint that might carry office/address location data.
  const results = await Promise.all([
    probe("portalSettings (v1)", "https://api.hubapi.com/email/public/v1/portalSettings"),
    probe("account-info (v3)", "https://api.hubapi.com/account-info/v3/details"),
    probe("business-units", "https://api.hubapi.com/business-units/v3/business-units"),
    probe("marketing-email settings", "https://api.hubapi.com/marketing/v3/emails/settings"),
    probe("cms site-settings", "https://api.hubapi.com/cms/v3/site-settings"),
  ]);

  // Try to surface anything that looks like an address list.
  const addressHints = results
    .filter((r) => r.ok)
    .map((r) => {
      const str = JSON.stringify(r.body);
      const hasAddress =
        str.includes("address") ||
        str.includes("location") ||
        str.includes("street") ||
        str.includes("officeLocation");
      return { label: r.label, hasAddressData: hasAddress };
    });

  return NextResponse.json({ results, addressHints });
}
