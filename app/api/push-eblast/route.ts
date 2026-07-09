import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { uploadEmailTemplate, createEmail, swapDataUrisForHostedImages, generateHubspotEmailName } from "@/lib/hubspot";
import { inlineRelativeImages } from "@/lib/inline-images";
import { resolveSegmentsFromRecentSend } from "@/lib/past-sends-retrieval";
import { updateCommunitySegments } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { pastSends } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

interface PushBody {
  /** Community slug. */
  communitySlug: string;
  /** Email subject. */
  subject: string;
  /** Optional inbox preview text. */
  previewText?: string;
  /** Optional override of the draft name in HubSpot. */
  name?: string;
  /** 1–3 word generic event category (e.g. "Open House") used to build the HubSpot email name. */
  eventCategory?: string;
  /** Inline HTML to use as the email body (preferred). */
  html?: string;
  /** Or: filename of a template under data/communities/{slug}/templates/. */
  templateFile?: string;
}

function safeSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function POST(req: NextRequest) {
  let body: PushBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, steps: [{ step: "parse_body", ok: false, status: 400, body: { error: "Body must be JSON" } }] },
      { status: 400 },
    );
  }

  const community = await getCommunity(body.communitySlug);
  if (!community) {
    // Bug: missing HTTP status: 404 — response was returning 200 OK
    return NextResponse.json({
      ok: false,
      steps: [{ step: "lookup_community", ok: false, status: 404, body: { error: `Unknown community: ${body.communitySlug}` } }],
    }, { status: 404 });
  }

  // Resolve HTML: inline body wins, otherwise read from disk template.
  let html = body.html;
  let templateFileName: string;
  if (html) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    templateFileName = `${safeSlug(body.subject || "draft")}-${stamp}.html`;
  } else if (body.templateFile) {
    const p = path.join(process.cwd(), "data", "communities", community.slug, "templates", body.templateFile);
    try {
      html = await readFile(p, "utf-8");
    } catch (e: any) {
      // Bug: missing HTTP status code — response was returning 200 OK on file-not-found
      return NextResponse.json({
        ok: false,
        steps: [{ step: "read_template", ok: false, status: 404, body: { error: String(e), path: p } }],
      }, { status: 404 });
    }
    templateFileName = body.templateFile;
  } else {
    return NextResponse.json(
      { ok: false, steps: [{ step: "validate", ok: false, status: 400, body: { error: "Provide html or templateFile" } }] },
      { status: 400 },
    );
  }

  // 1) Convert relative /public image paths (logos, etc.) to data URIs so
  //    HubSpot can resolve them. swapDataUrisForHostedImages then uploads them
  //    to HubSpot File Manager and swaps the data URIs for hosted CDN URLs.
  // Bug: inlineRelativeImages had no try/catch — a failure would produce an unhandled rejection
  try {
    html = await inlineRelativeImages(html);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Image inlining failed: ${e.message ?? String(e)}` }, { status: 500 });
  }

  const swap = await swapDataUrisForHostedImages({
    html,
    folderPath: `/eblast-drafter/${community.slug}`,
  });
  if (swap.failures.length > 0) {
    console.error(`[push-eblast] image-upload failures`, JSON.stringify(swap.failures));
    return NextResponse.json({
      ok: false,
      steps: [
        {
          step: "upload_images",
          ok: false,
          status: swap.failures[0].status,
          body: {
            attempted: swap.attempted,
            uploaded: swap.uploaded,
            failures: swap.failures,
            hint:
              "If you see 401/403 here, add the `files` scope to your Private App, regenerate the token, and update HUBSPOT_PRIVATE_APP_TOKEN in Vercel env vars.",
          },
        },
      ],
    });
  }
  const finalHtml = swap.html;

  // 2) Upload the (now slim) HTML to Design Manager.
  const hubspotPath = `email-templates/${community.slug}/${templateFileName}`;
  const upload = await uploadEmailTemplate({
    path: hubspotPath,
    html: finalHtml,
    label: `${community.displayName} — ${templateFileName}`,
  });
  if (!upload.ok) {
    console.error(`[push-eblast] upload failed status=${upload.status}`, JSON.stringify(upload.body));
    return NextResponse.json({
      ok: false,
      steps: [
        {
          step: "upload_images",
          ok: true,
          status: 200,
          body: { attempted: swap.attempted, uploaded: swap.uploaded, bytesAfter: swap.bytesAfter },
        },
        { ...upload, step: "upload_template" },
      ],
    }, { status: upload.status ?? 500 });
  }

  // 2) Create the marketing email pointing at it.
  // Segments are resolved solely from the community's most recent HubSpot send.
  // If no prior send exists, the email is created with no lists attached.
  let segments: Awaited<ReturnType<typeof resolveSegmentsFromRecentSend>>;
  try {
    segments = await resolveSegmentsFromRecentSend({
      communityId: community.id,
      fallbackIncluded: [],
      fallbackExcluded: [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Segment resolution failed: ${e.message ?? String(e)}` }, { status: 500 });
  }
  const segmentsPayload = {
    includedListIds: segments.includedListIds,
    excludedListIds: segments.excludedListIds,
  };
  const create = await createEmail({
    name: body.name ?? generateHubspotEmailName({
      acronym: community.hubspot.acronym,
      eventCategory: body.eventCategory,
    }),
    subject: body.subject,
    previewText: body.previewText,
    fromName: community.senders[0]?.name ?? community.displayName,
    replyTo: community.senders[0]?.email ?? "",
    templatePath: hubspotPath,
    ...segmentsPayload,
  });

  if (!create.ok) {
    console.error(`[push-eblast] create failed status=${create.status}`, JSON.stringify(create.body));
  }

  // Always persist the segments that were used so the next push inherits them.
  updateCommunitySegments(community.slug, segments.includedListIds, segments.excludedListIds).catch(() => null);

  // Insert/upsert a past_sends record with the HubSpot email ID so
  // resolveSegmentsFromRecentSend can find this push on the next run and
  // look up the actual list assignments directly from HubSpot.
  if (create.ok && create.body?.id) {
    db.insert(pastSends)
      .values({
        hubspotEmailId: String(create.body.id),
        communityId: community.id,
        subject: body.subject,
        state: "PUBLISHED",
        publishedAt: new Date(),
        fromName: community.senders[0]?.name ?? community.displayName,
      })
      .onConflictDoUpdate({
        target: pastSends.hubspotEmailId,
        set: {
          communityId: community.id,
          subject: body.subject,
          state: "PUBLISHED",
          publishedAt: new Date(),
          syncedAt: new Date(),
        },
      })
      .catch(() => null);
  }

  return NextResponse.json({
    ok: upload.ok && create.ok,
    steps: [
      {
        step: "upload_images",
        ok: true,
        status: 200,
        body: { attempted: swap.attempted, uploaded: swap.uploaded, bytesAfter: swap.bytesAfter },
      },
      upload,
      create,
    ],
    summary: create.ok
      ? {
          emailId: create.body?.id,
          name: create.body?.name,
          state: create.body?.state,
          mode: create.body?.emailTemplateMode,
          previewText: create.body?.previewText ?? null,
          community: community.displayName,
          // Debug: what HubSpot confirmed for recipient lists
          sentSegments: segmentsPayload,
          hubspotTo: create.body?.to ?? null,
        }
      : null,
  });
}
