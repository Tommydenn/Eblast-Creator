import { NextRequest, NextResponse } from "next/server";
import { listRegionals, addRegional } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/regionals — every regional, with the communities each covers. */
export async function GET() {
  return NextResponse.json({ ok: true, regionals: await listRegionals() });
}

/** POST /api/regionals — add one. */
export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; title?: string; communityIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Both are required here, unlike a sender: a regional exists to be copied on
  // the approval, so one without an address could not do the only job it has.
  if (!body.name?.trim()) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  if (!body.email?.trim()) return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });

  const regional = await addRegional({
    name: body.name.trim(),
    email: body.email.trim(),
    title: body.title ?? null,
    communityIds: body.communityIds ?? [],
  });
  return NextResponse.json({ ok: true, regional });
}
