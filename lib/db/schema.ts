// Database schema (source of truth).
// Drizzle ORM, Postgres dialect, Vercel Neon-backed.
//
// Conventions:
//   - Tabular fields are columns; structured nested objects (brand, address,
//     hubspot, voice, socials) are JSONB so existing TypeScript shape access
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

export interface CommunityVoice {
  /** Tonal attributes, e.g. ["warm", "boutique", "hospitality-forward"]. */
  tone?: string[];
  /** Specific things to do — "address adult children making the decision". */
  dos?: string[];
  /** Specific things NOT to do — "no superlatives", "never say 'facility'". */
  donts?: string[];
  /** Words/phrases the agent should never use. */
  prohibited?: string[];
  /** Approved factual claims, e.g. "5-star CMS rating", "26-apartment boutique". */
  approvedClaims?: string[];
  /** Photo styling notes, e.g. "natural light", "candid resident moments". */
  photoStyleNotes?: string;
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
  voice?: CommunityVoice;
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
  /** Past-eblast naming prefix, e.g. "ACB". */
  nameAbbreviation: varchar("name_abbreviation", { length: 16 }),

  type: communityTypeEnum("type").notNull(),
  careTypes: text("care_types").array(),

  /** Physical address (CAN-SPAM, footers). JSONB to preserve existing nested access. */
  address: jsonb("address").$type<Address>().notNull().default({}),

  /** Public phone number (e.g. front desk). The flyer's phone. */
  phone: text("phone"),
  /** Public email. */
  email: text("email"),
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
  /** Free-form voice notes (legacy). Prefer the structured `voice` field below. */
  voiceNotes: text("voice_notes"),
  voice: jsonb("voice").$type<CommunityVoice>(),

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

// ---------- approval threads (magic-link salesperson approvals) -----------

export const approvalThreads = pgTable("approval_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  salespersonEmail: text("salesperson_email").notNull(),
  salespersonName: text("salesperson_name"),
  /** Signed token used in the magic link. */
  magicToken: text("magic_token").notNull().unique(),
  decision: approvalDecisionEnum("decision").notNull().default("pending"),
  editNotes: text("edit_notes"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export type ApprovalThreadRow = InferSelectModel<typeof approvalThreads>;
export type NewApprovalThreadRow = InferInsertModel<typeof approvalThreads>;
