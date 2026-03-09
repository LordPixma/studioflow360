-- Migration 0014: Integrations Hub (Phase E remainder)
-- Tables: integrations, webhook_endpoints, webhook_log

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  config TEXT DEFAULT '{}',
  credentials TEXT DEFAULT '{}',
  last_sync_at TEXT,
  sync_error TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  last_triggered_at TEXT,
  failure_count INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_log (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id),
  event_type TEXT NOT NULL,
  payload TEXT,
  response_status INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_integrations_active ON integrations(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON webhook_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_log_endpoint ON webhook_log(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_log_created ON webhook_log(created_at);
