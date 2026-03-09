-- Migration: CRM (Client & Guest Management) + Quotes & Proposals
-- Tables: guests, guest_tags, guest_notes, quotes, quote_line_items, quote_templates

-- Guest directory: aggregated profiles from bookings
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  address TEXT,
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of tag strings e.g. ["VIP","corporate"]
  source TEXT NOT NULL DEFAULT 'booking' CHECK (source IN ('booking', 'manual', 'import')),
  total_bookings INTEGER NOT NULL DEFAULT 0,
  total_revenue REAL NOT NULL DEFAULT 0,
  last_booking_date TEXT,
  notes TEXT,
  created_by TEXT REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guests_email ON guests(email);
CREATE INDEX IF NOT EXISTS idx_guests_name ON guests(name);

-- Guest notes / interaction log
CREATE TABLE IF NOT EXISTS guest_notes (
  id TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'note' CHECK (note_type IN ('note', 'call', 'email', 'meeting', 'follow_up')),
  content TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guest_notes_guest ON guest_notes(guest_id);

-- Link guests to bookings (many-to-many, since a guest may have multiple bookings)
CREATE TABLE IF NOT EXISTS guest_bookings (
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guest_id, booking_id)
);

-- Quotes / Proposals
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  quote_number TEXT NOT NULL UNIQUE,
  guest_id TEXT REFERENCES guests(id),
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_company TEXT,
  guest_address TEXT,
  booking_id TEXT REFERENCES bookings(id),
  title TEXT NOT NULL DEFAULT 'Studio Booking Quote',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted')),
  subtotal REAL NOT NULL DEFAULT 0,
  discount_percent REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 20,
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  valid_until TEXT,
  accepted_at TEXT,
  converted_invoice_id TEXT REFERENCES invoices(id),
  notes TEXT,
  terms TEXT,
  template_id TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_guest ON quotes(guest_id);
CREATE INDEX IF NOT EXISTS idx_quotes_number ON quotes(quote_number);

-- Quote line items (separate table for proper relational structure)
CREATE TABLE IF NOT EXISTS quote_line_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_line_items(quote_id);

-- Quote templates for reusable pricing packages
CREATE TABLE IF NOT EXISTS quote_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  line_items TEXT NOT NULL DEFAULT '[]', -- JSON array of {description, quantity, unit_price, total}
  discount_percent REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 20,
  terms TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
