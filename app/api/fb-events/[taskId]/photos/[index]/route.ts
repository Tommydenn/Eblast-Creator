/**
 * One photo, exactly as it came off the flyer.
 *
 * Not cropped and not resized. Facebook and Further both crop on upload and
 * show you what they are doing while you do it, so cropping here only
 * removed the choice — and a cover cut to 1.91:1 in advance cannot be used
 * anywhere that wants a different shape.
 *
 * ?download=1 saves it rather than showing it.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fbEventTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { collectPhotos } from "@/lib/fb-event-photos";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string; index: string } },
) {
  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ ok: false, error: "Not a photo number" }, { status: 400 });
  }

  try {
    const photos = await collectPhotos(params.taskId);
    const photo = photos[index];
    if (!photo) return NextResponse.json({ ok: false, error: "No such photo" }, { status: 404 });

    // Re-encoded only to settle on one format for the browser to show and
    // for Facebook to accept; the pixels and the shape are untouched.
    const jpeg = await sharp(photo.bytes).jpeg({ quality: 92 }).toBuffer();

    const [task] = await db
      .select({ name: fbEventTasks.eventName })
      .from(fbEventTasks)
      .where(eq(fbEventTasks.taskId, params.taskId))
      .limit(1);
    const safe = (task?.name || "event")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": download
          ? `attachment; filename="${safe || "event"}-${index + 1}.jpg"`
          : "inline",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
