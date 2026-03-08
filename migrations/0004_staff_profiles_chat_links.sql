-- Migration 0004: Staff profiles with avatars, booking chat links, messaging
-- Adds profile fields to staff_users and external chat link to bookings

-- Staff profile fields
ALTER TABLE staff_users ADD COLUMN phone_number TEXT;
ALTER TABLE staff_users ADD COLUMN bio TEXT;
ALTER TABLE staff_users ADD COLUMN avatar_r2_key TEXT;
ALTER TABLE staff_users ADD COLUMN job_title TEXT;
ALTER TABLE staff_users ADD COLUMN updated_at TEXT;

-- Booking external chat link for customer-coordinator communication
ALTER TABLE bookings ADD COLUMN external_chat_link TEXT;
ALTER TABLE bookings ADD COLUMN coordinator_phone TEXT;

-- Message log table for SMS/WhatsApp history
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  channel TEXT NOT NULL CHECK(channel IN ('sms', 'whatsapp')),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  twilio_sid TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_booking ON messages(booking_id);
CREATE INDEX idx_messages_created ON messages(created_at);
