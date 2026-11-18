-- Bring already-written events into line with the Further rule.
--
-- Further has its own fields for the date, the time and the place and prints
-- them beside the description, so its copy is the paragraphs alone. Events
-- written before that was true still carry the detail block, and nothing
-- rewrites stored copy on its own — so it is rewritten here, from the
-- paragraphs that were saved alongside it.

UPDATE fb_event_tasks
SET further_description = (
      SELECT string_agg(p.value #>> '{}', E'\n\n')
      FROM jsonb_array_elements(paragraphs) AS p
    ),
    updated_at = now()
WHERE paragraphs IS NOT NULL
  AND jsonb_typeof(paragraphs) = 'array'
  AND jsonb_array_length(paragraphs) > 0;
