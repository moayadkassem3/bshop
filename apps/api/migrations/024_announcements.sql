-- Announcements (founder, 8 November 2026): our team writes a push notification in
-- Yönetim → Bildirimler for customers, salons or everyone, sent once or repeated
-- daily / on chosen weekdays at a time of day (Istanbul). Each send queues one push per
-- person in notifications (template 'announcement'), which the worker delivers.
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 65),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  audience text NOT NULL CHECK (audience IN ('customers', 'businesses', 'all')),
  -- Customers only: 'male' / 'female' (the gender they gave), or everyone.
  customer_gender text CHECK (customer_gender IN ('male', 'female')),
  -- Salons only: the salon's type (men / women / unisex), or every salon.
  shop_audience text CHECK (shop_audience IN ('men', 'women', 'unisex')),
  repeat text NOT NULL CHECK (repeat IN ('once', 'daily', 'weekly')),
  -- Minutes after midnight, Istanbul time, for daily and weekly ones.
  time_of_day int CHECK (time_of_day BETWEEN 0 AND 1439),
  -- ISO weekdays (1 = Monday) for weekly ones.
  weekdays smallint[] NOT NULL DEFAULT '{}',
  next_run_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  last_sent_count int,
  total_sent int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX announcements_due_idx ON announcements (next_run_at) WHERE active;

-- Profil → Duyurular: a person can turn announcements off (appointment messages still come).
ALTER TABLE users ADD COLUMN announcements_off boolean NOT NULL DEFAULT false;
