-- Two things a draft needs to carry from its Planner task.
--
-- 1. The order it appears in. Planner's "My Tasks" list is ordered by
--    assigneePriority — opaque strings that sort lexicographically. Storing it
--    lets Pending Drafts read in the same order as Planner, instead of by due
--    date, so the first task on screen there is the first draft here.
--
-- 2. The flyer itself. It is already downloaded to generate the draft and then
--    thrown away, which means there's no way to check the eblast against the
--    source afterwards. Kept in its own table rather than as a column on
--    planner_tasks so a multi-megabyte PDF is never pulled in by a query that
--    only wanted a title.

ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS assignee_priority text;

CREATE TABLE IF NOT EXISTS planner_task_flyers (
  task_id     text PRIMARY KEY REFERENCES planner_tasks(task_id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  -- Base64, same as the draft photos: these are small enough, and it keeps the
  -- flyer in one place with everything else about the draft.
  pdf_base64  text NOT NULL,
  bytes       integer NOT NULL,
  stored_at   timestamptz NOT NULL DEFAULT now()
);
