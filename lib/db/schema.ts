// Database schema (source of truth).
// Drizzle ORM, Postgres dialect, Vercel Neon-backed.
//
// Conventions:
//   - Tabular fields are columns; structured nested objects (brand, address,
//     hubspot, socials) are JSONB so existing TypeScript shape access
//     like `community.brand.primary` keeps working.
//   - Multi-row relations (senders, past sends, drafts, approvals) are their
//     own tables.

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// ---------- enums ---------------------------------------------------------

export const communityTypeEnum = pgEnum("community_type", [
  "assisted_living",
  "memory_care",
  "independent_living",
  "mixed",
]);

export const draftStatusEnum = pgEnum("draft_status", [
  "drafting",
  "awaiting_approval",
  "edits_requested",
  "approved",
  "scheduled",
  "sent",
  "abandoned",
]);

export const approvalDecisionEnum = pgEnum("approval_decision", [
  "pending",
  "approved",
  "edits_requested",
  "rejected",
]);

// ---------- nested-object types (JSONB shapes) ----------------------------

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface CommunityBrand {
  // Legacy/required fields preserved so existing render code keeps
  // working without refactors.
  primary: string;
  accent: string;
  background: string;
  fontHeadline: string;
  fontBody: string;
  // Richer palette (optional) — populated by hand or by brand-guide extraction.
  secondary?: string;
  supporting?: string[];
  textOnPrimary?: string;
  textOnAccent?: string;
  fonts?: {
    display?: { name: string; fallback: string; weights?: number[] };
    body?: { name: string; fallback: string; weights?: number[] };
    script?: { name: string; fallback: string };
  };
  paletteSource?: "default" | "manual" | "brand-guide-extracted";
  fontsSource?: "default" | "manual" | "brand-guide-extracted";
}

export interface CommunitySocials {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
}

export interface CommunityHubSpot {
  listId?: number;
  additionalListIds?: number[];
  businessUnitId?: number;
  /** HubSpot segment-naming acronym for this community, e.g. "PGR" → "PGR eBlasts | …". */
  acronym?: string;
  /**
   * Which HubSpot portal this community's eblasts push to. Defaults to
   * "primary" (Great Lakes) when unset — only communities that belong to a
   * different portal's account (e.g. Amira) need this set explicitly.
   * All the *ListIds/businessUnitId/officeLocationId fields below are only
   * meaningful within whichever portal this points at.
   */
  account?: "primary" | "amira";
  /** HubSpot list IDs (Segments) to send TO — active prospects. */
  includedListIds?: number[];
  /** HubSpot list IDs (Segments) to SUPPRESS — moved-in/out, closed-lost, referral sources. */
  excludedListIds?: number[];
  /**
   * HubSpot office-location ID for the CAN-SPAM footer address.
   * Find available IDs at /api/admin/hubspot-office-locations.
   * When set, the email_footer module uses this community's registered address
   * instead of the portal default.
   */
  officeLocationId?: number;
}

export interface CommunityLogo {
  url: string;
  variant: "primary" | "monochrome" | "knockout" | "square" | "horizontal" | "icon";
  /** Which background colors this logo is meant to be used on. */
  onColor?: "light" | "dark" | "any";
}

export interface CommunityAsset {
  url: string;
  caption?: string;
  tags?: string[];
}

export interface CommunityMarketingDirector {
  name: string;
  email: string;
}

export interface BrandGuideExtracted {
  /** When the agent extracted this from the uploaded PDF. */
  extractedAt: string;
  palette?: { primary?: string; accent?: string; background?: string; secondary?: string; supporting?: string[] };
  fonts?: CommunityBrand["fonts"];
  notes?: string;
  /** The raw extraction so a future schema change can re-process. */
  raw?: any;
}

// ---------- communities ---------------------------------------------------

export const communities = pgTable("communities", {
  id: uuid("id").defaultRandom().primaryKey(),

  /** URL-safe identifier, e.g. "caretta-bellevue". */
  slug: varchar("slug", { length: 64 }).notNull().unique(),

  displayName: text("display_name").notNull(),
  shortName: text("short_name").notNull(),
  /** Brand family this community belongs to: Caretta / Talamore / Hayden Grove / The Glenn / Cottagewood / Amira Choice / etc. */
  brandFamily: varchar("brand_family", { length: 64 }),

  type: communityTypeEnum("type").notNull(),

  /** Physical address (CAN-SPAM, footers). JSONB to preserve existing nested access. */
  address: jsonb("address").$type<Address>().notNull().default({}),

  websiteUrl: text("website_url"),
  /**
   * CallRail tracking number used in eblast CTAs. NEVER the same as `phone`.
   * The drafter must use this in CTA labels and tel: hrefs in emails.
   */
  trackingPhone: text("tracking_phone"),

  hubspot: jsonb("hubspot").$type<CommunityHubSpot>().notNull().default({}),

  brand: jsonb("brand").$type<CommunityBrand>().notNull(),
  brandGuideUrl: text("brand_guide_url"),
  brandGuideExtracted: jsonb("brand_guide_extracted").$type<BrandGuideExtracted>(),

  logos: jsonb("logos").$type<CommunityLogo[]>().notNull().default([]),
  photoLibrary: jsonb("photo_library").$type<CommunityAsset[]>().notNull().default([]),

  taglines: text("taglines").array(),
  amenities: text("amenities").array(),
  socials: jsonb("socials").$type<CommunitySocials>().notNull().default({}),

  marketingDirector: jsonb("marketing_director").$type<CommunityMarketingDirector>(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CommunityRow = InferSelectModel<typeof communities>;
export type NewCommunityRow = InferInsertModel<typeof communities>;

// ---------- senders (multiple per community) ------------------------------

export const communitySenders = pgTable("community_senders", {
  id: uuid("id").defaultRandom().primaryKey(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Optional: a sender can be recorded by name alone, with no address on file. */
  email: text("email"),
  title: text("title"),
  /** The default sender for this community (one per community max — enforced in app code). */
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CommunitySenderRow = InferSelectModel<typeof communitySenders>;
export type NewCommunitySenderRow = InferInsertModel<typeof communitySenders>;

// ---------- past sends (HubSpot history mirror) ---------------------------

export const pastSends = pgTable("past_sends", {
  id: uuid("id").defaultRandom().primaryKey(),
  hubspotEmailId: text("hubspot_email_id").notNull().unique(),
  /** Mapped community by sender domain heuristic; nullable for unmappable sends. */
  communityId: uuid("community_id").references(() => communities.id, {
    onDelete: "set null",
  }),
  subject: text("subject"),
  previewText: text("preview_text"),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  /** HubSpot state: PUBLISHED / DRAFT / SCHEDULED / etc. */
  state: text("state"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  recipientCount: integer("recipient_count"),
  openCount: integer("open_count"),
  clickCount: integer("click_count"),
  bounceCount: integer("bounce_count"),
  unsubscribeCount: integer("unsubscribe_count"),
  /** Full HubSpot snapshot — for forensics or re-mapping later. */
  raw: jsonb("raw"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PastSendRow = InferSelectModel<typeof pastSends>;
export type NewPastSendRow = InferInsertModel<typeof pastSends>;

// ---------- drafts (eblasts the agent has produced) -----------------------

export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  /** Set once we've pushed to HubSpot. */
  hubspotEmailId: text("hubspot_email_id"),
  status: draftStatusEnum("status").notNull().default("drafting"),
  /** ExtractedFlyer JSON. */
  extractedFlyer: jsonb("extracted_flyer"),
  html: text("html"),
  /** Hash of the source PDF so we can detect identical re-uploads. */
  sourcePdfHash: text("source_pdf_hash"),
  /** Snapshot of the agent loop's iteration trace. */
  agentLoop: jsonb("agent_loop"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DraftRow = InferSelectModel<typeof drafts>;
export type NewDraftRow = InferInsertModel<typeof drafts>;

// ---------- saved drafts (Drafter work-in-progress snapshots) -------------
// Stores full draft payloads including base64 image data so any user can
// access them across devices. Capped at 8 per community by the API route.

export const savedDrafts = pgTable("saved_drafts", {
  id: text("id").primaryKey(),
  communitySlug: varchar("community_slug", { length: 64 }).notNull(),
  communityName: text("community_name").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
  subject: text("subject").notNull(),
  imageCount: integer("image_count").notNull().default(0),
  /** Full draft JSON — includes rendered HTML, extracted text, and base64 image data. */
  data: jsonb("data").notNull(),
  /**
   * Set when a salesperson approves this draft via the approval email
   * (quick-approve route) and it's successfully pushed to HubSpot. NOT set on
   * an edit request — only a genuine approval marks a draft this way.
   */
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  /**
   * Set when this exact draft is pushed to HubSpot directly (the "Push to
   * HubSpot" button in the editor, app/api/push-eblast). Independent of
   * approvedAt, which is only set by the magic-link approval flow — a draft
   * can be pushed directly without ever going through approval. Both this and
   * approvedAt (plus a pending row in saved_draft_approvals) are checked by
   * the editor to decide whether further edits must go to a copy instead of
   * this row — see DraftContext's lockInfo.
   */
  pushedAt: timestamp("pushed_at", { withTimezone: true }),
  /**
   * Soft-delete marker. Set when the user deletes a draft from the Saved
   * Drafts list — the row (and its data/images/approval history) stays
   * intact and recoverable via the Deleted Drafts view until the daily
   * purge cron hard-deletes it 30 days later (see
   * app/api/cron/purge-deleted-drafts).
   *
   * Only ever set by a person deleting a draft. There was once an automatic
   * per-community limit that evicted the oldest draft on save; it is gone, and
   * a community may now keep as many drafts as it likes.
   */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type SavedDraftRow = InferSelectModel<typeof savedDrafts>;
export type NewSavedDraftRow = InferInsertModel<typeof savedDrafts>;

// ---------- saved draft approvals (magic-link salesperson approval flow) -----
// Each row represents one "Send for Approval" action. The token is a random
// opaque string used in magic links — no signing needed since it's just a
// test/internal approval flow.

export const savedDraftApprovals = pgTable("saved_draft_approvals", {
  /** Random token used in magic-link URLs — /approve/[token]. */
  token: text("token").primaryKey(),
  savedDraftId: text("saved_draft_id")
    .notNull()
    .references(() => savedDrafts.id, { onDelete: "cascade" }),
  communitySlug: text("community_slug").notNull(),
  /** Sender name — used for the greeting ("Hi Sarah,"). */
  recipientName: text("recipient_name"),
  /** Actual email address the approval was sent to (may be overridden in test mode). */
  recipientEmail: text("recipient_email").notNull(),
  /** Who receives the edit-request notification email. */
  notifyEmail: text("notify_email"),
  /** Subject line of the draft — for context in notification emails. */
  draftSubject: text("draft_subject"),
  /**
   * Snapshot of the exact email HTML that was sent for approval (images already
   * uploaded to HubSpot and swapped to hosted URLs). This is what gets pushed to
   * HubSpot on approval. Stored here — not on the mutable saved draft — so a
   * later autosave of the draft can't wipe it out from under the pending approval.
   */
  html: text("html"),
  /**
   * "pending" | "approving" | "approved" | "edits_requested"
   *
   * "approving" is a transient claim: the approve handler flips pending →
   * approving in a single conditional UPDATE, so only one request can ever
   * own the HubSpot push. Concurrent clicks (or a mail scanner racing the
   * human) lose the claim and do nothing instead of pushing a duplicate.
   * It only becomes "approved" once HubSpot confirms the email was created;
   * a failed push resets it to "pending" so the link still works on retry.
   */
  decision: text("decision").notNull().default("pending"),
  editNotes: text("edit_notes"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  /**
   * HubSpot marketing-email ID created by the approval push. Proof the push
   * actually landed — "approved" without this means it never reached HubSpot.
   */
  pushedEmailId: text("pushed_email_id"),
  /** Why the last approval push failed, if it did. Cleared on success. */
  pushError: text("push_error"),
  /**
   * A dry-run of the whole approval flow, for testing the app.
   *
   * Behaves exactly like a real approval request — same email, same link, and
   * approving it really does create the email in HubSpot — but it is invisible
   * to the app's own bookkeeping: never counted as awaiting approval, never
   * badges the draft as pending, never marks the draft approved, never writes a
   * past-send, and never supersedes (or is superseded by) a real request. The
   * HubSpot email it creates is named with a [TEST] prefix so it's obvious.
   */
  isTest: boolean("is_test").notNull().default(false),
});

export type SavedDraftApprovalRow = InferSelectModel<typeof savedDraftApprovals>;
export type NewSavedDraftApprovalRow = InferInsertModel<typeof savedDraftApprovals>;

// ---------- draft image bank (one row per extracted image per draft) --------
// Stored separately so each row is ~50–200 KB — well under Vercel's 4.5 MB
// HTTP body limit. ON DELETE CASCADE removes images when the draft is deleted.

export const draftImageBank = pgTable(
  "draft_image_bank",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => savedDrafts.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    url: text("url").notNull(),
  },
  (t) => [primaryKey({ columns: [t.draftId, t.idx] })],
);

export type DraftImageBankRow = InferSelectModel<typeof draftImageBank>;
export type NewDraftImageBankRow = InferInsertModel<typeof draftImageBank>;

// ---------- pdf chunk staging (temporary storage for large PDF uploads) ---
// Each row holds one base64-encoded chunk of a PDF being uploaded in pieces
// to work around Vercel's 4.5 MB Route Handler body limit. Rows are deleted
// automatically after the draft-from-pdf route reassembles them.

export const pdfChunks = pgTable(
  "pdf_chunks",
  {
    uploadId: text("upload_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    totalChunks: integer("total_chunks").notNull(),
    data: text("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.chunkIndex] })],
);

export type PdfChunkRow = InferSelectModel<typeof pdfChunks>;

// ---------- approval threads (superseded) ---------------------------------
// This table was the original approval design; it was replaced by
// savedDraftApprovals (above). The DB table still exists but nothing reads
// or writes to it. Kept in schema to prevent drizzle-kit push from trying
// to recreate it. Do not add new code that references this table.

export const approvalThreads = pgTable("approval_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  salespersonEmail: text("salesperson_email").notNull(),
  salespersonName: text("salesperson_name"),
  magicToken: text("magic_token").notNull().unique(),
  decision: approvalDecisionEnum("decision").notNull().default("pending"),
  editNotes: text("edit_notes"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// ---------- planner tasks (scheduled drafting from Microsoft Planner) -------
// One row per Planner task the daily job has acted on.
//
// Planner task status is the real guard against drafting the same task twice:
// a drafted task is marked In progress, which removes it from the job's view,
// and a person handling one themselves does the same. This table is the
// backstop for the gap between creating a draft and successfully writing that
// status back — without it, a failed write would mean a second draft tomorrow.
//
// It's also what the Pending Drafts tab reads: a draft with a row here came
// from a task rather than from someone uploading a flyer by hand.

export const plannerTasks = pgTable("planner_tasks", {
  taskId: text("task_id").primaryKey(),
  planId: text("plan_id").notNull(),
  /** Resolved from the PLAN's title — task titles name the event, not the community. */
  communitySlug: varchar("community_slug", { length: 64 }),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  /** Null until a draft exists. Cleared if that draft is hard-deleted. */
  savedDraftId: text("saved_draft_id").references(() => savedDrafts.id, { onDelete: "set null" }),
  /** False means the draft exists but Planner wasn't updated — see above. */
  markedInProgress: boolean("marked_in_progress").notNull().default(false),
  /** Why it was passed over: no flyer yet, unknown community, generation failed. */
  skipReason: text("skip_reason"),
  attempts: integer("attempts").notNull().default(0),
  /** Set while a run is generating this task. A stale claim means that run died. */
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedBy: text("claimed_by"),
  /** The draft id this attempt will use, written before generation so an
   *  interrupted run can be cleaned up exactly rather than guessed at. */
  pendingDraftId: text("pending_draft_id"),
  lastError: text("last_error"),
  /** Three failures: stop retrying, leave unchecked, hand to the marketing team. */
  abandoned: boolean("abandoned").notNull().default(false),
  /** Planner s ordering value for the My Tasks list, so Pending Drafts can match it. */
  assigneePriority: text("assignee_priority"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  draftedAt: timestamp("drafted_at", { withTimezone: true }),
});

export type PlannerTaskRow = InferSelectModel<typeof plannerTasks>;
export type NewPlannerTaskRow = InferInsertModel<typeof plannerTasks>;


// ---------- app settings (small values the app can change at runtime) -------
// Currently just how far ahead the Planner pass drafts. In the database rather
// than an env var so changing it takes effect at once and survives deploys.

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AppSettingRow = InferSelectModel<typeof appSettings>;

// ---------- planner runs ---------------------------------------------------
// One row per pass over the task list.
//
// It is the lock that stops the morning run and the Run now button colliding,
// the source of the progress readout, and how a run hands off to a fresh one
// before Vercel cuts it off at five minutes.

export const plannerRuns = pgTable("planner_runs", {
  id: text("id").primaryKey(),
  /** cron | manual | chain */
  trigger: text("trigger").notNull(),
  /** running | done | failed */
  status: text("status").notNull().default("running"),
  /** How many runs deep this chain is, so a bug cannot loop forever. */
  chainIndex: integer("chain_index").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  /** Bumped as work completes. A quiet heartbeat means the run was killed. */
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  drafted: integer("drafted").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  /** Candidates still waiting when this run handed off. Drives the progress line. */
  remaining: integer("remaining"),
  currentTask: text("current_task"),
  error: text("error"),
});

export type PlannerRunRow = InferSelectModel<typeof plannerRuns>;


// ---------- draft flyers --------------------------------------------------
// The PDF a draft was written from, shown beside the eblast in the editor so
// the copy can be checked against its source.
//
// Keyed by the draft, not by a Planner task, because a draft made by uploading
// a flyer by hand has no task. Its own table so a multi-megabyte PDF is never
// pulled in by the queries that list drafts.

export const draftFlyers = pgTable("draft_flyers", {
  draftId: text("draft_id")
    .primaryKey()
    .references(() => savedDrafts.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  pdfBase64: text("pdf_base64").notNull(),
  bytes: integer("bytes").notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DraftFlyerRow = InferSelectModel<typeof draftFlyers>;

// A hand-uploaded flyer arrives while the draft is still being generated,
// before the draft has an id. It waits here until the draft is saved and
// claims it; the daily purge clears anything left behind.

export const pendingFlyers = pgTable("pending_flyers", {
  key: text("key").primaryKey(),
  fileName: text("file_name").notNull(),
  pdfBase64: text("pdf_base64").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
