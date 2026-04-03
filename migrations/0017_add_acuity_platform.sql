-- Add 'acuity' to the platform CHECK constraint on bookings table
-- SQLite requires table rebuild to alter CHECK constraints
-- Must handle booking_events FK reference to bookings

-- Step 1: Create new bookings table with updated constraint
CREATE TABLE bookings_new (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('giggster', 'peerspace', 'scouty', 'tagvenue', 'direct', 'acuity')),
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
  calendar_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 2: Copy all existing data
INSERT INTO bookings_new SELECT
  id, platform, platform_ref, status, room_id, guest_name, guest_email,
  booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency,
  notes, ai_confidence, staff_notes, assigned_to, approved_at, approved_by,
  platform_actioned, platform_actioned_at, raw_email_r2_key, calendar_event_id,
  created_at, updated_at
FROM bookings;

-- Step 3: Save booking_events data to temp table (to avoid FK violation when dropping bookings)
CREATE TABLE booking_events_backup AS SELECT * FROM booking_events;

-- Step 4: Drop booking_events (it has FK to bookings)
DROP TABLE booking_events;

-- Step 5: Drop old bookings table
DROP TABLE bookings;

-- Step 6: Rename new table
ALTER TABLE bookings_new RENAME TO bookings;

-- Step 7: Recreate booking_events
CREATE TABLE booking_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  event_type TEXT NOT NULL,
  actor_id TEXT REFERENCES staff_users(id),
  payload TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 8: Restore booking_events data
INSERT INTO booking_events SELECT * FROM booking_events_backup;

-- Step 9: Drop backup
DROP TABLE booking_events_backup;

-- Step 10: Recreate indexes
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_platform ON bookings(platform);
CREATE INDEX idx_bookings_room_date ON bookings(room_id, booking_date);
CREATE INDEX idx_bookings_created_at ON bookings(created_at);
CREATE INDEX idx_bookings_assigned_to ON bookings(assigned_to);
CREATE INDEX idx_booking_events_booking_id ON booking_events(booking_id);
CREATE INDEX idx_booking_events_type ON booking_events(event_type);
