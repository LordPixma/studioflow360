-- Studio Management module
CREATE TABLE IF NOT EXISTS studio_items (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('maintenance', 'insurance', 'consumables', 'contracts')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled')) DEFAULT 'pending',
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  due_date TEXT,
  cost REAL,
  currency TEXT DEFAULT 'GBP',
  vendor TEXT,
  recurrence TEXT CHECK (recurrence IN ('none', 'weekly', 'monthly', 'quarterly', 'annually')) DEFAULT 'none',
  notes TEXT,
  created_by TEXT NOT NULL,
  assigned_to TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_studio_items_category ON studio_items(category);
CREATE INDEX IF NOT EXISTS idx_studio_items_status ON studio_items(status);
CREATE INDEX IF NOT EXISTS idx_studio_items_due_date ON studio_items(due_date);
