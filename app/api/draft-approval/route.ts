import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { sendApprovalEmail } from "@/lib/email";
import { swapDataUrisForHostedImages } from "@/lib/hubspot";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

/** POST /api/draft-approval — send a draft for approval */
export async function POST(req: NextRequest) {
  let body: {
    savedDraftId: string;
    communitySlug: string;
    recipientEmail: string;
    recipientName?: string;
    notifyEmail?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  const { savedDraftId, communitySlug, recipientEmail, recipientName, notifyEmail } = body;
  if (!savedDraftId || !communitySlug || !recipientEmail) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  // Load the saved draft to get HTML and subject.
  // Bug: DB select had no try/catch — a failure would produce an unhandled rejection
  let draftRow: typeof savedDrafts.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(savedDrafts)
      .where(eq(savedDrafts.id, savedDraftId))
      .limit(1);
    draftRow = rows[0];
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Database error: ${e.message ?? String(e)}` }, { status: 500 });
  }

  if (!draftRow) {
    return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
  }

  const draftData = draftRow.data as Record<string, any>;
  const draftHtml: string = draftData?.html ?? "";
  const draftSubject: string = draftRow.subject ?? draftData?.subject ?? "(no subject)";

  // Bug: getCommunity had no try/catch — a failure would produce an unhandled rejection
  let community: Awaited<ReturnType<typeof getCommunity>>;
  try {
    community = await getCommunity(communitySlug);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Database error: ${e.message ?? String(e)}` }, { status: 500 });
  }
  if (!community) {
    return NextResponse.json({ ok: false, error: "Community not found" }, { status: 404 });
  }

  // Generate a random opaque token for the magic link.
  const token = randomBytes(24).toString("base64url");

  // Bug: DB insert had no try/catch — a failure here would throw an unhandled rejection
  try {
    await db.insert(savedDraftApprovals).values({
      token,
      savedDraftId,
      communitySlug,
      recipientName: recipientName ?? null,
      recipientEmail,
      notifyEmail: notifyEmail ?? null,
      draftSubject,
      decision: "pending",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Database error: ${e.message ?? String(e)}` }, { status: 500 });
  }

  // Upload embedded base64 images to HubSpot so they render in email clients.
  // Base64 data URIs are stripped by Gmail/Outlook — hosted CDN URLs work everywhere.
  let emailHtml = draftHtml;
  try {
    const swap = await swapDataUrisForHostedImages({
      html: draftHtml,
      folderPath: `/eblast-drafter/${communitySlug}/approval-previews`,
    });
    if (swap.failures.length === 0) {
      emailHtml = swap.html;
    }
  } catch {
    // Fall back to raw HTML if HubSpot upload fails — email sends but images may be missing.
  }

  try {
    await sendApprovalEmail({
      to: recipientEmail,
      recipientName: recipientName ?? null,
      communityName: community.displayName,
      draftSubject,
      draftHtml: emailHtml,
      token,
    });
  } catch (e: any) {
    await db.delete(savedDraftApprovals).where(eq(savedDraftApprovals.token, token));
    return NextResponse.json({ ok: false, error: `Email send failed: ${e.message ?? String(e)}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token });
}

/** GET /api/draft-approval?savedDraftId=xxx — check latest approval status for a draft */
export async function GET(req: NextRequest) {
  const savedDraftId = req.nextUrl.searchParams.get("savedDraftId");
  if (!savedDraftId) {
    return NextResponse.json({ ok: false, error: "Missing savedDraftId" }, { status: 400 });
  }

  // Bug: DB select had no try/catch — a failure would produce an unhandled rejection
  try {
    const rows = await db
      .select()
      .from(savedDraftApprovals)
      .where(eq(savedDraftApprovals.savedDraftId, savedDraftId))
      .orderBy(savedDraftApprovals.sentAt);
    return NextResponse.json({ ok: true, approvals: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Database error: ${e.message ?? String(e)}` }, { status: 500 });
  }
}
