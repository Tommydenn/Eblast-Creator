-- Drop communities.care_types.
--
-- It was display-only: a small grey label under the community name on the
-- Communities list and the community page ("Assisted Living · Memory Care").
-- Nothing else read it, and only 6 of 30 communities had it set, so it made
-- the list inconsistent rather than informative. Removed from the UI and the
-- seed data; this drops the column so it can't be reintroduced by accident.
ALTER TABLE "communities" DROP COLUMN IF EXISTS "care_types";
