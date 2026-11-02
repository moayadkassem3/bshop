-- Salon ratings (v1.7, founder): 1–5 stars, no comments. Only the customer of a
-- completed visit (marked "Geldi") can rate it, within 14 days; the salon's
-- owners may answer each rating once, publicly. A salon's average counts each
-- customer's latest rating, so a regular cannot outweigh everyone else.
CREATE TABLE shop_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  reply text CHECK (char_length(reply) BETWEEN 1 AND 300),
  replied_at timestamptz,
  -- Our team can hide an abusive or fake rating (admin panel); it then counts nowhere.
  hidden_at timestamptz
);
CREATE INDEX shop_ratings_shop_idx ON shop_ratings (shop_id, updated_at DESC);
CREATE INDEX shop_ratings_customer_idx ON shop_ratings (shop_id, customer_id, updated_at DESC);
