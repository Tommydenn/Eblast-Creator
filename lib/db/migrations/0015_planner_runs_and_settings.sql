-- Running the Planner pass until the backlog is clear, safely.
--
-- Three things this adds:
--
-- 1. A settings row for how far ahead to draft, so it can be changed from the
--    app instead of a deploy.
--
-- 2. A record per run. It's the lock that stops the morning run and the Run
--    now button colliding, the source of the progress readout, and how a run
--    knows to hand off to a fresh one before Vercel cuts it off.
--
-- 3. Claim columns on planner_tasks. A task is claimed before generation
--    starts and released after, so a run that gets killed mid-draft leaves a
--    claim behind. The next run finds it, permanently deletes the half-made
--    draft, puts the task back to Not started in Planner, and lets it be
--    retried. After three failures it stops being retried and is left
--    unchecked for the marketing team.

CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planner_runs (
  id            text PRIMARY KEY,
  -- cron | manual | chain
  trigger       text NOT NULL,
  -- running | done | failed
  status        text NOT NULL DEFAULT 'running',
  -- How many runs deep this chain is, so a bug can't loop forever.
  chain_index   integer NOT NULL DEFAULT 0,
  started_at    timestamptz NOT NULL DEFAULT now(),
  -- Bumped as work completes. A run whose heartbeat has gone quiet was killed.
  heartbeat_at  timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  drafted       integer NOT NULL DEFAULT 0,
  skipped       integer NOT NULL DEFAULT 0,
  failed        integer NOT NULL DEFAULT 0,
  -- Candidates still waiting when this run handed off. Drives the progress line.
  remaining     integer,
  current_task  text,
  error         text
);

CREATE INDEX IF NOT EXISTS planner_runs_started_idx ON planner_runs (started_at DESC);

ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS claimed_by text;
-- The draft id this attempt will use, written before generation so a killed
-- run can be cleaned up exactly rather than guessed at.
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS pending_draft_id text;
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS last_error text;
-- Three failures: stop retrying, leave it unchecked, hand it to a person.
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS abandoned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS planner_tasks_claimed_idx ON planner_tasks (claimed_at);
