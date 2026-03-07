-- Seed data for development and initial setup

-- Default rooms
INSERT OR IGNORE INTO rooms (id, name, description, capacity, hourly_rate, color_hex, active)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Studio A', 'Main production studio with green screen and full lighting rig', 20, 75.00, '#3B82F6', 1),
  ('550e8400-e29b-41d4-a716-446655440002', 'Studio B', 'Medium studio ideal for interviews and small productions', 10, 50.00, '#8B5CF6', 1),
  ('550e8400-e29b-41d4-a716-446655440003', 'Podcast Suite', 'Soundproofed podcast recording room with 4-person setup', 4, 35.00, '#10B981', 1),
  ('550e8400-e29b-41d4-a716-446655440004', 'Meeting Room', 'Client meeting and pre-production planning space', 8, 25.00, '#F97316', 1);

-- Platform email rules
INSERT OR IGNORE INTO platform_email_rules (id, platform, sender_domain, subject_pattern, active)
VALUES
  ('rule-001', 'giggster', 'giggster.com', NULL, 1),
  ('rule-002', 'peerspace', 'peerspace.com', NULL, 1),
  ('rule-003', 'scouty', 'scouty.com', NULL, 1),
  ('rule-004', 'scouty', 'scooty.co.uk', NULL, 1),
  ('rule-005', 'tagvenue', 'tagvenue.com', NULL, 1),
  ('rule-006', 'tagvenue', 'tagvenue.co.uk', NULL, 1);
