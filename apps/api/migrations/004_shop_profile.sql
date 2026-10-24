-- Handoff v1.3: map discovery is removed; every shop has a public profile page
-- with photos, address and directions, phone, WhatsApp, and Instagram.
ALTER TABLE shops
  ADD COLUMN district text,
  ADD COLUMN whatsapp text,
  ADD COLUMN instagram text,
  ADD COLUMN about text;

CREATE TABLE shop_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  storage_key text NOT NULL,
  width int NOT NULL,
  height int NOT NULL,
  position int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_photos_shop_idx ON shop_photos (shop_id, position);
