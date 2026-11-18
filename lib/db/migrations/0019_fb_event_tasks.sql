-- The Facebook event tasks, kept beside the eblast ones.
--
-- A separate table rather than a kind column on planner_tasks, because almost
-- nothing is shared: these carry no flyer, produce no draft, are never claimed
-- by a run and are never marked In progress. What they do have is a twin —
-- the eblast task of the same name, which is where their flyer comes from —
-- and that pairing has no equivalent on the eblast side.

CREATE TABLE IF NOT EXISTS fb_event_tasks (
  task_id           text PRIMARY KEY,
  plan_id           text NOT NULL,
  -- Resolved from the PLAN's title, the same way an eblast task's is.
  community_slug    varchar(64),
  title             text NOT NULL,
  -- The title with "FB Event" removed: what the pair has in common.
  event_name        text NOT NULL,
  due_at            timestamptz,
  assignee_priority text,
  -- The eblast task of the same name. Null when there is none, or more than
  -- one, which is recorded rather than guessed at.
  eblast_task_id    text,
  -- That task's draft, which is where the flyer and the event's details are.
  saved_draft_id    text,
  -- Why it could not be paired, for the list to show instead of staying quiet.
  match_note        text,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_event_tasks_event_name_idx ON fb_event_tasks (event_name);
CREATE INDEX IF NOT EXISTS fb_event_tasks_draft_idx ON fb_event_tasks (saved_draft_id);
