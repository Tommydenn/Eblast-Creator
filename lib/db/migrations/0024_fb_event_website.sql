-- Whether this event also wants a post on the community's website.
--
-- Two openings are used in Planner, "FB Event - …" and "FB & Website
-- Event - …", and everything the app does is the same for both. The
-- difference is one more place the words go, so it is recorded rather than
-- re-read from the title every time it is wanted.

ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS wants_website_post boolean NOT NULL DEFAULT false;
