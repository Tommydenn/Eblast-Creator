-- Four different people are reachable about one eblast, and until now the
-- community had one list of senders doing all four jobs at once.
--
--   1. The approver   — who is sent the magic link and clicks approve.
--   2. The signature  — the name and address printed in the email's footer.
--   3. The HubSpot    — the From: on the marketing email once it is pushed.
--   4. The regional   — copied on the approval so they see it go out.
--
-- (2) stays where it is: the footer is drawn from the community's senders and
-- that has never been the wrong answer. (1) and (3) become their own optional
-- addresses here, empty for every community that is happy with the sender, so
-- nothing changes for anyone until it is filled in. (4) is new, and belongs to
-- a person rather than to a community: one regional covers several buildings,
-- so they are their own rows with a join rather than a column repeated down
-- the community table.

ALTER TABLE communities ADD COLUMN IF NOT EXISTS approver_email      text;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS hubspot_from_email  text;

CREATE TABLE IF NOT EXISTS regionals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regional_communities (
  regional_id   uuid NOT NULL REFERENCES regionals(id)   ON DELETE CASCADE,
  community_id  uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  PRIMARY KEY (regional_id, community_id)
);

-- Read in both directions: every regional on one community when an approval
-- goes out, and every community for one regional on the Communities page.
CREATE INDEX IF NOT EXISTS regional_communities_community_idx
  ON regional_communities (community_id);

-- Who was copied on each request, recorded at send time rather than looked up
-- later: coverage changes, and the question this answers is who actually saw
-- it, not who would be copied today.
ALTER TABLE saved_draft_approvals ADD COLUMN IF NOT EXISTS cc_emails text[];
