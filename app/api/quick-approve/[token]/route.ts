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

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(opts: {
  icon: string;
  iconColor: string;
  title: string;
  community: string;
  subject: string;
  body: string;
  errorDetail?: string;
}) {
  const { icon, iconColor, title, community, subject, body, errorDetail } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f5f4f1;font-family:Arial,Helvetica,sans-serif;padding:24px;}
  .card{background:#fff;border:1px solid #e0ddd7;border-radius:10px;
        padding:40px 44px;max-width:480px;width:100%;}
  .icon-row{display:flex;align-items:center;gap:14px;margin-bottom:24px;}
  .icon{width:48px;height:48px;border-radius:50%;background:${iconColor};
        display:flex;align-items:center;justify-content:center;
        font-size:22px;color:#fff;flex-shrink:0;}
  .title{font-size:21px;color:#2d2926;font-weight:600;font-family:Georgia,serif;}
  .meta{font-size:12px;letter-spacing:.07em;text-transform:uppercase;
        color:#9e9484;margin-bottom:20px;}
  .subject-box{background:#f7f5f0;border:1px solid #e0ddd7;border-radius:6px;
               padding:13px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;}
  .subject-box svg{flex-shrink:0;}
  .subject-text{font-size:14px;color:#2d2926;font-weight:600;line-height:1.4;}
  .body-text{font-size:14px;color:#7a7066;line-height:1.7;}
  .divider{border:none;border-top:1px solid #e8e5e0;margin:20px 0;}
  .error{background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;
         padding:12px 16px;font-size:12px;color:#92400e;margin-top:16px;
         font-family:monospace;word-break:break-all;}
</style>
</head>
<body>
  <div class="card">
    <div class="icon-row">
      <div class="icon">${icon}</div>
      <div class="title">${esc(title)}</div>
    </div>
    <p class="meta">${esc(community)}</p>
    <div class="subject-box">
      <svg width="16" height="13" viewBox="0 0 16 13" xmlns="http://www.w3.org/2000/svg">
        <rect x=".75" y=".75" width="14.5" height="11.5" rx="1.5" fill="none" stroke="#9e8c7a" stroke-width="1.5"/>
        <polyline points="1,1 8,7.5 15,1" fill="none" stroke="#9e8c7a" stroke-width="1.5"/>
      </svg>
      <span class="subject-text">${esc(subject)}</span>
    </div>
    <hr class="divider">
    <p class="body-text">${body}</p>
    ${errorDetail ? `<div class="error">${esc(errorDetail)}</div>` : ""}
  </div>
</body>
</html>`;
}

function errorPage(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f5f4f1;font-family:Arial,Helvetica,sans-serif;padding:24px;}
  .card{background:#fff;border:1px solid #e0ddd7;border-radius:10px;padding:40px 44px;
        max-width:480px;width:100%;text-align:center;}
  h1{font-size:20px;color:#2d2926;font-weight:600;margin-bottom:12px;}
  p{font-size:14px;color:#7a7066;line-height:1.7;}
</style>
</head>
<body>
  <div class="card"><h1>${esc(title)}</h1><p>${body}</p></div>
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
    return new NextResponse(errorPage("Link Not Found", "This approval link is invalid or has expired."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Fetch subject for display on all response pages.
  const [draftRow] = await db
    .select()
    .from(savedDrafts)
    .where(eq(savedDrafts.id, approval.savedDraftId))
    .limit(1);

  const draftData = draftRow?.data as Record<string, any> | undefined;
  const subject = draftRow?.subject ?? draftData?.subject ?? "Draft";
  const communityName = approval.communitySlug; // replaced with displayName below if available

  if (approval.decision === "approved") {
    return new NextResponse(page({
      icon: "✓", iconColor: "#2d6a4f",
      title: "Already Approved",
      community: communityName,
      subject,
      body: "This draft has already been approved and queued in HubSpot.",
    }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (approval.decision === "edits_requested") {
    return new NextResponse(page({
      icon: "✎", iconColor: "#b45309",
      title: "Edits Requested",
      community: communityName,
      subject,
      body: "Edit notes were already submitted for this draft. A revised version will be sent once it&rsquo;s ready.",
    }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // ── Run the HubSpot push ──────────────────────────────────────────────────
  let pushError: string | null = null;
  let displayName = communityName;

  try {
    if (!draftRow) throw new Error("Draft not found");

    // Authoritative source is the HTML snapshotted on the approval when it was
    // sent (immune to later draft autosaves). Fall back to the draft's html for
    // approvals created before this field existed.
    const rawHtml: string = (approval.html ?? draftData?.html ?? "").trim();
    // Never push an empty body — that would create a HubSpot email showing only
    // the default compliance footer. Fail loudly instead so it can be re-sent.
    if (!rawHtml) {
      throw new Error("Approved draft has no content to push. Please re-send the draft for approval and approve again.");
    }
    const community = await getCommunity(approval.communitySlug);
    if (!community) throw new Error("Community not found");
    displayName = community.displayName;

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
      fallbackIncluded: [],
      fallbackExcluded: [],
    });
    const create = await createEmail({
      name: generateHubspotEmailName({
        acronym: community.hubspot.acronym,
        eventCategory: (draftData?.extracted as any)?.eventCategory,
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

  // Mark the underlying saved draft as approved — but only once the HubSpot
  // push actually succeeded, so "Approved" in the Saved Drafts tab means it
  // genuinely went out, not just that someone clicked the link. This also
  // exempts it from the per-community save cap (see /api/saved-drafts).
  if (!pushError && draftRow) {
    await db
      .update(savedDrafts)
      .set({ approvedAt: new Date() })
      .where(eq(savedDrafts.id, draftRow.id));
  }

  if (pushError) {
    return new NextResponse(page({
      icon: "⚠", iconColor: "#b45309",
      title: "Approved — Push Failed",
      community: displayName,
      subject,
      body: "Your approval was recorded, but the HubSpot push encountered an error. Please notify the marketing team so they can re-push manually.",
      errorDetail: pushError,
    }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  return new NextResponse(page({
    icon: "✓", iconColor: "#2d6a4f",
    title: "Approved",
    community: displayName,
    subject,
    body: "This eblast has been approved and queued in HubSpot. You can close this tab.",
  }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
