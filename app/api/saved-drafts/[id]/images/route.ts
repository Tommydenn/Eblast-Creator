import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draftImageBank } from "@/lib/db/schema";
import { eq, asc, sql, and, gte, inArray, lte } from "drizzle-orm";
import { createHash } from "crypto";
import { IMAGE_REF_PREFIX, isImagePhaseName, type ImagePhaseName } from "@/lib/image-bank";

// Rows belonging to one loading phase, filtered in SQL rather than fetched
// and discarded — the point of the phases is to not send the browser
// megabytes it has no use for yet.
function phaseFilter(phase: ImagePhaseName) {
  const idx = draftImageBank.idx;
  const gallery = (shown: boolean) =>
    and(lte(idx, -10), sql`(abs(${idx}) - 10) % 2 = ${shown ? 0 : 1}`);
  if (phase === "pool") return gte(idx, 0);
  if (phase === "shown") return sql`(${inArray(idx, [-1, -3])} OR ${gallery(true)})`;
  return sql`(${inArray(idx, [-2, -4])} OR ${gallery(false)})`;
}

// GET /api/saved-drafts/[id]/images  — every image, or one phase via
// ?phase=shown|originals|pool. Rows may hold "ref:<idx>" pointers; the caller
// expands them with resolveImageRefs once it has the earlier phases.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const phase = req.nextUrl.searchParams.get("phase");
  if (phase !== null && !isImagePhaseName(phase)) {
    return NextResponse.json({ ok: false, error: "Unknown phase" }, { status: 400 });
  }
  try {
    const rows = await db
      .select({ idx: draftImageBank.idx, url: draftImageBank.url })
      .from(draftImageBank)
      .where(
        phase
          ? and(eq(draftImageBank.draftId, id), phaseFilter(phase))
          : eq(draftImageBank.draftId, id),
      )
      .orderBy(asc(draftImageBank.idx));
    return NextResponse.json({ ok: true, images: rows });
  } catch (err) {
    console.error("[saved-drafts/images GET]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// POST /api/saved-drafts/[id]/images  — upserts a batch of images by index
// Body: { images: Array<{ idx: number; url: string }> }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const body = await req.json().catch(() => null);
  if (!body?.images || !Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing images array" }, { status: 400 });
  }
  const images: Array<{ idx: number; url: string }> = body.images;
  try {
    // A repeated photo is stored once and pointed at by index from its other
    // rows. Replacing the photo at a pointed-at index would therefore silently
    // change every row pointing there — swap the hero and the flyer pool entry
    // it came from would quietly become the new photo too.
    //
    // So before overwriting anything, give the photo its own copy back to any
    // row that was relying on this index and whose content is about to change.
    // Comparing by checksum keeps the request small; comparing at all means an
    // unchanged photo keeps its pointers and stays deduplicated.
    const fingerprints = images.map(({ idx, url }) => ({
      idx,
      md5: createHash("md5").update(url).digest("hex"),
    }));
    const changing = sql.join(
      fingerprints.map((f) => sql`(${f.idx}::int, ${f.md5}::text)`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE ${draftImageBank} AS d
      SET url = target.url
      FROM ${draftImageBank} AS target
      JOIN (VALUES ${changing}) AS incoming(idx, md5) ON incoming.idx = target.idx
      WHERE target.draft_id = ${id}
        AND d.draft_id = ${id}
        AND d.url = ${IMAGE_REF_PREFIX} || target.idx
        AND md5(target.url) <> incoming.md5
    `);

    await db
      .insert(draftImageBank)
      .values(images.map(({ idx, url }) => ({ draftId: id, idx, url })))
      .onConflictDoUpdate({
        target: [draftImageBank.draftId, draftImageBank.idx],
        set: { url: sql`excluded.url` },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[saved-drafts/images POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
