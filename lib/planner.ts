/**
 * Reading the eblast work out of Microsoft Planner.
 *
 * Shape of the real data, measured rather than assumed:
 *   - Tasks are created by someone else and assigned, so they arrive through
 *     "My Tasks" — a view across many plans, not a plan of its own. We ask
 *     Graph for the tasks assigned to one person.
 *   - A task title names the EVENT, not the community ("Eblast - Oktoberfest
 *     October 8"). The community is the PLAN the task sits in: every plan
 *     title is a community name, and all 22 in use matched the app's list.
 *   - The flyer is a link to a file in SharePoint, not a blob on the task, so
 *     fetching it is a second call through /shares.
 *
 * Only "Not started" tasks are ever considered. Status is what retires a task:
 * drafting one marks it In progress, and a person handling one themselves
 * marks it In progress or Complete. Either way it leaves this job's view, so
 * the same task is never drafted twice and work someone has already picked up
 * is left alone.
 */
import { GRAPH, getGraphToken, graphGet } from "@/lib/graph";

export interface PlannerTask {
  id: string;
  title: string;
  planId: string;
  dueDateTime: string | null;
  percentComplete: number;
  attachmentCount: number;
  /**
   * Planner s own ordering value for the "My Tasks" list.
   *
   * Opaque strings that sort lexicographically. This is the field that decides
   * the order someone sees in My Tasks, which is why it is carried through:
   * matching it makes Pending Drafts read in the same order as Planner.
   * Empty for tasks that have never been dragged into a position.
   */
  assigneePriority: string | null;
}

export interface PlannerAttachment {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

/** Planner's own encoding of progress. 0 not started, 50 in progress, 100 done. */
export const NOT_STARTED = 0;
export const IN_PROGRESS = 50;

/** Tasks assigned to one person, across every plan — i.e. their "My Tasks". */
export async function listAssignedTasks(userEmail: string, token?: string): Promise<PlannerTask[]> {
  const t = token ?? (await getGraphToken());
  const data = await graphGet<{ value: any[] }>(t, `/users/${encodeURIComponent(userEmail)}/planner/tasks`);
  return (data.value ?? []).map((x) => ({
    id: x.id,
    title: x.title ?? "",
    planId: x.planId,
    dueDateTime: x.dueDateTime ?? null,
    percentComplete: x.percentComplete ?? 0,
    attachmentCount: x.referenceCount ?? 0,
    assigneePriority: x.assigneePriority ?? null,
  }));
}

/** A plan's title, which is where the community name lives. */
export async function getPlanTitle(planId: string, token?: string): Promise<string | null> {
  const t = token ?? (await getGraphToken());
  try {
    const plan = await graphGet<{ title?: string }>(t, `/planner/plans/${planId}`);
    return plan.title ?? null;
  } catch {
    return null;
  }
}

/** Only the first word matters: "Eblast" is ours, "FB Event" and the rest are not. */
export function isEblastTask(title: string): boolean {
  return /^\s*eblast\b/i.test(title ?? "");
}

/**
 * Download the flyer attached to a task, if there is one.
 *
 * Planner stores an attachment as a reference keyed by the file's URL, so the
 * URL has to be resolved to the underlying file before its bytes can be read.
 * Returns null when the task has no attachment, or none that is a PDF —
 * a task without a flyer is left alone rather than drafted thin.
 */
export async function downloadTaskFlyer(taskId: string, token?: string): Promise<PlannerAttachment | null> {
  const t = token ?? (await getGraphToken());
  const details = await graphGet<{ references?: Record<string, any> }>(t, `/planner/tasks/${taskId}/details`);
  const urls = Object.keys(details.references ?? {}).map((k) => decodeURIComponent(k));
  if (urls.length === 0) return null;

  // Prefer something that looks like a PDF; the flyers always are.
  const ordered = [...urls.filter((u) => /\.pdf(\?|$)/i.test(u)), ...urls.filter((u) => !/\.pdf(\?|$)/i.test(u))];

  for (const url of ordered) {
    try {
      const shareId =
        "u!" + Buffer.from(url).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
      const item = await graphGet<{ name?: string; file?: { mimeType?: string } }>(t, `/shares/${shareId}/driveItem`);
      const mimeType = item.file?.mimeType ?? "";
      const fileName = item.name ?? "flyer.pdf";
      if (!/pdf/i.test(mimeType) && !/\.pdf$/i.test(fileName)) continue;

      const res = await fetch(`${GRAPH}/shares/${shareId}/driveItem/content`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) continue;
      return { fileName, mimeType: mimeType || "application/pdf", bytes };
    } catch {
      // Try the next reference rather than failing the whole task.
    }
  }
  return null;
}

/**
 * Mark a task In progress — never Complete. The app doesn't send anything, so
 * claiming a task is finished would be a lie; In progress says a draft exists
 * and is waiting for a person.
 *
 * Planner requires the row's current ETag on a write, which is what stops two
 * runs from stepping on each other.
 */
export async function markTaskInProgress(taskId: string, token?: string): Promise<void> {
  const t = token ?? (await getGraphToken());
  const current = await graphGet<Record<string, any>>(t, `/planner/tasks/${taskId}`);
  const etag = current["@odata.etag"];
  if (!etag) throw new Error(`No ETag for task ${taskId} — refusing to update`);

  const res = await fetch(`${GRAPH}/planner/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify({ percentComplete: IN_PROGRESS }),
  });
  if (!res.ok) throw new Error(`Could not mark task in progress — ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/**
 * Match a plan title to a community slug.
 *
 * Deliberately forgiving about "The" and punctuation ("Preserve of Roseville"
 * is the app's "The Preserve of Roseville"), and deliberately unforgiving
 * about everything else: an unrecognised plan is skipped and reported, never
 * guessed. A draft built for the wrong community is worse than no draft.
 */
export function matchCommunity<T extends { slug: string; displayName: string }>(
  planTitle: string,
  communities: T[],
): T | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
  const target = norm(planTitle);
  if (!target) return null;
  return communities.find((c) => norm(c.displayName) === target) ?? null;
}

/**
 * Read a task's status back.
 *
 * Used to confirm a mark actually stuck. Planner answering 204 to the update
 * is not proof: if the task is still Not started afterwards, tomorrow's run
 * would draft the same eblast again, so this is checked rather than assumed.
 */
export async function isTaskInProgress(taskId: string, token?: string): Promise<boolean> {
  const t = token ?? (await getGraphToken());
  const task = await graphGet<{ percentComplete?: number }>(t, `/planner/tasks/${taskId}`);
  return (task.percentComplete ?? 0) >= IN_PROGRESS;
}

/**
 * Put a task back to Not started.
 *
 * Used when a draft was abandoned: the half-made eblast is deleted outright,
 * so leaving the task In progress would tell the marketing team it was handled
 * when nothing exists. Un-checking it makes Planner agree with reality and
 * lets the task be picked up again.
 */
export async function markTaskNotStarted(taskId: string, token?: string): Promise<void> {
  const t = token ?? (await getGraphToken());
  const current = await graphGet<Record<string, any>>(t, `/planner/tasks/${taskId}`);
  if ((current.percentComplete ?? 0) === NOT_STARTED) return;
  const etag = current["@odata.etag"];
  if (!etag) throw new Error(`No ETag for task ${taskId} — refusing to update`);

  const res = await fetch(`${GRAPH}/planner/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify({ percentComplete: NOT_STARTED }),
  });
  if (!res.ok) {
    throw new Error(`Could not un-check task — ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
