import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/draft-preview/[token]
 * Returns the saved draft HTML as text/html so it can be loaded in an iframe.
 * Validated by the approval token so only the salesperson can access it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;

  const [approval] = await db
    .select()
    .from(savedDraftApprovals)
    .where(eq(savedDraftApprovals.token, token))
    .limit(1);

  if (!approval) {
    return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const [draftRow] = await db
    .select()
    .from(savedDrafts)
    .where(eq(savedDrafts.id, approval.savedDraftId))
    .limit(1);

  if (!draftRow) {
    return new NextResponse("Draft not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const draftData = draftRow.data as Record<string, any>;
  const html: string = draftData?.html ?? "<p>No preview available.</p>";

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Allow iframe embedding from same origin only.
      "X-Frame-Options": "SAMEORIGIN",
      // Don't cache — draft HTML may be updated after refinements.
      "Cache-Control": "no-store",
    },
  });
}
