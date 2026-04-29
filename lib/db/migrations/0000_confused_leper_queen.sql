CREATE TYPE "public"."approval_decision" AS ENUM('pending', 'approved', 'edits_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."community_type" AS ENUM('assisted_living', 'memory_care', 'independent_living', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('drafting', 'awaiting_approval', 'edits_requested', 'approved', 'scheduled', 'sent', 'abandoned');--> statement-breakpoint
CREATE TABLE "approval_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"salesperson_email" text NOT NULL,
	"salesperson_name" text,
	"magic_token" text NOT NULL,
	"decision" "approval_decision" DEFAULT 'pending' NOT NULL,
	"edit_notes" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "approval_threads_magic_token_unique" UNIQUE("magic_token")
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"display_name" text NOT NULL,
	"short_name" text NOT NULL,
	"brand_family" varchar(64),
	"name_abbreviation" varchar(16),
	"type" "community_type" NOT NULL,
	"care_types" text[],
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"phone" text,
	"email" text,
	"website_url" text,
	"tracking_phone" text,
	"hubspot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"brand" jsonb NOT NULL,
	"brand_guide_url" text,
	"brand_guide_extracted" jsonb,
	"logos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photo_library" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taglines" text[],
	"amenities" text[],
	"voice_notes" text,
	"voice" jsonb,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"marketing_director" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_senders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"hubspot_email_id" text,
	"status" "draft_status" DEFAULT 'drafting' NOT NULL,
	"extracted_flyer" jsonb,
	"html" text,
	"source_pdf_hash" text,
	"agent_loop" jsonb,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "past_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_email_id" text NOT NULL,
	"community_id" uuid,
	"subject" text,
	"preview_text" text,
	"from_name" text,
	"from_email" text,
	"state" text,
	"published_at" timestamp with time zone,
	"recipient_count" integer,
	"open_count" integer,
	"click_count" integer,
	"bounce_count" integer,
	"unsubscribe_count" integer,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "past_sends_hubspot_email_id_unique" UNIQUE("hubspot_email_id")
);
--> statement-breakpoint
ALTER TABLE "approval_threads" ADD CONSTRAINT "approval_threads_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_senders" ADD CONSTRAINT "community_senders_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_sends" ADD CONSTRAINT "past_sends_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;