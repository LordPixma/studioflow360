-- StudioFlow360 Initial Schema
-- Migration 0001: Create all core tables

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER NOT NULL DEFAULT 1,
  hourly_rate REAL NOT NULL DEFAULT 0,
  color_hex TEXT NOT NULL DEFAULT '#3B82F6',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  access_email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')) DEFAULT 'staff',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('giggster', 'peerspace', 'scouty', 'tagvenue', 'direct')),
  platform_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'PLATFORM_ACTIONED', 'CONFIRMED', 'CANCELLED')) DEFAULT 'PENDING',
  room_id TEXT REFERENCES rooms(id),
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  booking_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_hours REAL,
  guest_count INTEGER,
  total_price REAL,
  currency TEXT DEFAULT 'GBP',
  notes TEXT,
  ai_confidence REAL,
  staff_notes TEXT,
  assigned_to TEXT REFERENCES staff_users(id),
  approved_at TEXT,
  approved_by TEXT REFERENCES staff_users(id),
  platform_actioned INTEGER NOT NULL DEFAULT 0,
  platform_actioned_at TEXT,
  raw_email_r2_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('RECEIVED', 'PARSED', 'ASSIGNED', 'APPROVED', 'REJECTED', 'CONFIRMED', 'CANCELLED', 'NOTE_ADDED', 'PLATFORM_ACTIONED', 'EDITED')),
  actor_id TEXT REFERENCES staff_users(id),
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_email_rules (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('giggster', 'peerspace', 'scouty', 'tagvenue', 'direct')),
  sender_domain TEXT NOT NULL,
  subject_pattern TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_platform ON bookings(platform);
CREATE INDEX IF NOT EXISTS idx_bookings_room_date ON bookings(room_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_to ON bookings(assigned_to);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id ON booking_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_platform_email_rules_domain ON platform_email_rules(sender_domain);
