-- Subscription reminders (v1.7): SMS to the salon owner before and when a trial
-- or paid period ends, with the website's Aboneliğim link (the store apps never
-- sell; payment happens on the website). One row per reminder sent, so each goes
-- out once per period.
CREATE TABLE subscription_reminders (
  shop_id uuid NOT NULL REFERENCES shops ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('trial_3d', 'trial_1d', 'trial_ended', 'period_3d', 'payment_late', 'hidden')),
  period_end timestamptz NOT NULL,
  sent_at timestamptz NOT NULL,
  PRIMARY KEY (shop_id, kind, period_end)
);
