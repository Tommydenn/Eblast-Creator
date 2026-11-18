/**
 * The photos on offer for one event.
 *
 * Normally a single read: they were gathered and kept when the event's copy
 * was written. An event whose copy predates that, or whose flyer arrived
 * later, falls through to reading the PDF once and keeping the result.
 */
import { NextResponse } from "next/server";
import { photosFor } from "@/lib/fb-event-photos";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  try {
    return NextResponse.json({ ok: true, photos: await photosFor(params.taskId) });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
