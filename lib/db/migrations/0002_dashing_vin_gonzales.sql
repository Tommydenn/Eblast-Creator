CREATE TABLE "draft_image_bank" (
	"draft_id" text NOT NULL,
	"idx" integer NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "draft_image_bank_draft_id_idx_pk" PRIMARY KEY("draft_id","idx")
);
--> statement-breakpoint
ALTER TABLE "draft_image_bank" ADD CONSTRAINT "draft_image_bank_draft_id_saved_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."saved_drafts"("id") ON DELETE cascade ON UPDATE no action;