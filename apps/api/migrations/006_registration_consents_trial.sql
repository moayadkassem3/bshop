-- Handoff v1.6: self-service shop registration, recorded agreement acceptance,
-- a 7-day free trial, and the "Ortak" (co-owner) label.

-- Owners are either the owner ("Sahip") or a co-owner ("Ortak"); same permissions.
ALTER TABLE shop_members
  ADD COLUMN owner_label text CHECK (owner_label IN ('owner', 'co_owner'));
UPDATE shop_members SET owner_label = 'owner' WHERE role = 'owner';

-- Who registered the shop, for our team's review queue.
ALTER TABLE shops ADD COLUMN registered_by uuid REFERENCES users;

-- Evidence of which agreement versions each person accepted, and when.
CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  shop_id uuid REFERENCES shops ON DELETE CASCADE,
  document_key text NOT NULL,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL,
  withdrawn_at timestamptz
);
CREATE INDEX consents_user_idx ON consents (user_id, document_key);
