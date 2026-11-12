-- Paying by EFT / Havale on the website (founder, 12 November 2026). The owner sends the
-- money to our bank account with their phone number in the Açıklama, then tells us with
-- "Ödemeyi yaptım". Our team finds the transfer in the bank statement by that number and
-- confirms it in Yönetim, which records the payment and extends the subscription.
CREATE TABLE payment_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  user_id uuid REFERENCES users ON DELETE SET NULL,
  months int NOT NULL CHECK (months BETWEEN 1 AND 24),
  amount_kurus int NOT NULL CHECK (amount_kurus > 0),
  method text NOT NULL CHECK (method IN ('havale')),
  -- What the owner was asked to write in the transfer's Açıklama: their phone number.
  reference text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'withdrawn')),
  payment_id uuid REFERENCES payments ON DELETE SET NULL,
  handled_by uuid REFERENCES users ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  handled_at timestamptz
);
-- One notice waiting per salon.
CREATE UNIQUE INDEX payment_notices_pending_idx ON payment_notices (shop_id) WHERE status = 'pending';
CREATE INDEX payment_notices_created_idx ON payment_notices (created_at DESC);
