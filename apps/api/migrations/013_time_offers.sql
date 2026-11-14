-- "Başka saat öner" (v1.7): instead of declining a request, the salon offers
-- another time. The appointment moves to that time as 'offered', which holds the
-- slot until the customer accepts, declines, or the reply deadline passes.
ALTER TABLE appointments ADD COLUMN offered_from timestamptz;

ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'offered', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show'));

ALTER TABLE appointments DROP CONSTRAINT appointments_confirmed_via_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_confirmed_via_check
  CHECK (confirmed_via IN ('staff', 'timeout', 'auto_hours', 'staff_entry', 'offer'));

ALTER TABLE appointments DROP CONSTRAINT appointments_no_overlap;
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
  staff_id WITH =,
  tstzrange(starts_at, blocked_until) WITH &&
) WHERE (status IN ('pending', 'offered', 'confirmed'));

CREATE INDEX appointments_offered_deadline_idx ON appointments (deadline_at) WHERE status = 'offered';
