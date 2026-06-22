import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { sendEditNotificationEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let body: { editNotes: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  const { token } = params;
  const editNotes = body.editNotes?.trim();
  if (!editNotes) {
    return NextResponse.json({ ok: false, error: "editNotes is required" }, { status: 400 });
  }

  const [approval] = await db
    .select()
    .from(savedDraftApprovals)
    .where(eq(savedDraftApprovals.token, token))
    .limit(1);

  if (!approval) {
    return NextResponse.json({ ok: false, error: "Approval thread not found" }, { status: 404 });
  }

  if (approval.decision !== "pending") {
    return NextResponse.json({ ok: false, error: "This draft has already been decided" }, { status: 409 });
  }

  await db
    .update(savedDraftApprovals)
    .set({ decision: "edits_requested", editNotes, decidedAt: new Date() })
    .where(eq(savedDraftApprovals.token, token));

  // Send notification email if configured.
  if (approval.notifyEmail) {
    try {
      const community = await getCommunity(approval.communitySlug);
      await sendEditNotificationEmail({
        to: approval.notifyEmail,
        recipientName: approval.recipientName,
        communityName: community?.displayName ?? approval.communitySlug,
        draftSubject: approval.draftSubject ?? "(no subject)",
        editNotes,
        savedDraftId: approval.savedDraftId,
      });
    } catch (e) {
      // Log but don't fail — the DB update already succeeded.
      console.error("[draft-approval/edits] notification email failed:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
