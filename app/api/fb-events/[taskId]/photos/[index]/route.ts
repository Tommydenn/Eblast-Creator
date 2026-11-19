/**
 * One photo from the flyer.
 *
 * By default, exactly as it came off: not cropped, not resized. Facebook and
 * Further both crop on upload and show you what they are doing while you do
 * it, so cropping in advance only removed the choice.
 *
 * `?crop=WxH` is the exception. The website wants a fixed 1000×667, with no
 * cropping tool of its own, so that one is cut here — and cut to keep the
 * subject, not the centre of the frame. sharp's attention strategy finds the
 * region richest in edges, colour and skin tones and crops around that, so a
 * person standing off to one side stays in the picture instead of being
 * sliced in half by a blind centre cut.
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

    // A crop size, when one is asked for: "1000x667". Bounded so the
    // parameter cannot ask sharp for an enormous canvas.
    let crop: { w: number; h: number } | null = null;
    const cropParam = req.nextUrl.searchParams.get("crop");
    if (cropParam) {
      const m = /^(\d{2,4})x(\d{2,4})$/.exec(cropParam);
      if (!m) return NextResponse.json({ ok: false, error: "Bad crop size" }, { status: 400 });
      crop = { w: Number(m[1]), h: Number(m[2]) };
    }

    let pipeline = sharp(photo.bytes);
    if (crop) {
      // cover fills the whole 1000×667 with no letterboxing; attention picks
      // where to take it from. Enlargement is allowed on purpose — the output
      // has to be exactly this size, even from a slightly smaller original.
      pipeline = pipeline.resize(crop.w, crop.h, {
        fit: "cover",
        position: sharp.strategy.attention,
      });
    }
    // Re-encoded to settle on one format for the browser and for upload. With
    // no crop the pixels and shape are untouched.
    const jpeg = await pipeline.jpeg({ quality: 92 }).toBuffer();

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
    // The size goes in the filename so a cropped download is obvious on disk.
    const suffix = crop ? `-${crop.w}x${crop.h}` : "";
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": download
          ? `attachment; filename="${safe || "event"}-${index + 1}${suffix}.jpg"`
          : "inline",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
