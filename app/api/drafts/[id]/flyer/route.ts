/**
 * The flyer a draft was written from.
 *
 * GET serves the PDF inline, for the panel beside the eblast in the editor.
 * POST claims a flyer that was staged while the draft was being generated —
 * a hand-uploaded flyer arrives before the draft has an id, so it waits in
 * pending_flyers until the draft exists to attach it to.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draftFlyers, pendingFlyers, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // ?exists=1 answers whether there is a flyer without sending it, and
    // answers 200 either way. A 404 would be semantically fine but every draft
    // without a flyer would log a console error, which is noise for a question
    // whose answer is routinely "no".
    if (req.nextUrl.searchParams.get("exists") === "1") {
      const [found] = await db
        .select({ fileName: draftFlyers.fileName })
        .from(draftFlyers)
        .where(eq(draftFlyers.draftId, params.id))
        .limit(1);
      return NextResponse.json({ ok: true, hasFlyer: !!found, fileName: found?.fileName ?? null });
    }

    const [row] = await db
      .select({ fileName: draftFlyers.fileName, pdf: draftFlyers.pdfBase64 })
      .from(draftFlyers)
      .where(eq(draftFlyers.draftId, params.id))
      .limit(1);

    if (!row) {
      return new NextResponse("No flyer was kept for this draft.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const bytes = Buffer.from(row.pdf, "base64");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${row.fileName.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[drafts/flyer GET]", err);
    return new NextResponse("Could not load the flyer.", { status: 500 });
  }
}

/**
 * Whether a flyer exists, without sending it.
 *
 * The editor asks this before showing the button, so a multi-megabyte PDF is
 * not downloaded merely to discover there is one.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const key = body?.flyerKey;
  if (typeof key !== "string" || !key) {
    return NextResponse.json({ ok: false, error: "flyerKey is required" }, { status: 400 });
  }
  try {
    const [draft] = await db
      .select({ id: savedDrafts.id })
      .from(savedDrafts)
      .where(eq(savedDrafts.id, params.id))
      .limit(1);
    if (!draft) {
      return NextResponse.json({ ok: false, error: "Unknown draft" }, { status: 404 });
    }

    const [staged] = await db
      .select()
      .from(pendingFlyers)
      .where(eq(pendingFlyers.key, key))
      .limit(1);
    // Already claimed, or aged out of staging. Not an error: the draft simply
    // has no flyer to show, which is the same as a text-only draft.
    if (!staged) return NextResponse.json({ ok: true, attached: false });

    await db
      .insert(draftFlyers)
      .values({
        draftId: params.id,
        fileName: staged.fileName,
        pdfBase64: staged.pdfBase64,
        bytes: staged.bytes,
      })
      .onConflictDoUpdate({
        target: draftFlyers.draftId,
        set: {
          fileName: staged.fileName,
          pdfBase64: staged.pdfBase64,
          bytes: staged.bytes,
          storedAt: new Date(),
        },
      });
    await db.delete(pendingFlyers).where(eq(pendingFlyers.key, key));

    return NextResponse.json({ ok: true, attached: true });
  } catch (err) {
    console.error("[drafts/flyer POST]", err);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
