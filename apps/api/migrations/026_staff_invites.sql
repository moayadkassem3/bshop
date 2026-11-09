-- Staff invites (founder, 9 November 2026): adding someone to a salon's team sends an
-- invite (push if they use the app, SMS otherwise); they join only when they accept.
-- One person works at one salon: someone already on any salon's team cannot be invited as
-- staff elsewhere, and staff cannot be invited elsewhere at all (checked again on accepting).
CREATE TABLE staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  -- 'co_owner' for an Ortak; null for staff.
  owner_label text CHECK (owner_label IN ('co_owner')),
  display_name text NOT NULL,
  bookable boolean NOT NULL,
  invited_by uuid REFERENCES users,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  -- How the last invite went out: 'push', 'sms' or 'push+sms'.
  sent_via text NOT NULL,
  created_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL,
  answered_at timestamptz
);
CREATE UNIQUE INDEX staff_invites_pending_idx ON staff_invites (shop_id, user_id) WHERE status = 'pending';
CREATE INDEX staff_invites_user_idx ON staff_invites (user_id) WHERE status = 'pending';
