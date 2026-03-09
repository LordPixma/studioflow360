-- Migration: Studio Settings (single-row config table)
-- Stores studio branding, contact info, and invoice defaults

CREATE TABLE IF NOT EXISTS studio_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  studio_name TEXT NOT NULL DEFAULT 'Aeras',
  studio_subtitle TEXT DEFAULT 'Leeds Content Creation Studios',
  studio_address TEXT DEFAULT 'Leeds City Centre, UK',
  studio_email TEXT,
  studio_phone TEXT,
  studio_website TEXT,
  logo_r2_key TEXT,
  invoice_payment_terms TEXT DEFAULT 'Payment due within 14 days of invoice date.',
  invoice_bank_details TEXT,
  invoice_notes TEXT,
  invoice_tax_rate REAL NOT NULL DEFAULT 20,
  invoice_currency TEXT NOT NULL DEFAULT 'GBP',
  invoice_due_days INTEGER NOT NULL DEFAULT 14,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES staff_users(id)
);

-- Seed with default row
INSERT OR IGNORE INTO studio_settings (id, studio_name, studio_subtitle, studio_address)
VALUES ('default', 'Aeras', 'Leeds Content Creation Studios', 'Leeds City Centre, UK');
