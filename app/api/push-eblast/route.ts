import { readFile } from "node:fs/promises";
import path from "node:path";

const RELATIVE_IMG_RE = /src="(\/[^"]+\.(?:png|jpg|jpeg|gif|webp|svg))"/gi;

async function inlineRelativeImages(html: string): Promise<string> {
  const matches = [...html.matchAll(RELATIVE_IMG_RE)];
  if (matches.length === 0) return html;
  let result = html;
  for (const [fullMatch, relPath] of matches) {
    const filePath = path.join(process.cwd(), "public", relPath);
    try {
      const bytes = await readFile(filePath);
      const ext = relPath.split(".").pop()?.toLowerCase() ?? "png";
      const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
      result = result.replaceAll(fullMatch, `src="data:${mime};base64,${bytes.toString("base64")}"`);
    } catch {
      // file not in public/ — leave src as-is
    }
  }
  return result;
}
import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { uploadEmailTemplate, createEmail, swapDataUrisForHostedImages } from "@/lib/hubspot";

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
    return NextResponse.json({
      ok: false,
      steps: [{ step: "lookup_community", ok: false, status: 404, body: { error: `Unknown community: ${body.communitySlug}` } }],
    });
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
      return NextResponse.json({
        ok: false,
        steps: [{ step: "read_template", ok: false, status: 0, body: { error: String(e), path: p } }],
      });
    }
    templateFileName = body.templateFile;
  } else {
    return NextResponse.json(
      { ok: false, steps: [{ step: "validate", ok: false, status: 400, body: { error: "Provide html or templateFile" } }] },
      { status: 400 },
    );
  }

  console.log(
    `[push-eblast] community=${community.slug} subject="${body.subject}" htmlBytes=${html.length}`,
  );

  // 1) Convert relative /public image paths (logos, etc.) to data URIs so
  //    HubSpot can resolve them. swapDataUrisForHostedImages then uploads them
  //    to HubSpot File Manager and swaps the data URIs for hosted CDN URLs.
  html = await inlineRelativeImages(html);

  const swap = await swapDataUrisForHostedImages({
    html,
    folderPath: `/eblast-drafter/${community.slug}`,
  });
  console.log(
    `[push-eblast] image swap: attempted=${swap.attempted} uploaded=${swap.uploaded} bytesBefore=${swap.bytesBefore} bytesAfter=${swap.bytesAfter}`,
  );
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
        upload,
      ],
    });
  }

  // 2) Create the marketing email pointing at it.
  const segmentsPayload = {
    contactListId: community.hubspot.listId,
    includedListIds: community.hubspot.includedListIds ?? [],
    excludedListIds: community.hubspot.excludedListIds ?? [],
  };
  console.log(
    `[push-eblast] segments being sent to HubSpot:`,
    JSON.stringify(segmentsPayload),
  );
  const create = await createEmail({
    name: body.name ?? `${community.displayName} – ${body.subject}`,
    subject: body.subject,
    previewText: body.previewText,
    fromName: community.senders[0]?.name ?? community.displayName,
    replyTo: community.senders[0]?.email ?? community.email ?? "",
    templatePath: hubspotPath,
    ...segmentsPayload,
  });

  if (!create.ok) {
    console.error(`[push-eblast] create failed status=${create.status}`, JSON.stringify(create.body));
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
