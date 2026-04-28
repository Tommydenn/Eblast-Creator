import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCommunity } from "@/data/communities";
import { uploadEmailTemplate, createEmail } from "@/lib/hubspot";

export const runtime = "nodejs";

interface PushBody {
  /** Community slug, e.g. "caretta-bellevue" */
  communitySlug: string;
  /** Filename of the template under data/communities/{slug}/templates/ */
  templateFile: string;
  /** Subject line for the marketing email. */
  subject: string;
  /** Optional inbox preview text. */
  previewText?: string;
  /** Optional name; defaults to "{Community} – {filename}". */
  name?: string;
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
      steps: [{
        step: "lookup_community",
        ok: false,
        status: 404,
        body: { error: `Unknown community slug: ${body.communitySlug}` },
      }],
    });
  }

  // Resolve template HTML on disk.
  const templatePath = path.join(
    process.cwd(),
    "data",
    "communities",
    community.slug,
    "templates",
    body.templateFile,
  );
  let html: string;
  try {
    html = await readFile(templatePath, "utf-8");
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      steps: [{ step: "read_template", ok: false, status: 0, body: { error: String(e), path: templatePath } }],
    });
  }

  // 1) Upload to Design Manager as coded email template.
  // Use a stable per-community path so re-runs overwrite cleanly.
  const hubspotPath = `email-templates/${community.slug}/${body.templateFile}`;
  const upload = await uploadEmailTemplate({
    path: hubspotPath,
    html,
    label: `${community.displayName} — ${body.templateFile}`,
  });

  if (!upload.ok) {
    return NextResponse.json({ ok: false, steps: [upload] });
  }

  // 2) Create the marketing email pointing at it.
  const create = await createEmail({
    name: body.name ?? `${community.displayName} – ${body.templateFile}`,
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
