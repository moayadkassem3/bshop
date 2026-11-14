-- Push notifications to the native app (phase 3). One row per phone (its
-- Firebase token); the token moves to whoever signs in on that phone last and
-- is removed when they sign out, or when Firebase says the app was uninstalled.
CREATE TABLE push_devices (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX push_devices_user_idx ON push_devices (user_id);

-- The customer's reminder two hours before a confirmed appointment (app only), sent once.
ALTER TABLE appointments ADD COLUMN customer_reminded_at timestamptz;
