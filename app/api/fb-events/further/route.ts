/**
 * What Further's API will let this key do with community events.
 *
 * Here rather than worked out once and written down, because the answer is
 * theirs to change: if a write method appears, this is what says so.
 */
import { NextResponse } from "next/server";
import { hasFurtherKey, probeCommunityEvents } from "@/lib/further";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasFurtherKey()) {
    return NextResponse.json({ ok: false, error: "FURTHER_API_KEY is not set" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(await probeCommunityEvents()) });
}
