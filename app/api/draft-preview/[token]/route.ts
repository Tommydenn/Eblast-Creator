import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inlineRelativeImages } from "@/lib/inline-images";
import { buildEblastHtml } from "@/lib/render-email";
import { getCommunity } from "@/data/communities";

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

  // New format: build HTML from fields. Fallback to legacy html field for old drafts.
  let rawHtml: string;
  if (draftData?.fields) {
    const community = await getCommunity(draftRow.communitySlug);
    if (!community) {
      return new NextResponse("Community not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
    const imgs = draftData.images ?? {};
    rawHtml = buildEblastHtml(draftData.fields, community, {
      heroImageUrl: imgs.hero?.url,
      secondaryImageUrl: imgs.secondary?.url,
      galleryImageUrls: (imgs.gallery ?? []).map((g: any) => g?.url).filter(Boolean),
    });
  } else {
    rawHtml = draftData?.html ?? "<p>No preview available.</p>";
  }

  const html = await inlineRelativeImages(rawHtml);

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
