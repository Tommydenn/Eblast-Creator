import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { uploadEmailTemplate, createEmail } from "@/lib/hubspot";

export const runtime = "nodejs";

export async function POST() {
  const htmlPath = path.join(process.cwd(), "public", "caretta-dining-info-session.html");

  let html: string;
  try {
    html = await readFile(htmlPath, "utf-8");
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      steps: [{ step: "read_html", ok: false, status: 0, body: { error: String(e), path: htmlPath } }],
    });
  }

  // Step 1: upload HTML to Design Manager as a coded email template.
  // We use a stable path so re-runs overwrite rather than spam the file tree.
  const templatePath = "email-templates/caretta-dining-info-session.html";
  const upload = await uploadEmailTemplate({
    path: templatePath,
    html,
    label: "Caretta Dining Info Session (Eblast Drafter)",
  });

  if (!upload.ok) {
    return NextResponse.json({
      ok: false,
      steps: [upload],
      hint:
        "Template upload failed. Most common cause: token missing 'content' scope, " +
        "or HubL validation rejecting our wrapper. Body has the exact reason.",
    });
  }

  // Step 2: create the marketing email referencing the template path.
  const create = await createEmail({
    name: "Caretta Bellevue – Dining Director Info Session [Claude design]",
    subject: "You're invited: Get a taste of life at Caretta",
    previewText: "Wed, May 13 at 2 PM. Live snack demo with Rebekah, our Dining Director from Unidine.",
    fromName: process.env.HUBSPOT_DEFAULT_FROM_NAME,
    replyTo: process.env.HUBSPOT_DEFAULT_REPLY_TO,
    templatePath,
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
        }
      : null,
  });
}
