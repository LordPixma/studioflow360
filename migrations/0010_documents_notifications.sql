-- Migration 0010: Document Management & Notifications
-- Phase D of studio management expansion

-- ============================================
-- Document Management
-- ============================================

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('contract', 'invoice', 'receipt', 'photo', 'certificate', 'insurance', 'floor_plan', 'rider', 'release_form', 'other')),
  description TEXT,
  -- Linkable to any entity
  booking_id TEXT REFERENCES bookings(id),
  guest_id TEXT REFERENCES guests(id),
  contract_id TEXT REFERENCES contracts(id),
  task_id TEXT REFERENCES tasks(id),
  asset_id TEXT REFERENCES assets(id),
  room_id TEXT REFERENCES rooms(id),
  tags TEXT DEFAULT '[]',
  uploaded_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_booking ON documents(booking_id);
CREATE INDEX IF NOT EXISTS idx_documents_guest ON documents(guest_id);
CREATE INDEX IF NOT EXISTS idx_documents_contract ON documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_documents_task ON documents(task_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);

-- ============================================
-- Notifications / Activity Feed
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES staff_users(id),
  type TEXT NOT NULL CHECK (type IN ('booking_new', 'booking_status', 'booking_assigned', 'task_assigned', 'task_due', 'task_completed', 'time_off_request', 'time_off_reviewed', 'contract_signed', 'quote_accepted', 'inventory_low_stock', 'document_uploaded', 'comment_added', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  -- Reference to the entity
  entity_type TEXT CHECK (entity_type IN ('booking', 'task', 'contract', 'quote', 'guest', 'shift', 'time_off', 'inventory', 'document', 'asset')),
  entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Activity log for system-wide audit trail
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES staff_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
