import nodemailer from "nodemailer";

function createTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error("SMTP_USER and SMTP_PASS must be set");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.office365.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: { user, pass },
    tls: { ciphers: "SSLv3" },
  });
}

const FROM = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "Eblast Drafter";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

/** Extract the HTML between <body> tags, or return full html if not found. */
function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1].trim() : html;
}

/** First name from a full name string. */
function firstName(name: string | null | undefined): string {
  if (!name) return "there";
  return name.trim().split(/\s+/)[0];
}

export interface SendApprovalEmailParams {
  to: string;
  recipientName: string | null | undefined;
  communityName: string;
  draftSubject: string;
  draftHtml: string;
  token: string;
}

export async function sendApprovalEmail(params: SendApprovalEmailParams) {
  const { to, recipientName, communityName, draftSubject, draftHtml, token } = params;
  // Quick-approve route processes the push and returns a minimal confirmation page.
  const approveUrl = `${APP_URL}/api/quick-approve/${token}`;
  const editsUrl = `${APP_URL}/approve/${token}/edits`;
  const greeting = firstName(recipientName);
  const eblastBody = extractBody(draftHtml);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Draft Review: ${draftSubject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f4f1;font-family:Georgia,'Times New Roman',serif;">

<!-- Header / intro -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding:32px 16px 0;">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#ffffff;border-radius:8px 8px 0 0;padding:40px 48px 32px;border:1px solid #e0ddd7;border-bottom:none;">
        <tr>
          <td>
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9e9484;font-family:Arial,sans-serif;">
              Eblast Draft Review &mdash; ${communityName}
            </p>

            <p style="margin:12px 0 6px;font-size:16px;line-height:1.6;color:#3d3530;">
              Hi ${greeting},
            </p>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3d3530;">
              A new Eblast draft is ready for your review. Please take a look at the email below and let us know if it looks good or if you&rsquo;d like any changes made before it goes out. Thanks!
            </p>

            <!-- CTA buttons -->
            <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
              <tr>
                <td style="padding-right:12px;">
                  <a href="${approveUrl}"
                     style="display:inline-block;padding:13px 28px;background:#2d6a4f;color:#ffffff;
                            font-family:Arial,sans-serif;font-size:15px;font-weight:600;
                            text-decoration:none;border-radius:6px;letter-spacing:.02em;">
                    ✓ &nbsp;Approve
                  </a>
                </td>
                <td>
                  <a href="${editsUrl}"
                     style="display:inline-block;padding:13px 28px;background:#ffffff;color:#5c4a3a;
                            font-family:Arial,sans-serif;font-size:15px;font-weight:600;
                            text-decoration:none;border-radius:6px;letter-spacing:.02em;
                            border:1.5px solid #c9b99a;">
                    ✎ &nbsp;Request Edits
                  </a>
                </td>
              </tr>
            </table>

            <!-- Subject line below buttons — envelope icon signals it belongs to the eblast -->
            <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
              <tr>
                <td style="background:#f7f5f0;border:1px solid #e0ddd7;border-radius:6px;padding:12px 16px;">
                  <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
                    <tr>
                      <td width="28" valign="middle" style="padding-right:10px;">
                        <!-- Envelope icon -->
                        <svg width="18" height="14" viewBox="0 0 18 14" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                          <rect x="0" y="0" width="18" height="14" rx="2" fill="none" stroke="#9e8c7a" stroke-width="1.5"/>
                          <polyline points="0,0 9,8 18,0" fill="none" stroke="#9e8c7a" stroke-width="1.5"/>
                        </svg>
                      </td>
                      <td valign="middle">
                        <p style="margin:0 0 2px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#9e9484;font-family:Arial,sans-serif;">Eblast Subject Line</p>
                        <p style="margin:0;font-size:15px;color:#2d2926;font-family:Arial,sans-serif;font-weight:600;line-height:1.3;">
                          ${draftSubject}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Divider label -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding:0 16px;">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#f0ece4;border-left:1px solid #e0ddd7;border-right:1px solid #e0ddd7;padding:10px 48px;">
        <tr>
          <td>
            <p style="margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;
                      color:#9e9484;font-family:Arial,sans-serif;text-align:center;">
              Draft email preview below &mdash; scroll to see the full email
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Eblast content -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding:0 16px 32px;">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#ffffff;border:1px solid #e0ddd7;border-top:none;
                    border-radius:0 0 8px 8px;padding:0;">
        <tr>
          <td>
            ${eblastBody}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

</body>
</html>`;

  return createTransport().sendMail({
    from: FROM,
    to,
    subject: `Draft review: ${draftSubject} — ${communityName}`,
    html,
  });
}

export interface SendEditNotificationParams {
  to: string;
  recipientName: string | null | undefined;
  communityName: string;
  draftSubject: string;
  editNotes: string;
  savedDraftId: string;
}

export async function sendEditNotificationEmail(params: SendEditNotificationParams) {
  const { to, recipientName, communityName, draftSubject, editNotes, savedDraftId } = params;
  const senderFirst = firstName(recipientName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Edit Request</title></head>
<body style="margin:0;padding:32px 16px;background:#f5f4f1;font-family:Arial,sans-serif;">
  <table width="560" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#ffffff;border-radius:8px;padding:40px 48px;border:1px solid #e0ddd7;margin:0 auto;">
    <tr>
      <td>
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9e9484;">
          Edit Request Received
        </p>
        <h2 style="margin:0 0 24px;font-size:20px;color:#2d2926;font-weight:normal;">
          ${communityName}
        </h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d3530;">
          <strong>${senderFirst}</strong> has reviewed the draft and requested edits.
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#7a7066;">Subject: <em>${draftSubject}</em></p>
        <div style="background:#faf8f4;border-left:3px solid #c9b99a;border-radius:0 6px 6px 0;
                    padding:16px 20px;margin:16px 0 24px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;
                    color:#9e9484;">Their notes:</p>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#2d2926;white-space:pre-wrap;">${editNotes}</p>
        </div>
        <p style="margin:0;font-size:14px;color:#7a7066;">
          Draft ID for reference: <code style="font-size:12px;color:#5c4a3a;">${savedDraftId}</code>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return createTransport().sendMail({
    from: FROM,
    to,
    subject: `Edit request from ${senderFirst}: ${draftSubject} — ${communityName}`,
    html,
  });
}
