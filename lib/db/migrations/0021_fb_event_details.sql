-- The event's own details, and where the copy came from.
--
-- The date, time and place are stored on the event rather than read back out
-- of the eblast each time, because an event can now be written from the flyer
-- before any eblast exists — and because they are what has to be typed into
-- Further's own fields, which no longer carry them in the description.

ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS event_date     text;
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS event_time     text;
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS event_location text;

-- 'draft' or 'flyer'. Which one is worth showing: copy written from the flyer
-- has not been through the voice doctrine or past a person the way a drafted
-- eblast has.
ALTER TABLE fb_event_tasks ADD COLUMN IF NOT EXISTS generated_from text;
