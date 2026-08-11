-- Track whether an approval's HubSpot push actually landed.
--
-- Before this, decision='approved' was set regardless of whether HubSpot ever
-- created the email, so "Already Approved" could show for a draft that was
-- never pushed. pushed_email_id is the proof; push_error records the failure
-- so the approve link can be retried instead of being permanently consumed.
ALTER TABLE "saved_draft_approvals" ADD COLUMN IF NOT EXISTS "pushed_email_id" text;
ALTER TABLE "saved_draft_approvals" ADD COLUMN IF NOT EXISTS "push_error" text;

-- Any row left mid-claim by a deploy/timeout should be clickable again.
UPDATE "saved_draft_approvals" SET "decision" = 'pending' WHERE "decision" = 'approving';
