import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { savedDraftApprovals, savedDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCommunity } from "@/data/communities";
import { uploadEmailTemplate, createEmail, swapDataUrisForHostedImages, generateHubspotEmailName } from "@/lib/hubspot";
import { inlineRelativeImages } from "@/lib/inline-images";
import { resolveSegmentsFromRecentSend } from "@/lib/past-sends-retrieval";
import { updateCommunitySegments } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

function safeSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

interface Props {
  params: { token: string };
  searchParams: { confirmed?: string };
}

export default async function ApprovePage({ params, searchParams }: Props) {
  const { token } = params;

  const [approval] = await db
    .select()
    .from(savedDraftApprovals)
    .where(eq(savedDraftApprovals.token, token))
    .limit(1);

  if (!approval) notFound();

  const editsUrl = `/approve/${token}/edits`;

  // ── If already decided, show a status page ───────────────────────────────
  if (approval.decision === "approved") {
    return <StatusPage status="approved" communityName={approval.communitySlug} subject={approval.draftSubject} />;
  }
  if (approval.decision === "edits_requested") {
    return <StatusPage status="edits_requested" communityName={approval.communitySlug} subject={approval.draftSubject} />;
  }

  // ── If confirmed=1 query param is set, run the HubSpot push ──────────────
  if (searchParams.confirmed === "1") {
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

      let html = await inlineRelativeImages(rawHtml);
      const swap = await swapDataUrisForHostedImages({ html, folderPath: `/eblast-drafter/${community.slug}` });
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

    // Mark approved (even if push had an error — the decision was made).
    await db
      .update(savedDraftApprovals)
      .set({ decision: "approved", decidedAt: new Date() })
      .where(eq(savedDraftApprovals.token, token));

    if (pushError) {
      return (
        <Shell>
          <Icon color="#b45309">⚠</Icon>
          <h1>Approved, but push failed</h1>
          <p>Your approval was recorded. However, the HubSpot push encountered an error:</p>
          <pre style={{ background: "#fef3c7", padding: "12px 16px", borderRadius: 6, fontSize: 13, wordBreak: "break-all" }}>{pushError}</pre>
          <p>The marketing team has been notified. They can re-push manually from the Drafter.</p>
        </Shell>
      );
    }

    return (
      <Shell>
        <Icon color="#2d6a4f">✓</Icon>
        <h1>Approved &amp; pushed to HubSpot</h1>
        <p>The draft for <strong>{approval.draftSubject}</strong> has been approved and queued in HubSpot.</p>
        <p style={{ color: "#9e9484", fontSize: 14 }}>The marketing team will be notified. You&rsquo;re all set!</p>
      </Shell>
    );
  }

  // ── Default: show confirmation page with eblast preview ──────────────────
  // The preview is loaded in an iframe via /api/draft-preview/[token] so
  // images render correctly without embedding large base64 data URIs server-side.

  return (
    <div style={{ margin: 0, padding: 0, background: "#f5f4f1", minHeight: "100vh", fontFamily: "Georgia, serif" }}>
      {/* Header */}
      <div style={{ maxWidth: 660, margin: "0 auto", padding: "40px 20px 0" }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "#9e9484", fontFamily: "Arial, sans-serif" }}>
          Eblast Draft Review
        </p>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, color: "#2d2926", fontWeight: "normal" }}>
          Confirm Approval
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: 15, lineHeight: 1.6, color: "#5c4a3a" }}>
          You&rsquo;re about to approve the draft: <em>&ldquo;{approval.draftSubject}&rdquo;</em>.
          Once approved, this eblast will be pushed to HubSpot.
        </p>

        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <a href={`/approve/${token}?confirmed=1`}
             style={{ display: "inline-block", padding: "13px 28px", background: "#2d6a4f", color: "#fff",
                      fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 600,
                      textDecoration: "none", borderRadius: 6 }}>
            ✓ &nbsp;Confirm Approval
          </a>
          <a href={editsUrl}
             style={{ display: "inline-block", padding: "13px 28px", background: "#fff", color: "#5c4a3a",
                      fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 600,
                      textDecoration: "none", borderRadius: 6, border: "1.5px solid #c9b99a" }}>
            ✎ &nbsp;Request Edits Instead
          </a>
        </div>

        {/* Eblast preview — loaded in an iframe so images render correctly */}
        <div style={{ background: "#f0ece4", borderRadius: "6px 6px 0 0", padding: "8px 24px",
                      border: "1px solid #e0ddd7", borderBottom: "none" }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase",
                      color: "#9e9484", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
            Draft preview
          </p>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e0ddd7", borderTop: "none",
                      borderRadius: "0 0 6px 6px", marginBottom: 40, overflow: "hidden" }}>
          <iframe
            src={`/api/draft-preview/${token}`}
            style={{ display: "block", width: "100%", minHeight: 900, border: "none" }}
            title="Eblast draft preview"
            scrolling="yes"
          />
        </div>

        {/* Bottom CTA repeat */}
        <div style={{ display: "flex", gap: 12, marginBottom: 48 }}>
          <a href={`/approve/${token}?confirmed=1`}
             style={{ display: "inline-block", padding: "13px 28px", background: "#2d6a4f", color: "#fff",
                      fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 600,
                      textDecoration: "none", borderRadius: 6 }}>
            ✓ &nbsp;Confirm Approval
          </a>
          <a href={editsUrl}
             style={{ display: "inline-block", padding: "13px 28px", background: "#fff", color: "#5c4a3a",
                      fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 600,
                      textDecoration: "none", borderRadius: 6, border: "1.5px solid #c9b99a" }}>
            ✎ &nbsp;Request Edits Instead
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f4f1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif" }}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

function Icon({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{ width: 64, height: 64, borderRadius: "50%", background: color, display: "flex",
                  alignItems: "center", justifyContent: "center", margin: "0 auto 24px",
                  fontSize: 28, color: "#fff" }}>
      {children}
    </div>
  );
}

function StatusPage({ status, communityName, subject }: { status: string; communityName: string; subject: string | null }) {
  const isApproved = status === "approved";
  return (
    <Shell>
      <Icon color={isApproved ? "#2d6a4f" : "#b45309"}>{isApproved ? "✓" : "✎"}</Icon>
      <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#2d2926", fontWeight: "normal" }}>
        {isApproved ? "Already approved" : "Your edits are on the way"}
      </h1>
      <p style={{ margin: "0 0 8px", fontSize: 15, lineHeight: 1.6, color: "#5c4a3a" }}>
        {isApproved
          ? "This draft has already been approved and pushed to HubSpot."
          : "You've already submitted edit notes for this draft. The team is working on the updates — once the revised version is ready, you'll receive a new review email with a fresh link to approve it."}
      </p>
      {subject && (
        <p style={{ margin: 0, fontSize: 13, color: "#9e9484", fontFamily: "Arial, sans-serif" }}>
          <em>{subject}</em>
        </p>
      )}
    </Shell>
  );
}
