-- Salon statistics (v1.7): visits to a salon's page, counted per day and by
-- where the visitor came from. Only counts are stored: no visitor, IP or device.
CREATE TABLE shop_view_counts (
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  day date NOT NULL,
  source text NOT NULL CHECK (source IN ('kesfet', 'kesimler', 'qr', 'diger')),
  views int NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, day, source)
);
