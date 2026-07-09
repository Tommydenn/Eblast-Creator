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
  // Legacy/required fields preserved so existing render/critic code keeps
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
  careTypes: text("care_types").array(),

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
  email: text("email").notNull(),
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
   * Approved drafts are exempt from the per-community cap-eviction below.
   */
  approvedAt: timestamp("approved_at", { withTimezone: true }),
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
  /** "pending" | "approved" | "edits_requested" */
  decision: text("decision").notNull().default("pending"),
  editNotes: text("edit_notes"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
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
