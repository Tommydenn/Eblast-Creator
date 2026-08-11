/**
 * Approval magic links expire after this many days.
 *
 * They previously never expired: the token was checked only for existence and
 * for whether a decision had been made, never for age. Every link ever emailed
 * stayed live indefinitely — including ones sent to people who have since left,
 * any of which could still push an eblast to HubSpot years later.
 *
 * Expiry is computed from the row's own sentAt rather than stored, so applying
 * it neither migrates the schema nor rewrites a single existing approval.
 */
export const APPROVAL_LINK_TTL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function approvalExpiresAt(sentAt: Date | string): Date {
  return new Date(new Date(sentAt).getTime() + APPROVAL_LINK_TTL_DAYS * MS_PER_DAY);
}

/**
 * Only ever applies to approvals still awaiting a decision — an already
 * approved or edits-requested row keeps showing its real outcome rather than
 * turning into "expired" once it ages out.
 */
export function isApprovalExpired(sentAt: Date | string, now: Date = new Date()): boolean {
  return now.getTime() > approvalExpiresAt(sentAt).getTime();
}
