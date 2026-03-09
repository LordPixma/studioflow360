-- Migration: Add UNAPPROVED event type to booking_events
-- SQLite doesn't support ALTER TABLE ... ALTER CONSTRAINT, so we recreate the table

CREATE TABLE IF NOT EXISTS booking_events_new (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('RECEIVED', 'PARSED', 'ASSIGNED', 'APPROVED', 'REJECTED', 'CONFIRMED', 'CANCELLED', 'NOTE_ADDED', 'PLATFORM_ACTIONED', 'EDITED', 'UNAPPROVED')),
  actor_id TEXT REFERENCES staff_users(id),
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO booking_events_new SELECT * FROM booking_events;

DROP TABLE booking_events;

ALTER TABLE booking_events_new RENAME TO booking_events;

CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id ON booking_events(booking_id);
