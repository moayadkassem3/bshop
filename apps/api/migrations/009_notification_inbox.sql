-- The app lists each person's own notifications (v1.7: cancellations in Geçmiş).
CREATE INDEX notifications_inbox_idx ON notifications (recipient_user_id, created_at DESC) WHERE channel = 'push';
