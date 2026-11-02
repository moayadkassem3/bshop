-- Account deletion (v1.7, required by the app stores and KVKK). The user row is
-- kept so past appointments, consents and salon history stay consistent, but
-- everything that identifies the person is removed; the phone number becomes
-- free for a new account.
ALTER TABLE users ADD COLUMN deleted_at timestamptz;
