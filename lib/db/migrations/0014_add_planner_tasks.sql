-- Scheduled drafting from Microsoft Planner.
--
-- One row per Planner task the job has acted on. Task status in Planner is
-- what actually stops a task being drafted twice (a drafted task is marked In
-- progress, which takes it out of the job's view). This table is the backstop
-- for the gap between those two steps: if a draft is created and the Planner
-- write then fails, the task is still Not started and tomorrow's run would
-- otherwise draft it again.
--
-- It also records where a draft came from, which is what the Pending Drafts
-- tab lists.

CREATE TABLE IF NOT EXISTS planner_tasks (
  task_id           text PRIMARY KEY,
  plan_id           text NOT NULL,
  community_slug    varchar(64),
  title             text NOT NULL,
  due_at            timestamptz,
  -- Null until a draft is successfully created. Set to null again if the
  -- draft is hard-deleted, so the task can be picked up afresh.
  saved_draft_id    text REFERENCES saved_drafts(id) ON DELETE SET NULL,
  -- Whether the task was successfully marked In progress in Planner. False
  -- means the draft exists but Planner doesn't know, and this row is the only
  -- thing preventing a duplicate.
  marked_in_progress boolean NOT NULL DEFAULT false,
  -- Why the task was skipped, when it was: no flyer attached, unknown
  -- community, generation failed. Cleared once it succeeds.
  skip_reason       text,
  attempts          integer NOT NULL DEFAULT 0,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  drafted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS planner_tasks_draft_idx ON planner_tasks (saved_draft_id);
