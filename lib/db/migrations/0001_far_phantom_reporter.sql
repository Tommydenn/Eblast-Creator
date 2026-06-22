CREATE TABLE "saved_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"community_slug" varchar(64) NOT NULL,
	"community_name" text NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"subject" text NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
