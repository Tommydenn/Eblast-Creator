/**
 * What Further's API will let this key do with community events.
 *
 * Here rather than worked out once and written down, because the answer is
 * theirs to change: if a write method appears, this is what says so.
 */
import { NextResponse } from "next/server";
import {
  hasFurtherKey,
  probeCommunityEvents,
  probeDashboardEvents,
  probeOfficialCreate,
} from "@/lib/further";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasFurtherKey()) {
    return NextResponse.json({ ok: false, error: "FURTHER_API_KEY is not set" }, { status: 400 });
  }
  // Both surfaces: the published one, which only reads, and the one the
  // dashboard uses, which declares a create method. Whether this key opens
  // the second is the whole question.
  const [published, dashboard, create] = await Promise.all([
    probeCommunityEvents(),
    probeDashboardEvents(),
    probeOfficialCreate(),
  ]);
  return NextResponse.json({ ok: true, ...published, dashboard, create });
}
