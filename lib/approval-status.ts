import { isApprovalExpired, APPROVAL_LINK_TTL_DAYS } from "@/lib/approval-expiry";

/** Why an approval link can't be acted on. See approvalBlockedMessage. */
export type ApprovalBlockedReason =
  | "decided"
  | "missing"
  | "deleted"
  | "expired"
  | "approved"
  | "pushed"
  | "superseded";

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
export function approvalBlockedReason(input: ApprovalActionabilityInput): ApprovalBlockedReason | null {
  if (input.decision !== "pending") return "decided";
  if (!input.draft) return "missing";
  if (input.draft.deletedAt) return "deleted";
  if (isApprovalExpired(input.sentAt)) return "expired";
  if (input.isTest) return null;
  if (input.draft.approvedAt) return "approved";
  if (input.draft.pushedAt) return "pushed";
  if (!input.isNewestForDraft) return "superseded";
  return null;
}

/**
 * What each reason means to the person holding the link.
 *
 * These are whole sentences on purpose. They used to be fragments dropped into
 * a fixed sentence that ended "Nothing was sent to HubSpot", which produced
 * screens reading "the draft has already been pushed to HubSpot. Nothing was
 * sent to HubSpot." — telling a salesperson both things at once. Each reason
 * now states one fact and one next step, and nothing is glued onto it.
 */
const BLOCKED_MESSAGE: Record<ApprovalBlockedReason, { title: string; body: string }> = {
  decided: {
    title: "Already handled",
    body: "You've already responded to this one. Nothing more to do.",
  },
  missing: {
    title: "Draft not found",
    body: "This eblast is no longer available. The marketing team can send you a new link.",
  },
  deleted: {
    title: "Draft deleted",
    body: "This eblast was deleted, so there's nothing left to approve.",
  },
  expired: {
    title: "Link expired",
    body: `Approval links last ${APPROVAL_LINK_TTL_DAYS} days. Ask the marketing team to send this one again.`,
  },
  approved: {
    title: "Already approved",
    body: "This eblast is approved and in HubSpot. Nothing more to do.",
  },
  pushed: {
    title: "Already in HubSpot",
    body: "The marketing team already sent this one to HubSpot. Nothing more to do.",
  },
  superseded: {
    title: "Newer version sent",
    body: "A newer version of this eblast went out for review. Please use the most recent email.",
  },
};

export function approvalBlockedMessage(reason: ApprovalBlockedReason): { title: string; body: string } {
  return BLOCKED_MESSAGE[reason];
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
