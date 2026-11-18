-- What has been written for a Facebook event, kept beside the task it is for.
--
-- Stored rather than produced on demand because it costs a model call and is
-- then copied by hand into two different places, possibly over two sittings:
-- the words have to be the same both times, and the same tomorrow.
--
-- generated_from_draft_id records which eblast draft it was written from, so
-- a draft edited after the event was written can be noticed instead of
-- quietly leaving the Facebook copy describing an older version of the day.

ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS event_title             text;
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS paragraphs              jsonb;
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS facebook_description    text;
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS further_description     text;
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS generated_at            timestamptz;
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS generated_from_draft_id text;

-- Set once the event has been created in Further, so it is not created twice.
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS further_event_uuid      text;
-- Set by hand when the Facebook event has been posted, since nothing can tell
-- us that from Facebook's side.
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS posted_to_facebook_at   timestamptz;
