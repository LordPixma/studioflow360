-- Migration 0011: Reports & Resource Planning
-- Phase C of studio management expansion (per original roadmap)

-- ============================================
-- Saved Reports (user-configurable report definitions)
-- ============================================

CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('revenue', 'occupancy', 'bookings', 'staff_utilization', 'guest_activity', 'financial_summary', 'inventory_usage', 'task_completion', 'custom')),
  filters TEXT NOT NULL DEFAULT '{}',
  schedule TEXT CHECK (schedule IN ('daily', 'weekly', 'monthly', 'quarterly')),
  last_run_at TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_type ON saved_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_saved_reports_created_by ON saved_reports(created_by);

-- ============================================
-- Resource Planning — capacity targets per room
-- ============================================

CREATE TABLE IF NOT EXISTS room_capacity_targets (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('daily_hours', 'weekly_hours', 'monthly_revenue', 'monthly_bookings')),
  target_value REAL NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_capacity_targets_room ON room_capacity_targets(room_id);

-- ============================================
-- Export log — track generated exports
-- ============================================

CREATE TABLE IF NOT EXISTS export_log (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'pdf', 'xlsx')),
  filters TEXT NOT NULL DEFAULT '{}',
  row_count INTEGER NOT NULL DEFAULT 0,
  file_size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_export_log_created_by ON export_log(created_by);
