import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { uploadEmailTemplate, createEmail, swapDataUrisForHostedImages, generateHubspotEmailName } from "@/lib/hubspot";
import { inlineRelativeImages } from "@/lib/inline-images";
import { resolveSegmentsFromRecentSend } from "@/lib/past-sends-retrieval";
import { updateCommunitySegments } from "@/lib/db/queries";

export const runtime = "nodejs";

function safeSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function html(icon: string, heading: string, sub: string, color: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f5f4f1;font-family:Georgia,'Times New Roman',serif;}
  .card{text-align:center;padding:48px 32px;max-width:400px;}
  .icon{width:72px;height:72px;border-radius:50%;background:${color};display:flex;
        align-items:center;justify-content:center;margin:0 auto 24px;font-size:32px;color:#fff;}
  h1{font-size:24px;color:#2d2926;font-weight:normal;margin-bottom:10px;}
  p{font-size:15px;line-height:1.6;color:#7a7066;font-family:Arial,sans-serif;}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${heading}</h1>
    <p>${sub}</p>
  </div>
</body>
</html>`;
}

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
    return new NextResponse(html("✕", "Link Not Found", "This approval link is invalid or has expired.", "#b45309"), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (approval.decision === "approved") {
    return new NextResponse(html("✓", "Already Approved", "This draft was already approved and pushed to HubSpot.", "#2d6a4f"), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (approval.decision === "edits_requested") {
    return new NextResponse(html("✎", "Edits Requested", "Edit notes were already submitted for this draft. A revised version will be sent once ready.", "#b45309"), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let pushError: string | null = null;

  try {
    const [draftRow] = await db
      .select()
      .from(savedDrafts)
      .where(eq(savedDrafts.id, approval.savedDraftId))
      .limit(1);

    if (!draftRow) throw new Error("Draft not found");

    const draftData = draftRow.data as Record<string, any>;
    const rawHtml: string = draftData?.html ?? "";
    const subject: string = draftRow.subject ?? draftData?.subject ?? "Draft";
    const community = await getCommunity(approval.communitySlug);
    if (!community) throw new Error("Community not found");

    let emailHtml = await inlineRelativeImages(rawHtml);
    const swap = await swapDataUrisForHostedImages({ html: emailHtml, folderPath: `/eblast-drafter/${community.slug}` });
    if (swap.failures.length > 0) throw new Error(`Image upload failed (status ${swap.failures[0].status})`);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const templateFileName = `${safeSlug(subject)}-${stamp}.html`;
    const hubspotPath = `email-templates/${community.slug}/${templateFileName}`;

    const upload = await uploadEmailTemplate({
      path: hubspotPath,
      html: swap.html,
      label: `${community.displayName} — ${templateFileName}`,
    });
    if (!upload.ok) throw new Error(`Template upload failed: ${upload.status}`);

    const segments = await resolveSegmentsFromRecentSend({
      communityId: community.id,
      fallbackIncluded: community.hubspot.includedListIds ?? (community.hubspot.listId ? [community.hubspot.listId] : []),
      fallbackExcluded: community.hubspot.excludedListIds ?? [],
    });
    const create = await createEmail({
      name: generateHubspotEmailName({
        acronym: community.hubspot.acronym,
        eventCategory: (draftData.extracted as any)?.eventCategory,
      }),
      subject,
      fromName: community.senders[0]?.name ?? community.displayName,
      replyTo: community.senders[0]?.email ?? community.email ?? "",
      templatePath: hubspotPath,
      ...segments,
    });
    if (!create.ok) throw new Error(`HubSpot create failed: ${create.status}`);

    if (segments.includedListIds.length > 0 || segments.excludedListIds.length > 0) {
      updateCommunitySegments(community.slug, segments.includedListIds, segments.excludedListIds).catch(() => null);
    }
  } catch (e: any) {
    pushError = e.message ?? String(e);
  }

  await db
    .update(savedDraftApprovals)
    .set({ decision: "approved", decidedAt: new Date() })
    .where(eq(savedDraftApprovals.token, token));

  if (pushError) {
    return new NextResponse(
      html("⚠", "Approved — Push Failed", `Your approval was recorded, but the HubSpot push encountered an error. The marketing team has been notified. Error: ${pushError}`, "#b45309"),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return new NextResponse(
    html("✓", "Approved", "The draft has been approved and queued in HubSpot. You can close this tab.", "#2d6a4f"),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
