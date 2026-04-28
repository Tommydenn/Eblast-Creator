import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { uploadEmailTemplate, createEmail } from "@/lib/hubspot";

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

  const community = getCommunity(body.communitySlug);
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

  // 1) Upload to Design Manager.
  const hubspotPath = `email-templates/${community.slug}/${templateFileName}`;
  const upload = await uploadEmailTemplate({
    path: hubspotPath,
    html,
    label: `${community.displayName} — ${templateFileName}`,
  });
  if (!upload.ok) return NextResponse.json({ ok: false, steps: [upload] });

  // 2) Create the marketing email pointing at it.
  const create = await createEmail({
    name: body.name ?? `${community.displayName} – ${body.subject}`,
    subject: body.subject,
    previewText: body.previewText,
    fromName: community.sender.name,
    replyTo: community.sender.email,
    templatePath: hubspotPath,
    contactListId: community.hubspot.listId,
  });

  return NextResponse.json({
    ok: upload.ok && create.ok,
    steps: [upload, create],
    summary: create.ok
      ? {
          emailId: create.body?.id,
          name: create.body?.name,
          state: create.body?.state,
          mode: create.body?.emailTemplateMode,
          community: community.displayName,
        }
      : null,
  });
}
