// Minimal HubSpot Marketing Email API client.
// Use a Private App token with `content` scope.

const HUBSPOT_BASE = "https://api.hubapi.com";

function authHeader() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN is not set in .env.local");
  return { Authorization: `Bearer ${token}` };
}

function authHeaders() {
  return { ...authHeader(), "Content-Type": "application/json" };
}

// ---------- types ---------------------------------------------------------

export interface CreateEmailInput {
  name: string;
  subject: string;
  previewText?: string;
  fromName?: string;
  replyTo?: string;
  templatePath?: string;
  /** Numeric HubSpot list ID for `to.contactLists.include`. */
  contactListId?: number;
}

export interface ApiCallResult {
  step: string;
  ok: boolean;
  status: number;
  body: any;
}

// ---------- helpers -------------------------------------------------------

async function call(step: string, init: { method: string; url: string; body?: any }): Promise<ApiCallResult> {
  const res = await fetch(init.url, {
    method: init.method,
    headers: authHeaders(),
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { step, ok: res.ok, status: res.status, body: parsed };
}

// ---------- HubL email-template wrapping ----------------------------------
//
// HubSpot rejects raw HTML uploaded as a coded email template. The template
// must declare its type and contain the legally-required modules (CAN-SPAM
// footer with unsubscribe + physical address). We wrap our designed HTML
// with the minimum HubL boilerplate needed to clear validation, while keeping
// the design intact. Our footer's hardcoded copy is replaced with HubSpot's
// `email_footer` module so the unsubscribe links resolve to real values.

function wrapAsHubLEmailTemplate(html: string, label: string): string {
  // Strip the user-facing footer (we replace it with HubSpot's required module).
  // Keep everything else as-is.
  const stripped = html
    // Remove our "A Great Lakes Management Community / Unsubscribe / Manage prefs" row
    .replace(/<tr>\s*<td class="px"[^>]*padding: 22px 36px 32px 36px[\s\S]*?<\/td>\s*<\/tr>/, "")
    // Replace the {{unsubscribe_link}} / {{manage_preferences}} placeholders just in case
    .replace(/\{\{\s*unsubscribe_link\s*\}\}/g, "{{ unsubscribe_link }}")
    .replace(/\{\{\s*manage_preferences\s*\}\}/g, "{{ unsubscribe_section_url }}");

  return `<!--
  templateType: email
  isAvailableForNewContent: true
  label: ${label}
-->
${stripped}

{# HubSpot-required CAN-SPAM compliance footer (unsubscribe + physical address) #}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FBF7EE;">
  <tr><td align="center" style="padding: 16px 36px 32px 36px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #888; line-height: 1.7;">
    A Great Lakes Management Community<br>
    {% module_block module "compliance_footer" path="@hubspot/email_footer", label="Email footer" %}
      {% module_attribute "show_address" %}true{% end_module_attribute %}
      {% module_attribute "show_can_spam_message" %}false{% end_module_attribute %}
    {% end_module_block %}
  </td></tr>
</table>
`;
}

// ---------- API surface ---------------------------------------------------

// ---------- File Manager (image hosting) ---------------------------------

export interface UploadedFile {
  ok: boolean;
  url?: string;
  id?: string;
  status: number;
  body: any;
}

/**
 * Upload a single image to HubSpot's File Manager. Returns the public URL we
 * can reference from the email HTML (e.g. https://*.hubspotusercontent**.net/...).
 *
 * Required scope on the Private App: `files`.
 */
export async function uploadImageToFileManager(opts: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  folderPath: string; // e.g. "/eblast-drafter/caretta-bellevue"
}): Promise<UploadedFile> {
  const url = `${HUBSPOT_BASE}/files/v3/files`;

  // Buffer → Uint8Array view: TypeScript strict mode doesn't accept
  // Buffer directly as a BlobPart in newer Node typings.
  const bytesView = new Uint8Array(opts.bytes.buffer, opts.bytes.byteOffset, opts.bytes.byteLength);

  const form = new FormData();
  form.append("file", new Blob([bytesView], { type: opts.mimeType }), opts.fileName);
  form.append("folderPath", opts.folderPath);
  form.append(
    "options",
    JSON.stringify({
      access: "PUBLIC_NOT_INDEXABLE",
      overwrite: false,
      duplicateValidationStrategy: "NONE",
      duplicateValidationScope: "EXACT_FOLDER",
    }),
  );

  const res = await fetch(url, {
    method: "POST",
    headers: authHeader(), // do NOT set Content-Type; FormData sets the boundary
    body: form,
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  return {
    ok: res.ok,
    status: res.status,
    body: parsed,
    url: parsed?.url,
    id: parsed?.id,
  };
}

/**
 * Find every `data:image/...;base64,...` URI in the HTML, upload each unique
 * image to HubSpot File Manager, and return the HTML with the data URIs
 * swapped for hosted URLs.
 */
export async function swapDataUrisForHostedImages(opts: {
  html: string;
  folderPath: string;
}): Promise<{
  html: string;
  attempted: number;
  uploaded: number;
  failures: Array<{ status: number; body: any }>;
  bytesBefore: number;
  bytesAfter: number;
}> {
  const bytesBefore = opts.html.length;
  const dataUriRegex = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;

  // Find unique data URIs (an image referenced multiple times only uploads once).
  const seen = new Map<string, { mime: string; bytes: Buffer }>();
  let m: RegExpExecArray | null;
  while ((m = dataUriRegex.exec(opts.html)) !== null) {
    if (!seen.has(m[0])) {
      seen.set(m[0], { mime: m[1], bytes: Buffer.from(m[2], "base64") });
    }
  }

  const failures: Array<{ status: number; body: any }> = [];
  if (seen.size === 0) {
    return { html: opts.html, attempted: 0, uploaded: 0, failures, bytesBefore, bytesAfter: bytesBefore };
  }

  // Upload each in parallel.
  const uploads = await Promise.all(
    Array.from(seen.entries()).map(async ([dataUri, { mime, bytes }]) => {
      const ext = mime.replace("image/", "").replace("jpeg", "jpg");
      const hash = createHashShort(bytes);
      const fileName = `${hash}.${ext}`;
      const result = await uploadImageToFileManager({
        bytes,
        mimeType: mime,
        fileName,
        folderPath: opts.folderPath,
      });
      return { dataUri, result };
    }),
  );

  // Replace data URIs with hosted URLs (or leave intact if upload failed).
  let html = opts.html;
  let uploaded = 0;
  for (const { dataUri, result } of uploads) {
    if (result.ok && result.url) {
      html = html.split(dataUri).join(result.url);
      uploaded++;
    } else {
      failures.push({ status: result.status, body: result.body });
    }
  }

  return {
    html,
    attempted: uploads.length,
    uploaded,
    failures,
    bytesBefore,
    bytesAfter: html.length,
  };
}

function createHashShort(bytes: Buffer): string {
  // Tiny fnv-1a hash — enough for filename uniqueness, doesn't need crypto.
  let h = 0x811c9dc5;
  const len = Math.min(bytes.length, 4096);
  for (let i = 0; i < len; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------- coded email templates ----------------------------------------

/**
 * Upload an HTML file as a coded email template via the Design Manager
 * source-code API. The endpoint expects multipart/form-data — JSON returns
 * 415 Unsupported Media Type.
 */
export async function uploadEmailTemplate(opts: {
  path: string;       // e.g. "email-templates/caretta-dining.html"
  html: string;
  label?: string;
}): Promise<ApiCallResult> {
  const wrapped = wrapAsHubLEmailTemplate(opts.html, opts.label ?? "Eblast Drafter Template");
  const url = `${HUBSPOT_BASE}/cms/v3/source-code/published/content/${opts.path}`;

  const fileName = opts.path.split("/").pop() ?? "template.html";
  const blob = new Blob([wrapped], { type: "text/html" });
  const form = new FormData();
  form.append("file", blob, fileName);

  const res = await fetch(url, {
    method: "PUT",
    headers: authHeader(), // do NOT set Content-Type; fetch sets the multipart boundary
    body: form,
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { step: "upload_template", ok: res.ok, status: res.status, body: parsed };
}

/**
 * Create a marketing email draft. If `templatePath` is provided we use HTML
 * mode pointing at the uploaded coded template. Otherwise we create a basic
 * drag-and-drop draft with just the metadata.
 */
export async function createEmail(input: CreateEmailInput): Promise<ApiCallResult> {
  const body: any = {
    name: input.name,
    subject: input.subject,
    type: "BATCH_EMAIL",
  };

  if (input.previewText) body.previewText = input.previewText;
  if (input.fromName || input.replyTo) {
    body.from = {
      ...(input.fromName ? { fromName: input.fromName } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    };
  }
  if (input.templatePath) {
    body.emailTemplateMode = "HTML";
    body.content = { templatePath: input.templatePath };
  }
  if (input.contactListId) {
    body.to = { contactLists: { include: [input.contactListId], exclude: [] } };
  }

  return call("create_email", {
    method: "POST",
    url: `${HUBSPOT_BASE}/marketing/v3/emails`,
    body,
  });
}
