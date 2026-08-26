/**
 * Starting the pass, and handing off to a fresh run when work is left.
 *
 * Vercel stops a function at five minutes. Rather than trying to fit a whole
 * backlog into that, a run does what it can and asks for another one, which
 * picks up where it left off. Repeating that clears any size of backlog in one
 * sitting without any single run ever being cut off.
 */
import { runPlannerDraftPass, type PlannerRunSummary } from "@/lib/planner-drafts";
import { MAX_CHAIN, claimRun, finishRun, type RunTrigger } from "@/lib/planner-run";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Ask for another run. Waits only long enough to know the request went out.
 *
 * Pure fire-and-forget isn't safe here: returning a response ends the
 * invocation, so a request that hasn't been dispatched yet dies with it, and
 * the chain silently stops. Next 14 has no after() to defer work past the
 * response, so instead this waits a moment for the next run to pick up and
 * then stops waiting — the successor has its own five minutes and doesn't
 * need this one to stay alive.
 */
async function requestNextRun(chainIndex: number): Promise<boolean> {
  const secret = process.env.CRON_SECRET ?? "";
  const url = `${appUrl()}/api/cron/plan-eblasts?chain=${chainIndex}`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 4000);
  try {
    await fetch(url, {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      signal: abort.signal,
    });
    return true;
  } catch (e: any) {
    // An abort here is the expected path: the next run is under way and this
    // one simply stopped waiting for it to finish.
    if (e?.name === "AbortError") return true;
    console.error("[planner] could not start the next run:", e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface StartRunResult {
  started: boolean;
  runId?: string;
  reason?: string;
  summary?: PlannerRunSummary;
  handedOff?: boolean;
}

/**
 * One run, start to finish, chaining if there is more to do.
 *
 * Returns without starting when another run already holds the lock, which is
 * what stops the morning schedule and the Run now button from colliding.
 */
export async function startPlannerRun(trigger: RunTrigger, chainIndex = 0): Promise<StartRunResult> {
  const runId = await claimRun(trigger, chainIndex);
  if (!runId) return { started: false, reason: "A run is already in progress" };

  try {
    const summary = await runPlannerDraftPass({ runId, startedAt: Date.now() });

    // Only hand off if this run actually got something done. Otherwise a task
    // that fails instantly every time would spin through the whole chain.
    const didWork = summary.drafted.length > 0;
    const handOff = summary.remaining > 0 && didWork && chainIndex + 1 < MAX_CHAIN;
    const handedOff = handOff ? await requestNextRun(chainIndex + 1) : false;

    return { started: true, runId, summary, handedOff };
  } catch (e: any) {
    await finishRun(runId, "failed", { error: (e?.message ?? String(e)).slice(0, 500) });
    throw e;
  }
}
