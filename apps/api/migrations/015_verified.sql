-- Verified tick (v1.7): a salon after 3 completed bookings made through the app,
-- a customer after 3 completed visits, not necessarily in a row. Once earned it stays.
ALTER TABLE shops ADD COLUMN verified_at timestamptz;
ALTER TABLE users ADD COLUMN verified_at timestamptz;

-- Earned before this release: the time of the third completed appointment.
UPDATE shops s SET verified_at = x.at
FROM (
  SELECT shop_id, starts_at AS at FROM (
    SELECT shop_id, starts_at, row_number() OVER (PARTITION BY shop_id ORDER BY starts_at) AS n
    FROM appointments WHERE status = 'completed' AND source = 'online' AND customer_id IS NOT NULL
  ) ranked WHERE n = 3
) x WHERE x.shop_id = s.id;

UPDATE users u SET verified_at = x.at
FROM (
  SELECT customer_id, starts_at AS at FROM (
    SELECT customer_id, starts_at, row_number() OVER (PARTITION BY customer_id ORDER BY starts_at) AS n
    FROM appointments WHERE status = 'completed' AND source = 'online' AND customer_id IS NOT NULL
  ) ranked WHERE n = 3
) x WHERE x.customer_id = u.id;
