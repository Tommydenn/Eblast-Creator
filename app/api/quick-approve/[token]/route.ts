import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { uploadEmailTemplate, createEmail, swapDataUrisForHostedImages, generateHubspotEmailName } from "@/lib/hubspot";
import { inlineRelativeImages } from "@/lib/inline-images";
import { renderSavedDraftHtml, draftEventCategory } from "@/lib/draft-render-server";
import { sendPushFailureEmail } from "@/lib/email";
import { isApprovalExpired, APPROVAL_LINK_TTL_DAYS } from "@/lib/approval-expiry";
import { resolveSegmentsFromRecentSend } from "@/lib/past-sends-retrieval";
import { updateCommunitySegments } from "@/lib/db/queries";

export const runtime = "nodejs";
// The approval push is the heaviest operation in the app: re-render the
// eblast, upload every photo to HubSpot File Manager, upload the template,
// resolve segments, then create the marketing email. With a few images that
// comfortably exceeds Vercel's short default, and a timeout part-way through
// is exactly how an approval ends up with no HubSpot email, a photo-less one,
// or a duplicate on the next click. Match the edits route's proven ceiling.
export const maxDuration = 60;

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

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8" } as const;

/** Load the approval + its draft, or null if the token is unknown. */
async function loadApproval(token: string) {
  const [approval] = await db
    .select()
    .from(savedDraftApprovals)
    .where(eq(savedDraftApprovals.token, token))
    .limit(1);
  if (!approval) return null;

  const [draftRow] = await db
    .select()
    .from(savedDrafts)
    .where(eq(savedDrafts.id, approval.savedDraftId))
    .limit(1);

  const draftData = draftRow?.data as Record<string, any> | undefined;
  return {
    approval,
    draftRow,
    draftData,
    subject: draftRow?.subject ?? draftData?.subject ?? "Draft",
  };
}

/** Response for a pending approval whose link has aged out. */
function expiredPage(community: string, subject: string) {
  return page({
    icon: "⌛", iconColor: "#8a8378",
    title: "This Link Has Expired",
    community,
    subject,
    body: `Approval links are only valid for ${APPROVAL_LINK_TTL_DAYS} days, and this one was sent longer ago than that. Nothing has been sent to HubSpot. Please ask the marketing team to send this eblast for approval again.`,
  });
}

/** Response for an approval that is no longer awaiting a decision. */
function decidedPage(decision: string, community: string, subject: string, pushedEmailId?: string | null) {
  if (decision === "approved") {
    return page({
      icon: "✓", iconColor: "#2d6a4f",
      title: "Already Approved",
      community,
      subject,
      body: pushedEmailId
        ? "This draft has already been approved and created in HubSpot. You can close this tab."
        : "This draft has already been approved. You can close this tab.",
    });
  }
  if (decision === "approving") {
    return page({
      icon: "⏳", iconColor: "#b45309",
      title: "Approval In Progress",
      community,
      subject,
      body: "This draft is being sent to HubSpot right now &mdash; that can take up to a minute. Please wait a moment, then refresh this page rather than clicking Approve again.",
    });
  }
  return page({
    icon: "✎", iconColor: "#b45309",
    title: "Edits Requested",
    community,
    subject,
    body: "Edit notes were already submitted for this draft. A revised version will be sent once it&rsquo;s ready.",
  });
}

/**
 * GET renders a confirmation page and NEVER changes anything.
 *
 * This used to perform the approval directly, which meant anything that
 * follows links in an email — Outlook Safe Links, corporate mail scanners,
 * inbox previewers — could approve an eblast and push it to HubSpot before
 * the salesperson ever opened it. That produced the two reported symptoms:
 * "Already Approved" on their first real click, and duplicate HubSpot drafts
 * from a single approval. Only the human's POST below approves anything.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;
  const ctx = await loadApproval(token);
  if (!ctx) {
    return new NextResponse(errorPage("Link Not Found", "This approval link is invalid or has expired."), {
      status: 404,
      headers: HTML_HEADERS,
    });
  }

  const { approval, subject } = ctx;
  const community = await getCommunity(approval.communitySlug).catch(() => null);
  const displayName = community?.displayName ?? approval.communitySlug;

  if (approval.decision !== "pending") {
    return new NextResponse(
      decidedPage(approval.decision, displayName, subject, approval.pushedEmailId),
      { headers: HTML_HEADERS },
    );
  }

  if (isApprovalExpired(approval.sentAt)) {
    return new NextResponse(expiredPage(displayName, subject), { headers: HTML_HEADERS });
  }

  const retryNote = approval.pushError
    ? `<div class="error">A previous attempt didn&rsquo;t reach HubSpot: ${esc(approval.pushError)}<br><br>You can safely try again.</div>`
    : "";

  return new NextResponse(page({
    icon: "✓", iconColor: "#2d6a4f",
    title: "Approve This Eblast?",
    community: displayName,
    subject,
    body: `Confirm below and this eblast will be created in HubSpot, ready to send.
      <form method="POST" style="margin-top:22px;">
        <button type="submit"
          style="display:inline-block;padding:13px 30px;background:#2d6a4f;color:#ffffff;
                 font-family:Arial,sans-serif;font-size:15px;font-weight:600;border:none;
                 border-radius:6px;cursor:pointer;letter-spacing:.02em;">
          ✓ &nbsp;Yes, approve and send to HubSpot
        </button>
      </form>${retryNote}`,
  }), { headers: HTML_HEADERS });
}

/** POST performs the approval — one claim, one push. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;

  const preCheck = await loadApproval(token);
  if (!preCheck) {
    return new NextResponse(errorPage("Link Not Found", "This approval link is invalid."), {
      status: 404,
      headers: HTML_HEADERS,
    });
  }

  // Refuse an aged-out link before anything can be claimed or pushed.
  if (preCheck.approval.decision === "pending" && isApprovalExpired(preCheck.approval.sentAt)) {
    const stale = await getCommunity(preCheck.approval.communitySlug).catch(() => null);
    return new NextResponse(
      expiredPage(stale?.displayName ?? preCheck.approval.communitySlug, preCheck.subject),
      { headers: HTML_HEADERS },
    );
  }

  // Atomically claim the approval: pending → approving in a single statement.
  // Whoever wins this UPDATE owns the push; everyone else (a double-click, a
  // second tab, a scanner racing the human) gets zero rows and pushes nothing.
  // This is what stops one approval producing multiple HubSpot drafts.
  const claimed = await db
    .update(savedDraftApprovals)
    .set({ decision: "approving", decidedAt: new Date(), pushError: null })
    .where(and(eq(savedDraftApprovals.token, token), eq(savedDraftApprovals.decision, "pending")))
    .returning();

  const ctx = await loadApproval(token);
  if (!ctx) {
    return new NextResponse(errorPage("Link Not Found", "This approval link is invalid."), {
      status: 404,
      headers: HTML_HEADERS,
    });
  }
  const { approval, draftRow, draftData, subject } = ctx;

  if (claimed.length === 0) {
    const community = await getCommunity(approval.communitySlug).catch(() => null);
    return new NextResponse(
      decidedPage(approval.decision, community?.displayName ?? approval.communitySlug, subject, approval.pushedEmailId),
      { headers: HTML_HEADERS },
    );
  }

  // ── Run the HubSpot push ──────────────────────────────────────────────────
  let pushError: string | null = null;
  let hubspotEmailId: string | null = null;
  let displayName = approval.communitySlug;

  try {
    if (!draftRow) throw new Error("Draft not found");

    const community = await getCommunity(approval.communitySlug);
    if (!community) throw new Error("Community not found");
    displayName = community.displayName;

    // Re-render from the draft's structured fields against the community's
    // CURRENT brand/senders, so a Community-page edit made after the approval
    // email was sent (colors, fonts, sender name/email) still lands in what
    // actually gets pushed — never a frozen snapshot from send time. Images
    // come from draft_image_bank, since the draft's own data.images has every
    // URL stripped to "" (see loadDraftImageUrls). Only legacy drafts saved
    // before `.fields` existed fall back to the raw HTML snapshot.
    let rawHtml = (await renderSavedDraftHtml(draftRow.id, draftData, community)).trim();
    if (!rawHtml) {
      rawHtml = (approval.html ?? draftData?.html ?? "").trim();
    }
    // Never push an empty body — that would create a HubSpot email showing only
    // the default compliance footer. Fail loudly instead so it can be re-sent.
    if (!rawHtml) {
      throw new Error("Approved draft has no content to push. Please re-send the draft for approval and approve again.");
    }

    const hubspotAccount = community.hubspot.account ?? "primary";
    let emailHtml = await inlineRelativeImages(rawHtml);
    const swap = await swapDataUrisForHostedImages({ html: emailHtml, folderPath: `/eblast-drafter/${community.slug}`, account: hubspotAccount });
    // Never push a partially-uploaded eblast. Failing here (and resetting to
    // pending below) means the salesperson can just click Approve again, which
    // is far better than silently creating a HubSpot email missing its photos.
    if (swap.failures.length > 0) {
      throw new Error(
        `${swap.failures.length} of ${swap.attempted} image(s) failed to upload to HubSpot ` +
        `(status ${swap.failures[0].status}). Nothing was created — please try again.`,
      );
    }
    if (swap.attempted === 0 && /<img\b/i.test(emailHtml)) {
      console.warn(`[quick-approve] ${token}: eblast has <img> tags but no data URIs to upload`);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const templateFileName = `${safeSlug(subject)}-${stamp}.html`;
    const hubspotPath = `email-templates/${community.slug}/${templateFileName}`;

    const upload = await uploadEmailTemplate({
      path: hubspotPath,
      html: swap.html,
      label: `${community.displayName} — ${templateFileName}`,
      account: hubspotAccount,
    });
    if (!upload.ok) throw new Error(`Template upload failed: ${upload.status}`);

    const segments = await resolveSegmentsFromRecentSend({
      communityId: community.id,
      fallbackIncluded: [],
      fallbackExcluded: [],
      account: hubspotAccount,
    });
    const create = await createEmail({
      name: generateHubspotEmailName({
        acronym: community.hubspot.acronym,
        eventCategory: draftEventCategory(draftData),
      }),
      subject,
      fromName: community.senders[0]?.name ?? community.displayName,
      replyTo: community.senders[0]?.email ?? "",
      templatePath: hubspotPath,
      account: hubspotAccount,
      ...segments,
    });
    if (!create.ok) throw new Error(`HubSpot create failed: ${create.status}`);
    // The created email's ID is the only proof the push actually landed.
    // Without it we must not claim the draft was approved.
    hubspotEmailId = create.body?.id ? String(create.body.id) : null;
    if (!hubspotEmailId) throw new Error("HubSpot did not return an email ID — treating this push as failed.");

    if (segments.includedListIds.length > 0 || segments.excludedListIds.length > 0) {
      updateCommunitySegments(community.slug, segments.includedListIds, segments.excludedListIds).catch(() => null);
    }
  } catch (e: any) {
    pushError = e.message ?? String(e);
    console.error(`[quick-approve] ${token}: push failed —`, pushError);
  }

  if (pushError) {
    // Release the claim so the link still works. Previously the approval was
    // marked "approved" even when the push failed, which permanently consumed
    // the link and left "Already Approved" showing for an eblast that never
    // reached HubSpot.
    await db
      .update(savedDraftApprovals)
      .set({ decision: "pending", decidedAt: null, pushError })
      .where(eq(savedDraftApprovals.token, token));

    // Don't let a failure be silent — the marketing team needs to know a
    // salesperson tried to approve and nothing reached HubSpot.
    if (approval.notifyEmail) {
      sendPushFailureEmail({
        to: approval.notifyEmail,
        reviewerEmail: approval.recipientEmail,
        communityName: displayName,
        draftSubject: subject,
        savedDraftId: approval.savedDraftId,
        error: pushError,
      }).catch((e) => console.error("[quick-approve] failure notification failed:", e));
    }

    return new NextResponse(page({
      icon: "⚠", iconColor: "#b45309",
      title: "Couldn&rsquo;t Send to HubSpot",
      community: displayName,
      subject,
      body: "Nothing was created in HubSpot, so this eblast has <strong>not</strong> been approved yet. The marketing team has been notified. You can click Approve again from your email — the link still works.",
      errorDetail: pushError,
    }), { headers: HTML_HEADERS });
  }

  // Only now is it genuinely approved: HubSpot confirmed the email exists.
  await db
    .update(savedDraftApprovals)
    .set({ decision: "approved", decidedAt: new Date(), pushedEmailId: hubspotEmailId, pushError: null })
    .where(eq(savedDraftApprovals.token, token));

  // Mark the underlying saved draft as approved — only once the HubSpot push
  // actually succeeded, so "Approved" in the Saved Drafts tab means it
  // genuinely went out, not just that someone clicked the link.
  if (draftRow) {
    await db
      .update(savedDrafts)
      .set({ approvedAt: new Date() })
      .where(eq(savedDrafts.id, draftRow.id));
  }

  return new NextResponse(page({
    icon: "✓", iconColor: "#2d6a4f",
    title: "Approved",
    community: displayName,
    subject,
    body: "This eblast has been created in HubSpot and is ready to send. You can close this tab.",
  }), { headers: HTML_HEADERS });
}
