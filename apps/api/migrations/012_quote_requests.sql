-- "Teklif al" (v1.7): salons with more than 10 staff ask for a custom price.
-- Kept for our team to call back, and for the admin panel later.
CREATE TABLE quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  email text,
  staff_count int NOT NULL CHECK (staff_count > 0),
  branch_count int NOT NULL DEFAULT 1 CHECK (branch_count > 0),
  city text,
  message text,
  source text NOT NULL CHECK (source IN ('fiyatlar', 'kayit', 'ayarlar')),
  user_id uuid REFERENCES users ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at timestamptz NOT NULL
);
CREATE INDEX quote_requests_recent_idx ON quote_requests (created_at DESC);
CREATE INDEX quote_requests_phone_idx ON quote_requests (phone, created_at);
