/**
 * The flyer a draft was generated from.
 *
 * Opened in a second tab when a scheduled draft is opened, so the eblast can
 * be checked against the source it came from. Served inline rather than as a
 * download, so it just appears in the tab.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plannerTasks, plannerTaskFlyers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { draftId: string } }) {
  try {
    const [row] = await db
      .select({ fileName: plannerTaskFlyers.fileName, pdf: plannerTaskFlyers.pdfBase64 })
      .from(plannerTaskFlyers)
      .innerJoin(plannerTasks, eq(plannerTasks.taskId, plannerTaskFlyers.taskId))
      .where(eq(plannerTasks.savedDraftId, params.draftId))
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
        // inline so the browser shows it; the filename is what a save would use
        "Content-Disposition": `inline; filename="${row.fileName.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[planner/flyer]", err);
    return new NextResponse("Could not load the flyer.", { status: 500 });
  }
}
