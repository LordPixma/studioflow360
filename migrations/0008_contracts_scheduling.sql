-- Migration: Contracts & Agreements + Staff Scheduling
-- Tables: contracts, contract_templates, staff_shifts, time_off_requests

-- Contracts & Agreements
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  contract_number TEXT NOT NULL UNIQUE,
  guest_id TEXT REFERENCES guests(id),
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_company TEXT,
  booking_id TEXT REFERENCES bookings(id),
  quote_id TEXT REFERENCES quotes(id),
  title TEXT NOT NULL DEFAULT 'Studio Booking Agreement',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'active', 'expired', 'cancelled')),
  content TEXT NOT NULL DEFAULT '', -- Rich text / markdown body
  start_date TEXT,
  end_date TEXT,
  value REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  signed_at TEXT,
  signed_by_name TEXT,
  signed_by_email TEXT,
  notes TEXT,
  template_id TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_guest ON contracts(guest_id);
CREATE INDEX IF NOT EXISTS idx_contracts_number ON contracts(contract_number);
CREATE INDEX IF NOT EXISTS idx_contracts_booking ON contracts(booking_id);

-- Contract templates
CREATE TABLE IF NOT EXISTS contract_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL DEFAULT '', -- Template body with {{merge_fields}}
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Staff shifts / scheduling
CREATE TABLE IF NOT EXISTS staff_shifts (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff_users(id),
  room_id TEXT REFERENCES rooms(id),
  shift_date TEXT NOT NULL,
  start_time TEXT NOT NULL, -- HH:MM
  end_time TEXT NOT NULL,   -- HH:MM
  shift_type TEXT NOT NULL DEFAULT 'regular' CHECK (shift_type IN ('regular', 'overtime', 'on_call', 'cover')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shifts_staff ON staff_shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON staff_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_room ON staff_shifts(room_id);

-- Time-off requests
CREATE TABLE IF NOT EXISTS time_off_requests (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff_users(id),
  request_type TEXT NOT NULL DEFAULT 'holiday' CHECK (request_type IN ('holiday', 'sick', 'personal', 'other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  reason TEXT,
  reviewed_by TEXT REFERENCES staff_users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_timeoff_staff ON time_off_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_timeoff_dates ON time_off_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_timeoff_status ON time_off_requests(status);
