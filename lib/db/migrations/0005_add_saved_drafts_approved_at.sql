ALTER TABLE "saved_drafts" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
