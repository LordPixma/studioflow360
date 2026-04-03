-- Add Stripe payment tracking to bookings
ALTER TABLE bookings ADD COLUMN payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded', 'failed'));
ALTER TABLE bookings ADD COLUMN stripe_checkout_session_id TEXT;
ALTER TABLE bookings ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN amount_paid REAL;
ALTER TABLE bookings ADD COLUMN paid_at TEXT;
