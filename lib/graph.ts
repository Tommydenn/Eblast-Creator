/**
 * Microsoft Graph, app-only (client credentials).
 *
 * No SDK — just fetch. The same app registration backs everything here, so a
 * permission granted once is available to every caller: Mail.Send for the
 * approval emails, Tasks.ReadWrite.All for Planner, Files.Read.All for the
 * flyers those tasks link to.
 */

export const GRAPH = "https://graph.microsoft.com/v1.0";

export async function getGraphToken(): Promise<string> {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env;
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error("GRAPH_TENANT_ID, GRAPH_CLIENT_ID, and GRAPH_CLIENT_SECRET must all be set");
  }
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Graph auth failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** GET a Graph path and parse JSON, throwing with Graph's own error text. */
export async function graphGet<T = any>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      detail = `${parsed?.error?.code ?? res.status}: ${parsed?.error?.message ?? detail}`;
    } catch {}
    throw new Error(`Graph GET ${path} failed — ${detail}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}
