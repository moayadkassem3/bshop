-- A staff member's photo, shown to customers on the salon page and when choosing
-- who does the appointment (founder, 8 November 2026). Set by the staff member or
-- the salon's owner; one per salon membership. photo_id names the current file, so
-- its public URL changes (and caches forever) whenever the photo does.
ALTER TABLE shop_members ADD COLUMN photo_id uuid UNIQUE;
ALTER TABLE shop_members ADD COLUMN photo_key text;
