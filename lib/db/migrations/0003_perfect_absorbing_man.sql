CREATE TABLE "saved_draft_approvals" (
	"token" text PRIMARY KEY NOT NULL,
	"saved_draft_id" text NOT NULL,
	"community_slug" text NOT NULL,
	"recipient_name" text,
	"recipient_email" text NOT NULL,
	"notify_email" text,
	"draft_subject" text,
	"decision" text DEFAULT 'pending' NOT NULL,
	"edit_notes" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "saved_draft_approvals" ADD CONSTRAINT "saved_draft_approvals_saved_draft_id_saved_drafts_id_fk" FOREIGN KEY ("saved_draft_id") REFERENCES "public"."saved_drafts"("id") ON DELETE cascade ON UPDATE no action;