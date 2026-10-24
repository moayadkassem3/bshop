-- Handoff v1.4: the app serves all of Türkiye, so shops record their city (il);
-- customers keep favourite shops for quick access ("Salonlarım").
ALTER TABLE shops ADD COLUMN city text;

CREATE TABLE customer_favorites (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, shop_id)
);
