-- Salon links (v1.7): when a salon's link changes (e.g. "kuafor-mk" became
-- "mk-avcilar"), the earlier one keeps leading to it, so printed QR codes and
-- shared links never break.
CREATE TABLE shop_slug_history (
  slug text PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  retired_at timestamptz NOT NULL
);
CREATE INDEX shop_slug_history_shop_idx ON shop_slug_history (shop_id);
