-- A salon's profile photo (founder, 14 November 2026): the small square picture shown for the
-- salon in lists, on the map card, in Favoriler and search; until one is set, the first gallery
-- photo stands in. Kept apart from the gallery (shop_photos), like staff photos.
ALTER TABLE shops ADD COLUMN logo_id uuid UNIQUE;
ALTER TABLE shops ADD COLUMN logo_key text;
