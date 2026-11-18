/**
 * The photos on offer for one event, as a strip of choices.
 *
 * Thumbnails rather than the real thing: this is the picker, and the full
 * image is a click away at /photos/[index]. Gathering them means reading a
 * PDF, so it is done once here rather than once per thumbnail.
 */
import { NextResponse } from "next/server";
import { collectPhotos, thumbnail } from "@/lib/fb-event-photos";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  try {
    const photos = await collectPhotos(params.taskId);
    return NextResponse.json({
      ok: true,
      photos: await Promise.all(
        photos.map(async (p, i) => ({
          index: i,
          width: p.width,
          height: p.height,
          source: p.source,
          thumb: await thumbnail(p),
        })),
      ),
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
