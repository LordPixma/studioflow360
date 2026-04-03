-- Add read tracking to messages for dashboard notifications
ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN read_by TEXT;
ALTER TABLE messages ADD COLUMN read_at TEXT;
CREATE INDEX idx_messages_unread ON messages(is_read, direction);
