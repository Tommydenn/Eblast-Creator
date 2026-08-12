import { isApprovalExpired } from "@/lib/approval-expiry";

/**
 * Whether a still-"pending" approval row actually means anything.
 *
 * A row keeps decision='pending' forever unless the reviewer themselves clicks
 * Approve or Request Edits on that exact token. Everything else that can
 * resolve a draft — approving through a newer request, pushing it straight to
 * HubSpot, deleting it, or simply sending it out for approval again — leaves
 * the old row behind. Those leftovers were counted and badged as if a
 * salesperson were still sitting on them, which is why a draft could show
 * "Approved" and "Pending Approval" at once and why the Communities count read
 * far higher than the number of real outstanding requests.
 *
 * The same predicate guards the approve/edits routes, so a leftover link is
 * refused on click rather than pushing a duplicate to HubSpot — no retroactive
 * data cleanup needed to make the old ones safe.
 */
export interface ApprovalDraftState {
  deletedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  pushedAt?: Date | string | null;
}

export interface ApprovalActionabilityInput {
  decision: string;
  sentAt: Date | string;
  draft: ApprovalDraftState | null | undefined;
  /** False when a later real approval request exists for the same draft. */
  isNewestForDraft: boolean;
  /** Test requests are clickable but never counted — see schema's isTest. */
  isTest?: boolean;
}

/**
 * Null when this link can still be acted on; otherwise why it can't.
 *
 * Used to guard the Approve and Request Edits routes. A TEST request skips the
 * checks that exist to stop a duplicate real send — already approved, already
 * pushed, superseded — because the whole point is to be able to walk the flow
 * repeatedly on the same draft. It still can't be reused once decided, can't
 * act on a deleted draft, and still expires.
 */
export function approvalBlockedReason(input: ApprovalActionabilityInput): string | null {
  if (input.decision !== "pending") return "already decided";
  if (!input.draft) return "the draft no longer exists";
  if (input.draft.deletedAt) return "the draft was deleted";
  if (isApprovalExpired(input.sentAt)) return "the approval link expired";
  if (input.isTest) return null;
  if (input.draft.approvedAt) return "the draft has already been approved";
  if (input.draft.pushedAt) return "the draft has already been pushed to HubSpot";
  if (!input.isNewestForDraft) return "a newer version was sent for approval";
  return null;
}

/**
 * Whether this request should show up as outstanding work — the Communities
 * count and the draft's "Pending Approval" badge.
 *
 * Deliberately NOT the same test as approvalBlockedReason: a test request is
 * fully clickable but must never appear anywhere in the app's bookkeeping.
 */
export function isApprovalActionable(input: ApprovalActionabilityInput): boolean {
  if (input.isTest) return false;
  return approvalBlockedReason(input) === null;
}

/**
 * Token of the most recent REAL approval request per draft. Order of the input
 * rows doesn't matter — the max sentAt wins.
 *
 * Test requests are excluded so sending a test never invalidates a genuine
 * request a salesperson is still sitting on.
 */
export function newestApprovalTokenByDraft(
  rows: Array<{ token: string; savedDraftId: string; sentAt: Date | string; isTest?: boolean }>,
): Map<string, string> {
  const newest = new Map<string, { token: string; at: number }>();
  for (const r of rows) {
    if (r.isTest) continue;
    const at = new Date(r.sentAt).getTime();
    const cur = newest.get(r.savedDraftId);
    if (!cur || at > cur.at) newest.set(r.savedDraftId, { token: r.token, at });
  }
  return new Map(Array.from(newest, ([draftId, v]) => [draftId, v.token]));
}
