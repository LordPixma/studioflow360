-- Migration: Finance, Assets, and Invoices
-- Tables: budgets, purchases, assets, invoices

-- Budget categories for tracking spending
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('operations', 'maintenance', 'marketing', 'equipment', 'supplies', 'other')),
  amount REAL NOT NULL DEFAULT 0,
  spent REAL NOT NULL DEFAULT 0,
  period TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'annually')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Purchase/expense records
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  budget_id TEXT REFERENCES budgets(id),
  description TEXT NOT NULL,
  vendor TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  category TEXT NOT NULL CHECK (category IN ('operations', 'maintenance', 'marketing', 'equipment', 'supplies', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'refunded')),
  receipt_r2_key TEXT,
  purchase_date TEXT NOT NULL,
  paid_date TEXT,
  approved_by TEXT REFERENCES staff_users(id),
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_budget ON purchases(budget_id);
CREATE INDEX IF NOT EXISTS idx_purchases_category ON purchases(category);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);

-- Asset register
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('equipment', 'furniture', 'electronics', 'software', 'vehicle', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired', 'disposed', 'lost')),
  serial_number TEXT,
  model TEXT,
  manufacturer TEXT,
  purchase_date TEXT,
  purchase_price REAL,
  current_value REAL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  location TEXT,
  room_id TEXT REFERENCES rooms(id),
  assigned_to TEXT REFERENCES staff_users(id),
  warranty_expiry TEXT,
  notes TEXT,
  photo_r2_key TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_room ON assets(room_id);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  booking_id TEXT REFERENCES bookings(id),
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_address TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded')),
  issued_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  paid_date TEXT,
  notes TEXT,
  line_items TEXT NOT NULL DEFAULT '[]', -- JSON array of line items
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_booking ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(issued_date);
