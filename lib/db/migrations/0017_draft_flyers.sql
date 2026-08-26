-- The flyer a draft was written from, kept so it can be shown beside the
-- eblast while checking one against the other.
--
-- One table for both routes in, keyed by the draft rather than by a Planner
-- task, because a draft made by uploading a flyer by hand has no task. The
-- flyers already stored against Planner tasks move across, so there is a
-- single place to look.
--
-- Its own table, not a column on saved_drafts: a multi-megabyte PDF must never
-- be dragged in by the queries that list drafts.

CREATE TABLE IF NOT EXISTS draft_flyers (
  draft_id    text PRIMARY KEY REFERENCES saved_drafts(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  pdf_base64  text NOT NULL,
  bytes       integer NOT NULL,
  stored_at   timestamptz NOT NULL DEFAULT now()
);

-- A flyer uploaded by hand arrives while the draft is being generated, which
-- is before the draft has an id. It waits here until the draft is saved and
-- claims it. Cleared out by the daily purge.
CREATE TABLE IF NOT EXISTS pending_flyers (
  key         text PRIMARY KEY,
  file_name   text NOT NULL,
  pdf_base64  text NOT NULL,
  bytes       integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Carry over what the Planner pass already collected.
INSERT INTO draft_flyers (draft_id, file_name, pdf_base64, bytes, stored_at)
SELECT p.saved_draft_id, f.file_name, f.pdf_base64, f.bytes, f.stored_at
FROM planner_task_flyers f
JOIN planner_tasks p ON p.task_id = f.task_id
WHERE p.saved_draft_id IS NOT NULL
ON CONFLICT (draft_id) DO NOTHING;

DROP TABLE IF EXISTS planner_task_flyers;
