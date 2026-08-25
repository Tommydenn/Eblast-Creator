/**
 * Approval magic links expire this long after they're sent.
 *
 * They previously never expired: the token was checked only for existence and
 * for whether a decision had been made, never for age. Every link ever emailed
 * stayed live indefinitely — including ones sent to people who have since left,
 * any of which could still push an eblast to HubSpot years later.
 *
 * Expiry is computed from the row's own sentAt rather than stored, so changing
 * the window neither migrates the schema nor rewrites a single existing
 * approval — it applies at once to every link already out there.
 *
 * Age is only one of the reasons a link stops working. A link is also refused
 * once the draft has been approved, pushed or deleted, or once a newer
 * approval request supersedes it — see approvalBlockedReason. Those are why an
 * old link can already be dead well inside its lifetime.
 */
export const APPROVAL_LINK_TTL_HOURS = 24;

/** How that lifetime is written in anything a reviewer reads. */
export const APPROVAL_LINK_TTL_LABEL = "24 hours";

const MS_PER_HOUR = 60 * 60 * 1000;

export function approvalExpiresAt(sentAt: Date | string): Date {
  return new Date(new Date(sentAt).getTime() + APPROVAL_LINK_TTL_HOURS * MS_PER_HOUR);
}

/**
 * Only ever applies to approvals still awaiting a decision — an already
 * approved or edits-requested row keeps showing its real outcome rather than
 * turning into "expired" once it ages out.
 */
export function isApprovalExpired(sentAt: Date | string, now: Date = new Date()): boolean {
  return now.getTime() > approvalExpiresAt(sentAt).getTime();
}
