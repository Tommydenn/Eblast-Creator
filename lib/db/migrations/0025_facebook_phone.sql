-- The number a Facebook event tells people to call.
--
-- Not the same as the eblast's. Each channel has its own tracking number so
-- a call can be attributed to what prompted it, and the flyer carries
-- neither — it has whichever line the designer put on it. So this is a
-- community setting like the others, and the only place the app can learn it
-- is from somebody typing it in.
--
-- Empty means fall back to the community's existing tracking number, which
-- is what every event does today and is better than printing nothing.

ALTER TABLE communities ADD COLUMN IF NOT EXISTS facebook_phone text;
