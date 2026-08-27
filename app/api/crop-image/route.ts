import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draftImageBank } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveImageRefs } from "@/lib/image-bank";
import { cropDataUriToXY, cropDataUriToFocusAndRatio } from "@/lib/pdf-images";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Crop a photo to a slot's shape.
 *
 * The photo can be named instead of sent. Flyer photos are several megabytes,
 * and Vercel refuses a request body over 4.5 MB, so posting the bytes made
 * assigning a large photo fail outright. Naming it — the draft plus the index
 * of the row it lives in — keeps the request tiny and lets the crop happen
 * here, where sharp does it.
 *
 * That matters for more than size. The photos pulled out of flyers are CMYK,
 * and a browser converts CMYK to RGB far more crudely than sharp: measured on
 * a real one, cropping in the browser raised saturation 26% and contrast 17%
 * against the same crop through sharp. So anything already stored is cropped
 * here, and only a photo this route has no copy of falls back to the browser.
 */
export async function POST(req: NextRequest) {
  let body: {
    imageUrl?: string;
    draftId?: string;
    imageIdx?: number;
    targetRatio: number;
    x?: number;
    y?: number;
    focus?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  if (!body.targetRatio) {
    return NextResponse.json({ ok: false, error: "Missing targetRatio" }, { status: 400 });
  }

  let imageUrl = body.imageUrl;

  // Named rather than sent: read it back from the draft's stored photos.
  if (!imageUrl && body.draftId && typeof body.imageIdx === "number") {
    try {
      const rows = await db
        .select({ idx: draftImageBank.idx, url: draftImageBank.url })
        .from(draftImageBank)
        .where(eq(draftImageBank.draftId, body.draftId));
      // A repeated photo is stored once and pointed at from its other rows.
      const found = resolveImageRefs(rows).find((r) => r.idx === body.imageIdx);
      if (!found) {
        return NextResponse.json(
          { ok: false, error: "That photo is no longer stored with this draft" },
          { status: 404 },
        );
      }
      imageUrl = found.url;
    } catch (e) {
      console.error("[crop-image] could not read the stored photo:", e);
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }
  }

  if (!imageUrl) {
    return NextResponse.json(
      { ok: false, error: "Provide either imageUrl, or draftId and imageIdx" },
      { status: 400 },
    );
  }

  try {
    let croppedUrl: string;
    if (body.x !== undefined && body.y !== undefined) {
      // Continuous XY offset from the repositioning tool.
      croppedUrl = await cropDataUriToXY(imageUrl, body.targetRatio, body.x, body.y);
    } else {
      // Named focus from the AI refine pipeline (legacy).
      const validFoci = ["top", "center", "bottom", "left", "right"] as const;
      type Focus = typeof validFoci[number];
      const focus: Focus = (validFoci as readonly string[]).includes(body.focus ?? "")
        ? (body.focus as Focus)
        : "center";
      croppedUrl = await cropDataUriToFocusAndRatio(imageUrl, body.targetRatio, focus);
    }
    return NextResponse.json({ ok: true, croppedUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
