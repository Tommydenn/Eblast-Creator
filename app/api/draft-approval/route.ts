import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { sendApprovalEmail } from "@/lib/email";
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
  const [draftRow] = await db
    .select()
    .from(savedDrafts)
    .where(eq(savedDrafts.id, savedDraftId))
    .limit(1);

  if (!draftRow) {
    return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
  }

  const draftData = draftRow.data as Record<string, any>;
  const draftHtml: string = draftData?.html ?? "";
  const draftSubject: string = draftRow.subject ?? draftData?.subject ?? "(no subject)";

  const community = await getCommunity(communitySlug);
  if (!community) {
    return NextResponse.json({ ok: false, error: "Community not found" }, { status: 404 });
  }

  // Generate a random opaque token for the magic link.
  const token = randomBytes(24).toString("base64url");

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

  // Send the approval email.
  try {
    await sendApprovalEmail({
      to: recipientEmail,
      recipientName: recipientName ?? null,
      communityName: community.displayName,
      draftSubject,
      draftHtml,
      token,
    });
  } catch (e: any) {
    // Roll back the DB row if email failed so user can retry.
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

  const rows = await db
    .select()
    .from(savedDraftApprovals)
    .where(eq(savedDraftApprovals.savedDraftId, savedDraftId))
    .orderBy(savedDraftApprovals.sentAt);

  return NextResponse.json({ ok: true, approvals: rows });
}
