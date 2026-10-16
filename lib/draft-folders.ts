/**
 * Which folder a draft is in, and what it is doing there.
 *
 * A draft does not get filed by hand. Its folder follows from what has
 * happened to it, so the same rules decide where it appears in the list, what
 * the tab counts say, and what the nightly tidy-up is allowed to move. Working
 * that out in one place is what keeps those three from disagreeing.
 */

/** The folders, in the order the tabs show them. */
export const DRAFT_FOLDERS = [
  "pending",
  "in-progress",
  "waiting",
  "done",
  "archived",
  "deleted",
] as const;

export type DraftFolder = (typeof DRAFT_FOLDERS)[number];

export const FOLDER_LABELS: Record<DraftFolder, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  waiting: "Waiting",
  done: "Done",
  archived: "Archived",
  deleted: "Deleted",
};

/**
 * Where an eblast has got to.
 *
 * "Sent for approval" is the only thing that is ever described as sent, and it
 * means the email asking a salesperson to look went out. Pushed means it was
 * put into HubSpot from here; approved means a salesperson put it into HubSpot
 * by clicking their link. Those two are the same thing as far as filing goes,
 * and they are kept apart only so it is clear who did it.
 */
export type DraftStatus =
  | "pending"
  | "in-progress"
  | "sent-for-approval"
  | "changes-requested"
  | "approval-expired"
  | "pushed"
  | "approved";

export const STATUS_LABELS: Record<DraftStatus, string> = {
  pending: "Not started",
  "in-progress": "In progress",
  "sent-for-approval": "Sent for approval",
  "changes-requested": "Changes requested",
  "approval-expired": "Approval expired",
  pushed: "Pushed",
  approved: "Approved",
};

/** What a draft looks like to these rules. Dates may be strings off the wire. */
export interface DraftState {
  /** A Planner task produced it. */
  fromPlanner: boolean;
  /** First time it was opened in the editor. Null means nobody has yet. */
  openedAt?: Date | string | null;
  pushedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  archivedAt?: Date | string | null;
  deletedAt?: Date | string | null;
  /** An approval request that a salesperson could still act on. */
  awaitingApproval?: boolean;
  /** The newest approval request asked for edits and nothing has happened since. */
  changesRequested?: boolean;
  /** The newest approval request ran out of time without a decision. */
  approvalExpired?: boolean;
}

/**
 * The folder a draft belongs in.
 *
 * Deleted and archived win over everything, because both are decisions
 * somebody made about the draft as a whole. After that it is the pipeline in
 * order: in HubSpot, waiting on a salesperson, untouched, or being written.
 */
export function folderFor(d: DraftState): DraftFolder {
  if (d.deletedAt) return "deleted";
  if (d.archivedAt) return "archived";
  if (d.pushedAt || d.approvedAt) return "done";
  if (d.awaitingApproval || d.changesRequested || d.approvalExpired) return "waiting";
  // Written by the schedule and nobody has opened it yet. A draft made by
  // hand is being worked on by definition — somebody was there to make it.
  if (d.fromPlanner && !d.openedAt) return "pending";
  return "in-progress";
}

/** What to show on the draft itself, which is finer than the folder. */
export function statusFor(d: DraftState): DraftStatus {
  if (d.approvedAt) return "approved";
  if (d.pushedAt) return "pushed";
  if (d.changesRequested) return "changes-requested";
  if (d.approvalExpired) return "approval-expired";
  if (d.awaitingApproval) return "sent-for-approval";
  if (d.fromPlanner && !d.openedAt) return "pending";
  return "in-progress";
}

/** Whether a name off the wire is a folder. */
export function isDraftFolder(value: unknown): value is DraftFolder {
  return typeof value === "string" && (DRAFT_FOLDERS as readonly string[]).includes(value);
}

/**
 * How long a draft sits in Deleted before it is gone for good.
 *
 * Deleting is reversible for a week, which is long enough to notice a mistake
 * and short enough that the database is not carrying months of eblasts nobody
 * will open again. Archived drafts are not on this clock at all: putting one
 * there is a decision to keep it, and a folder that quietly emptied itself
 * would be no different from Done.
 */
export const PURGE_AFTER_DAYS = 7;
