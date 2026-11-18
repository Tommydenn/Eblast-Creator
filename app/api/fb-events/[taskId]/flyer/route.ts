/**
 * The flyer this event was written from.
 *
 * Served inline so the page can show it the way the eblast editor does,
 * rather than making you find the original in Planner to check a detail
 * against the copy you are about to paste.
 */
import { NextResponse } from "next/server";
import { flyerFor } from "@/lib/fb-event-source";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  try {
    const pdf = await flyerFor(params.taskId);
    if (!pdf) {
      return NextResponse.json({ ok: false, error: "No flyer for this event" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
