/**
 * TEMPORARY diagnostic — delete once the Planner question is answered.
 *
 * Answers one thing: can this app read Microsoft Planner with the app-only
 * (client-credentials) Graph token it already uses to send mail, with no
 * signed-in user? Graph's Planner endpoints were delegated-only for years, so
 * this has to be measured rather than assumed before any of the scheduled
 * drafting work is designed around it.
 *
 * Read-only. It acquires a token, reports which application permissions are
 * actually consented, and attempts the exact calls the feature would need.
 * It never writes to Planner, the database, or anything else.
 *
 * Protected by SPIKE_SECRET so only a caller holding that value can run it.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.microsoft.com/v1.0";

type Attempt = { call: string; status: number; ok: boolean; detail: string };

/** Read the roles claim without verifying — this is our own token, not input. */
function tokenRoles(jwt: string): string[] {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString("utf8"));
    return Array.isArray(payload.roles) ? payload.roles : [];
  } catch {
    return [];
  }
}

async function graph(token: string, path: string): Promise<Attempt & { body: any }> {
  const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  const detail = res.ok
    ? `${Array.isArray(body?.value) ? body.value.length + " item(s)" : "ok"}`
    : `${body?.error?.code ?? "?"}: ${String(body?.error?.message ?? "").slice(0, 200)}`;
  return { call: path, status: res.status, ok: res.ok, detail, body };
}

export async function GET(req: NextRequest) {
  const expected = process.env.SPIKE_SECRET ?? "";
  if (!expected || req.nextUrl.searchParams.get("key") !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env;
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    return NextResponse.json({ ok: false, error: "Graph credentials are not configured" }, { status: 500 });
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GRAPH_CLIENT_ID,
        client_secret: GRAPH_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!tokenRes.ok) {
    return NextResponse.json(
      { ok: false, step: "token", status: tokenRes.status, detail: (await tokenRes.text()).slice(0, 300) },
      { status: 502 },
    );
  }
  const token = ((await tokenRes.json()) as { access_token: string }).access_token;
  const roles = tokenRoles(token);

  const attempts: Attempt[] = [];
  const record = (a: Attempt & { body?: any }) => {
    attempts.push({ call: a.call, status: a.status, ok: a.ok, detail: a.detail });
    return a;
  };

  // Which Microsoft 365 groups exist — every Team has one, and Planner plans
  // hang off them. Needs Group.Read.All or Directory.Read.All.
  const groups = record(
    await graph(token, "/groups?$select=id,displayName&$top=25&$filter=groupTypes/any(c:c+eq+'Unified')"),
  );

  // The two calls the feature actually depends on: find the plans in a group,
  // then read that plan's tasks. Needs Tasks.Read.All as an APPLICATION
  // permission — the thing in question.
  const plansFound: Array<{ group: string; plan: string; planId: string }> = [];
  let tasksSample: any = null;

  if (groups.ok && Array.isArray(groups.body?.value)) {
    for (const g of groups.body.value.slice(0, 10)) {
      const plans = record(await graph(token, `/groups/${g.id}/planner/plans`));
      if (!plans.ok) break; // same permission error will repeat; one is enough
      for (const p of plans.body?.value ?? []) {
        plansFound.push({ group: g.displayName, plan: p.title, planId: p.id });
      }
      if (plansFound.length) break;
    }
  }

  if (plansFound.length) {
    const t = record(await graph(token, `/planner/plans/${plansFound[0].planId}/tasks`));
    if (t.ok) {
      tasksSample = (t.body?.value ?? []).slice(0, 5).map((x: any) => ({
        title: x.title,
        dueDateTime: x.dueDateTime,
        bucketId: x.bucketId,
        percentComplete: x.percentComplete,
        hasDescription: !!x.hasDescription,
        referenceCount: x.referenceCount,
      }));
    }
  }

  const plannerWorks = attempts.some((a) => a.call.includes("/planner/") && a.ok);

  return NextResponse.json({
    ok: true,
    verdict: plannerWorks
      ? "App-only Planner access WORKS with the existing credentials."
      : "App-only Planner access does NOT work yet — see grantedApplicationPermissions and attempts.",
    grantedApplicationPermissions: roles,
    hasTasksPermission: roles.some((r) => r.startsWith("Tasks.")),
    attempts,
    plansFound: plansFound.slice(0, 10),
    tasksSample,
  });
}
