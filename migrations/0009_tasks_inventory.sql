-- Migration 0009: Tasks & Inventory Management
-- Phase C of studio management expansion

-- ============================================
-- Tasks / Maintenance Management
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'maintenance', 'cleaning', 'repair', 'setup', 'teardown', 'admin', 'follow_up')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled', 'on_hold')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TEXT,
  due_time TEXT,
  room_id TEXT REFERENCES rooms(id),
  asset_id TEXT REFERENCES assets(id),
  booking_id TEXT REFERENCES bookings(id),
  assigned_to TEXT REFERENCES staff_users(id),
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_rule TEXT CHECK (recurrence_rule IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually')),
  recurrence_end_date TEXT,
  parent_task_id TEXT REFERENCES tasks(id),
  completed_at TEXT,
  completed_by TEXT REFERENCES staff_users(id),
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_room ON tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);

CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- Checklist items within a task
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_checked INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  checked_by TEXT REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id);

-- ============================================
-- Inventory / Supplies Management
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'cables', 'batteries', 'tape', 'lighting', 'audio', 'cleaning', 'stationery', 'refreshments', 'safety', 'other')),
  unit TEXT NOT NULL DEFAULT 'pcs' CHECK (unit IN ('pcs', 'boxes', 'rolls', 'packs', 'litres', 'kg', 'metres', 'pairs', 'sets')),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  minimum_stock INTEGER NOT NULL DEFAULT 0,
  reorder_quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  supplier TEXT,
  supplier_url TEXT,
  location TEXT,
  room_id TEXT REFERENCES rooms(id),
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_restocked_at TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory_items(quantity_on_hand, minimum_stock);

-- Stock movement log (in/out/adjustment)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('restock', 'usage', 'adjustment', 'return', 'write_off')),
  quantity INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  reference TEXT,
  notes TEXT,
  booking_id TEXT REFERENCES bookings(id),
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inv_transactions_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_date ON inventory_transactions(created_at);
