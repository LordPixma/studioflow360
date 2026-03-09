-- Migration 0013: Marketing & Promotions (Phase D)
-- Tables: promotions, promo_codes, marketing_campaigns, guest_portal_config

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  promo_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value REAL NOT NULL DEFAULT 0,
  min_booking_value REAL,
  max_discount REAL,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  usage_limit INTEGER,
  times_used INTEGER DEFAULT 0,
  applicable_rooms TEXT DEFAULT '[]',
  applicable_platforms TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  promotion_id TEXT NOT NULL REFERENCES promotions(id),
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER,
  times_used INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'draft',
  target_audience TEXT DEFAULT '{}',
  content TEXT,
  subject TEXT,
  email_template_id TEXT REFERENCES email_templates(id),
  promotion_id TEXT REFERENCES promotions(id),
  scheduled_at TEXT,
  sent_at TEXT,
  recipients_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guest_portal_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  welcome_message TEXT,
  booking_instructions TEXT,
  cancellation_policy TEXT,
  faq TEXT DEFAULT '[]',
  custom_css TEXT,
  show_pricing INTEGER DEFAULT 1,
  show_availability INTEGER DEFAULT 1,
  require_approval INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES staff_users(id)
);

CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON marketing_campaigns(scheduled_at);

-- Insert default guest portal config
INSERT OR IGNORE INTO guest_portal_config (id, welcome_message, booking_instructions)
VALUES ('default', 'Welcome to our studio! Browse available rooms and book your session.', 'Select a room, pick your date and time, and submit your booking request.');
