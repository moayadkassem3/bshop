-- Core schema for the salon booking platform (milestone 1).
-- Every shop-owned row carries shop_id; queries always filter by it.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  first_name text,
  last_name text,
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL
);
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text,
  address text,
  latitude double precision,
  longitude double precision,
  timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  audience text NOT NULL DEFAULT 'men' CHECK (audience IN ('men', 'women', 'unisex')),
  cancellation_cutoff_minutes int NOT NULL DEFAULT 120 CHECK (cancellation_cutoff_minutes >= 0),
  min_lead_minutes int NOT NULL DEFAULT 0 CHECK (min_lead_minutes >= 0),
  buffer_minutes int NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  slot_step_minutes int NOT NULL DEFAULT 15 CHECK (slot_step_minutes IN (5, 10, 15, 20, 30)),
  booking_horizon_days int NOT NULL DEFAULT 30 CHECK (booking_horizon_days BETWEEN 1 AND 365),
  max_future_bookings int NOT NULL DEFAULT 2 CHECK (max_future_bookings >= 1),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per shop. Prices and the payment provider are added with billing.
CREATE TABLE subscriptions (
  shop_id uuid PRIMARY KEY REFERENCES shops ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'trial', 'active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  grace_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Owners and staff. A bookable member is a staff profile customers can book
-- (and a billing seat); an owner who also cuts hair is bookable too.
CREATE TABLE shop_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  display_name text NOT NULL,
  bookable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, user_id),
  UNIQUE (shop_id, id)
);

-- Weekly working intervals; gaps between intervals are breaks.
CREATE TABLE working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  member_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minute int NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute int NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  CHECK (end_minute > start_minute),
  FOREIGN KEY (shop_id, member_id) REFERENCES shop_members (shop_id, id) ON DELETE CASCADE
);
CREATE INDEX working_hours_member_idx ON working_hours (member_id, weekday);

CREATE TABLE time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  member_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('block', 'absence')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  note text,
  created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (shop_id, member_id) REFERENCES shop_members (shop_id, id) ON DELETE CASCADE
);
CREATE INDEX time_off_member_idx ON time_off (member_id, starts_at);

-- Weekly windows in which appointments STARTING inside them confirm instantly.
CREATE TABLE auto_confirm_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minute int NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute int NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  CHECK (end_minute > start_minute)
);

-- Platform template (handoff Section 6). Shops copy from it.
CREATE TABLE catalog_services (
  id int PRIMARY KEY,
  name text NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  catalog_service_id int REFERENCES catalog_services,
  name text NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  price_kurus int NOT NULL CHECK (price_kurus >= 0),
  price_is_starting_from boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id)
);

-- Which services each staff member performs, with an optional own duration.
CREATE TABLE member_services (
  shop_id uuid NOT NULL,
  member_id uuid NOT NULL,
  service_id uuid NOT NULL,
  duration_minutes int CHECK (duration_minutes > 0),
  PRIMARY KEY (member_id, service_id),
  FOREIGN KEY (shop_id, member_id) REFERENCES shop_members (shop_id, id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id, service_id) REFERENCES services (shop_id, id) ON DELETE CASCADE
);

-- A customer's standing with one shop.
CREATE TABLE shop_customers (
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users,
  blocked boolean NOT NULL DEFAULT false,
  no_show_count int NOT NULL DEFAULT 0,
  late_cancel_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, user_id)
);

CREATE TABLE booking_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  group_id uuid REFERENCES booking_groups,
  staff_id uuid NOT NULL,
  customer_id uuid REFERENCES users,
  customer_name text NOT NULL,
  customer_phone text,
  guest_name text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  blocked_until timestamptz NOT NULL,
  status text NOT NULL
    CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')),
  source text NOT NULL CHECK (source IN ('online', 'staff_entry', 'walk_in')),
  requested_staff boolean NOT NULL,
  confirmed_via text CHECK (confirmed_via IN ('staff', 'timeout', 'auto_hours', 'staff_entry')),
  deadline_at timestamptz,
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  responded_by uuid REFERENCES users,
  cancel_reason text
    CHECK (cancel_reason IN ('customer', 'customer_late', 'shop', 'staff_absence')),
  cancelled_at timestamptz,
  total_price_kurus int NOT NULL,
  price_is_starting_from boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (ends_at > starts_at AND blocked_until >= ends_at),
  FOREIGN KEY (shop_id, staff_id) REFERENCES shop_members (shop_id, id),
  -- The database itself refuses two live appointments overlapping for one staff member.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, blocked_until) WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);
CREATE INDEX appointments_shop_time_idx ON appointments (shop_id, starts_at);
CREATE INDEX appointments_customer_idx ON appointments (customer_id, shop_id, starts_at);
CREATE INDEX appointments_pending_deadline_idx ON appointments (deadline_at) WHERE status = 'pending';

CREATE TABLE appointment_services (
  appointment_id uuid NOT NULL REFERENCES appointments ON DELETE CASCADE,
  position int NOT NULL,
  service_id uuid NOT NULL REFERENCES services,
  name text NOT NULL,
  duration_minutes int NOT NULL,
  price_kurus int NOT NULL,
  price_is_starting_from boolean NOT NULL,
  PRIMARY KEY (appointment_id, position)
);

-- Outbox: written in the same transaction as the change, sent by the dispatcher.
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES shops ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'push')),
  recipient_user_id uuid REFERENCES users,
  recipient_phone text,
  template text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error text,
  created_at timestamptz NOT NULL,
  sent_at timestamptz
);
CREATE INDEX notifications_queued_idx ON notifications (created_at) WHERE status = 'queued';
