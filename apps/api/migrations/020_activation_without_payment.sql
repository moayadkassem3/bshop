-- Admin panel (v1.7, founder): selling before there is a company or a payment gate,
-- our team may start a subscription without a payment (free month, pay later):
-- recorded as an activation with method 'yok' and amount 0.
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('havale', 'nakit', 'kart', 'diger', 'yok'));
ALTER TABLE payments ADD CONSTRAINT payments_none_is_free CHECK (method <> 'yok' OR amount_kurus = 0);
