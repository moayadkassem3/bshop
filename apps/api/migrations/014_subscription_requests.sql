-- "Aboneliği başlat" (v1.7): until online payment exists, an owner whose trial
-- has ended asks our team to start the subscription; we call back and set it.
CREATE TABLE subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  user_id uuid REFERENCES users ON DELETE SET NULL,
  plan_id text,
  created_at timestamptz NOT NULL
);
CREATE INDEX subscription_requests_shop_idx ON subscription_requests (shop_id, created_at DESC);
