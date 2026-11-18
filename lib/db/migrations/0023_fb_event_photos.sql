-- The photos found in an event's flyer, kept so the page does not wait.
--
-- Reading a PDF for its images takes seconds, and the page needs them the
-- moment it opens. They are gathered once, when the event's copy is written,
-- and this is where they live until the event is retired — the row goes with
-- its event, by the foreign key below.
--
-- Previews only, about 900px wide. The full-size original is re-read from
-- the flyer on the rare occasion somebody downloads one, which is worth a
-- wait and is not worth a hundred megabytes of base64.

CREATE TABLE IF NOT EXISTS fb_event_photos (
  task_id text NOT NULL REFERENCES fb_event_tasks(task_id) ON DELETE CASCADE,
  idx     integer NOT NULL,
  width   integer NOT NULL,
  height  integer NOT NULL,
  -- 'flyer', or 'hero'/'bank' for an event with no flyer to read.
  source  text NOT NULL,
  preview text NOT NULL,
  PRIMARY KEY (task_id, idx)
);

-- Marked In progress in Planner once its copy exists, the way a drafted
-- eblast marks its own task. Recorded here too so a failure to reach Graph
-- can be seen and retried rather than silently never happening.
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS marked_in_progress boolean NOT NULL DEFAULT false;
