-- Owners and staff sign in through separate entrances; a session remembers which one.
-- Owner powers are only available in sessions started through the owner sign-in.
ALTER TABLE sessions
  ADD COLUMN portal text NOT NULL DEFAULT 'customer' CHECK (portal IN ('customer', 'staff', 'owner'));
