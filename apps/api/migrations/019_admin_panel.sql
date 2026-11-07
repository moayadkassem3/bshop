-- Admin panel (v1.7, founder): salons go live at registration; our team checks
-- them afterwards for spam or misleading details and can take one down.
ALTER TABLE shops ADD COLUMN checked_at timestamptz;
ALTER TABLE shops ADD COLUMN checked_by uuid REFERENCES users ON DELETE SET NULL;
ALTER TABLE shops ADD COLUMN suspended_at timestamptz;
ALTER TABLE shops ADD COLUMN suspended_reason text CHECK (char_length(suspended_reason) <= 300);

-- Payments our team records until online payment exists (bank transfer, cash, card at the visit).
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  amount_kurus int NOT NULL CHECK (amount_kurus >= 0),
  months int NOT NULL CHECK (months BETWEEN 1 AND 24),
  method text NOT NULL CHECK (method IN ('havale', 'nakit', 'kart', 'diger')),
  note text CHECK (char_length(note) <= 300),
  period_end timestamptz NOT NULL,
  recorded_by uuid REFERENCES users ON DELETE SET NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX payments_shop_idx ON payments (shop_id, created_at DESC);
CREATE INDEX payments_created_idx ON payments (created_at DESC);

-- "Aboneliği başlat" requests are closed when our team starts the subscription.
ALTER TABLE subscription_requests ADD COLUMN handled_at timestamptz;

-- Salons still waiting for review go live now, with their free trial from today.
UPDATE subscriptions SET status = 'trial', current_period_end = now() + interval '7 days', updated_at = now()
WHERE status = 'none' AND shop_id IN (SELECT id FROM shops WHERE reviewed_at IS NULL);
UPDATE shops SET reviewed_at = now() WHERE reviewed_at IS NULL;
