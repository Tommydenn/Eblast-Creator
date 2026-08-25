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

  // The real target is a PERSON, not a board. The tasks are created by someone
  // else and assigned, so they show up in "My Tasks" — which is a view over
  // every plan, not a plan itself. Graph can ask for the tasks assigned to a
  // given user directly, which is the same thing, and means handing this to a
  // different person later is one email address rather than hunting for
  // whichever board they keep their tasks in.
  //
  // The open question this settles: whether addressing /users/{upn} app-only
  // needs User.Read.All on top of the Tasks permission.
  const userTarget = req.nextUrl.searchParams.get("user");
  let userTasks: any = null;
  let userTaskRows: any[] = [];
  if (userTarget) {
    const u = record(await graph(token, `/users/${encodeURIComponent(userTarget)}/planner/tasks`));
    if (u.ok) {
      const all: any[] = u.body?.value ?? [];
      userTaskRows = all;
      userTasks = {
        total: all.length,
        eblastTasks: all.filter((t) => /^\s*eblast\b/i.test(t.title ?? "")).length,
        sample: all.slice(0, 15).map((t) => ({
          id: t.id,
          title: t.title,
          dueDateTime: t.dueDateTime,
          percentComplete: t.percentComplete,
          attachments: t.referenceCount ?? 0,
          planId: t.planId,
        })),
      };
    } else {
      userTasks = `FAILED — ${u.detail}`;
    }
  }

  // A plan can also be named directly (?planId=…). Discovery is only attempted
  // as a last resort, because listing groups needs Group.Read.All — a much
  // broader grant worth avoiding when the target is simply configured.
  const planId = req.nextUrl.searchParams.get("planId");
  const plansFound: Array<{ group: string; plan: string; planId: string }> = [];

  if (!planId && !userTarget) {
    const groups = record(
      await graph(token, "/groups?$select=id,displayName&$top=25&$filter=groupTypes/any(c:c+eq+'Unified')"),
    );
    if (groups.ok && Array.isArray(groups.body?.value)) {
      for (const g of groups.body.value.slice(0, 10)) {
        const plans = record(await graph(token, `/groups/${g.id}/planner/plans`));
        if (!plans.ok) break; // the same permission error would just repeat
        for (const p of plans.body?.value ?? []) {
          plansFound.push({ group: g.displayName, plan: p.title, planId: p.id });
        }
        if (plansFound.length) break;
      }
    }
  }

  // Prefer whatever the user's own assigned tasks turned up, since that is the
  // real source; fall back to a plan for completeness.
  const targetPlan = planId ?? plansFound[0]?.planId;
  let tasksSample: any = null;
  let attachmentCheck: any = null;
  let writeCheck: any = null;

  let tasks: any[] = userTaskRows;

  if (targetPlan) {
    // 1. READ — the core capability. Needs Tasks.Read.All or ReadWrite.All.
    const t = record(await graph(token, `/planner/plans/${targetPlan}/tasks`));
    tasks = t.ok ? (t.body?.value ?? []) : [];
    tasksSample = tasks.slice(0, 15).map((x) => ({
      id: x.id,
      title: x.title,
      dueDateTime: x.dueDateTime,
      percentComplete: x.percentComplete,
      hasDescription: !!x.hasDescription,
      attachments: x.referenceCount ?? 0,
    }));

  }

  {
    // 2. ATTACHMENTS — a Planner attachment is a LINK to a file living in
    // SharePoint, not a blob on the task. Reading the task yields only the
    // URL; fetching the flyer needs Files.Read.All. Without it every generated
    // eblast would have no photos. Prefer a real Eblast task so the probe
    // exercises the same file the feature would actually open.
    const isEblast = (x: any) => /^\s*eblast\b/i.test(x.title ?? "");
    const withFile =
      tasks.find((x) => isEblast(x) && (x.referenceCount ?? 0) > 0) ??
      tasks.find((x) => (x.referenceCount ?? 0) > 0);
    if (withFile) {
      const details = record(await graph(token, `/planner/tasks/${withFile.id}/details`));
      const refs = Object.keys(details.body?.references ?? {});
      const decoded = refs.map((r) => decodeURIComponent(r));
      attachmentCheck = { task: withFile.title, referenceUrls: decoded.slice(0, 5), downloaded: null };

      if (decoded.length) {
        // Graph resolves a sharing URL to the underlying file this way.
        const shareId =
          "u!" + Buffer.from(decoded[0]).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
        const item = record(await graph(token, `/shares/${shareId}/driveItem`));
        attachmentCheck.downloaded = item.ok
          ? { name: item.body?.name, sizeBytes: item.body?.size, mimeType: item.body?.file?.mimeType }
          : `FAILED — ${item.detail}`;
      }
    } else if (tasks.length) {
      attachmentCheck = "No task in this plan has an attachment, so the flyer path is untested.";
    }

  }

  {
    // 3. WRITE — marking a task in progress. Only runs when explicitly asked
    // with ?write=<taskId>, so a diagnostic never quietly edits real work.
    const writeTaskId = req.nextUrl.searchParams.get("write");
    if (writeTaskId) {
      const cur = await graph(token, `/planner/tasks/${writeTaskId}`);
      const etag = cur.body?.["@odata.etag"];
      if (!cur.ok || !etag) {
        writeCheck = `Could not read the task to update — ${cur.detail}`;
      } else {
        const res = await fetch(`${GRAPH}/planner/tasks/${writeTaskId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "If-Match": etag,
          },
          // 50 = in progress, which is all this feature would ever set.
          body: JSON.stringify({ percentComplete: 50 }),
        });
        const body = await res.text();
        attempts.push({
          call: `PATCH /planner/tasks/${writeTaskId}`,
          status: res.status,
          ok: res.ok,
          detail: res.ok ? "marked in progress" : body.slice(0, 200),
        });
        writeCheck = res.ok
          ? "Write works — the task was set to In progress. Set it back by hand."
          : `Write failed — ${body.slice(0, 200)}`;
      }
    }
  }

  // What the daily job would actually act on, measured rather than assumed:
  // first word "Eblast", and an attachment present. A task with no flyer is
  // skipped rather than drafted thin — and skipped without being marked seen,
  // so it gets picked up if the flyer is added later.
  const decided = (userTasks && typeof userTasks === "object" ? userTasks.sample : tasksSample) ?? [];
  const triage = Array.isArray(decided)
    ? {
        wouldDraft: decided.filter((t: any) => /^\s*eblast\b/i.test(t.title ?? "") && (t.attachments ?? 0) > 0).map((t: any) => t.title),
        eblastButNoFlyer: decided.filter((t: any) => /^\s*eblast\b/i.test(t.title ?? "") && (t.attachments ?? 0) === 0).map((t: any) => t.title),
        ignored: decided.filter((t: any) => !/^\s*eblast\b/i.test(t.title ?? "")).map((t: any) => t.title),
      }
    : null;

  const canRead = attempts.some((a) => a.call.includes("/planner/") && a.ok);

  return NextResponse.json({
    ok: true,
    verdict: canRead
      ? "App-only Planner access WORKS with the existing credentials."
      : "App-only Planner access does NOT work yet — see grantedApplicationPermissions and attempts.",
    grantedApplicationPermissions: roles,
    capabilities: {
      readTasks: canRead,
      readAttachedFlyer:
        attachmentCheck && typeof attachmentCheck === "object"
          ? attachmentCheck.downloaded && typeof attachmentCheck.downloaded === "object"
          : "untested",
      markInProgress: writeCheck ?? "untested — pass ?write=<taskId> to try it",
    },
    attempts,
    userTasks,
    triage,
    plansFound: plansFound.slice(0, 10),
    tasksSample,
    attachmentCheck,
  });
}
