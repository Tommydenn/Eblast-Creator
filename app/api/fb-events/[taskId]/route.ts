/**
 * Ticking a Facebook event off.
 *
 * By hand, because nothing on Facebook's side can tell us: there is no API
 * that creates these events and none that reports one appearing, so the only
 * thing that knows the event is up is the person who put it there.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fbEventTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  let body: { postedToFacebook?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.postedToFacebook !== "boolean") {
    return NextResponse.json({ ok: false, error: "postedToFacebook must be true or false" }, { status: 400 });
  }

  const [row] = await db
    .update(fbEventTasks)
    .set({
      postedToFacebookAt: body.postedToFacebook ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(fbEventTasks.taskId, params.taskId))
    .returning({ postedToFacebookAt: fbEventTasks.postedToFacebookAt });

  if (!row) return NextResponse.json({ ok: false, error: "No such event task" }, { status: 404 });
  return NextResponse.json({ ok: true, postedToFacebookAt: row.postedToFacebookAt });
}
