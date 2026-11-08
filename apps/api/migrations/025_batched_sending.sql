-- Sending in groups (founder, 8 November 2026): an announcement is no longer queued for
-- everyone at once. Each send is a run that walks the recipients in groups (by user id,
-- from a bookmark), one group per worker pass and only while the send queue is short.
CREATE TABLE announcement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements ON DELETE CASCADE,
  -- What was due, as it was then: editing or pausing the announcement does not change a run.
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL,
  customer_gender text,
  shop_audience text,
  -- The last user id queued; the next group starts after it.
  bookmark uuid,
  queued int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);
CREATE INDEX announcement_runs_open_idx ON announcement_runs (started_at) WHERE finished_at IS NULL;

-- "Does this person work at a salon?" for every recipient: by person, not by salon.
CREATE INDEX shop_members_user_idx ON shop_members (user_id) WHERE active;

-- The sender takes appointment messages before announcements, oldest first.
CREATE INDEX notifications_queued_priority_idx ON notifications ((template = 'announcement'), created_at) WHERE status = 'queued';
DROP INDEX notifications_queued_idx;
