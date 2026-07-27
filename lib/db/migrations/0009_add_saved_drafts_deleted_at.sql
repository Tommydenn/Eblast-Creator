ALTER TABLE "saved_drafts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
