-- Test approval requests: a full dry-run of the approval flow that stays
-- invisible to the app's own bookkeeping. See the isTest comment in schema.ts.
-- Existing rows are all real requests, hence the false default.
ALTER TABLE "saved_draft_approvals" ADD COLUMN IF NOT EXISTS "is_test" boolean NOT NULL DEFAULT false;
