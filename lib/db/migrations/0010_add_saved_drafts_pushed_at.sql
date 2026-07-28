ALTER TABLE "saved_drafts" ADD COLUMN IF NOT EXISTS "pushed_at" timestamp with time zone;
