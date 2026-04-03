-- Email classifications table: tracks non-booking emails and all classification results
CREATE TABLE IF NOT EXISTS email_classifications (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  platform TEXT,
  sender_domain TEXT NOT NULL,
  subject TEXT,
  category TEXT NOT NULL CHECK (category IN ('booking', 'update', 'marketing', 'informational', 'unknown')),
  ai_confidence REAL DEFAULT 0,
  message_id TEXT,
  received_at TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT REFERENCES staff_users(id),
  reviewed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_class_category ON email_classifications(category);
CREATE INDEX IF NOT EXISTS idx_email_class_created ON email_classifications(created_at);
CREATE INDEX IF NOT EXISTS idx_email_class_platform ON email_classifications(platform);
