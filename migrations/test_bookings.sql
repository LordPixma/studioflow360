-- Test bookings across all platforms and statuses for UI validation
-- These can be removed before production go-live

-- Giggster: CONFIRMED booking (full lifecycle complete)
INSERT OR IGNORE INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency, notes, ai_confidence, assigned_to, approved_at, approved_by, platform_actioned, platform_actioned_at, created_at, updated_at)
VALUES ('b0000001-0000-0000-0000-000000000001', 'giggster', 'GIG-20260310-4821', 'CONFIRMED', '550e8400-e29b-41d4-a716-446655440001', 'Marcus Chen', 'marcus.chen@email.com', '2026-03-12', '09:00', '17:00', 8.0, 15, 600.00, 'GBP', 'Music video shoot. Need full lighting rig and green screen.', 0.92, '00000000-0000-0000-0000-000000000001', '2026-03-07T10:00:00Z', '00000000-0000-0000-0000-000000000001', 1, '2026-03-07T10:30:00Z', '2026-03-07T08:30:00Z', '2026-03-07T11:00:00Z');

-- Peerspace: APPROVED (waiting for platform action)
INSERT OR IGNORE INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency, notes, ai_confidence, assigned_to, approved_at, approved_by, platform_actioned, created_at, updated_at)
VALUES ('b0000002-0000-0000-0000-000000000002', 'peerspace', 'PS-882716', 'APPROVED', '550e8400-e29b-41d4-a716-446655440002', 'Aisha Patel', 'aisha.p@creativestudio.co.uk', '2026-03-14', '10:00', '14:00', 4.0, 6, 200.00, 'GBP', 'Corporate headshot session for team of 6.', 0.88, '00000000-0000-0000-0000-000000000001', '2026-03-07T09:00:00Z', '00000000-0000-0000-0000-000000000001', 0, '2026-03-07T07:15:00Z', '2026-03-07T09:00:00Z');

-- Scouty: PENDING (newly arrived, awaiting review)
INSERT OR IGNORE INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency, notes, ai_confidence, assigned_to, platform_actioned, created_at, updated_at)
VALUES ('b0000003-0000-0000-0000-000000000003', 'scouty', 'SCT-2026-03155', 'PENDING', NULL, 'James Rodriguez', 'j.rodriguez@filmproductions.com', '2026-03-15', '08:00', '18:00', 10.0, 20, 750.00, 'GBP', 'Feature film location scout. Full day booking, need both studios if possible.', 0.85, NULL, 0, '2026-03-07T11:45:00Z', '2026-03-07T11:45:00Z');

-- TagVenue: NEEDS_REVIEW (low AI confidence)
INSERT OR IGNORE INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency, notes, ai_confidence, assigned_to, platform_actioned, created_at, updated_at)
VALUES ('b0000004-0000-0000-0000-000000000004', 'tagvenue', NULL, 'NEEDS_REVIEW', NULL, 'Sophie Williams', 'sophie@events.co', '2026-03-16', '14:00', '18:00', 4.0, NULL, NULL, 'GBP', 'Enquiry about hosting a private screening event. Details unclear from email.', 0.42, NULL, 0, '2026-03-07T12:00:00Z', '2026-03-07T12:00:00Z');

-- Direct website: PENDING
INSERT OR IGNORE INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency, notes, ai_confidence, assigned_to, platform_actioned, created_at, updated_at)
VALUES ('b0000005-0000-0000-0000-000000000005', 'direct', NULL, 'PENDING', '550e8400-e29b-41d4-a716-446655440003', 'Tom Baker', 'tom.baker@podcast.fm', '2026-03-13', '15:00', '17:00', 2.0, 3, 70.00, 'GBP', 'Podcast recording session. 3 guests, need 4 microphones.', 1.0, NULL, 0, '2026-03-07T06:00:00Z', '2026-03-07T06:00:00Z');

-- Peerspace: PLATFORM_ACTIONED (accepted on platform, awaiting final confirm)
INSERT OR IGNORE INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency, notes, ai_confidence, assigned_to, approved_at, approved_by, platform_actioned, platform_actioned_at, created_at, updated_at)
VALUES ('b0000006-0000-0000-0000-000000000006', 'peerspace', 'PS-882720', 'PLATFORM_ACTIONED', '550e8400-e29b-41d4-a716-446655440001', 'Elena Vasquez', 'elena@fashionweek.com', '2026-03-18', '07:00', '19:00', 12.0, 25, 900.00, 'GBP', 'Fashion lookbook shoot. Bringing own lighting but need space cleared.', 0.95, '00000000-0000-0000-0000-000000000001', '2026-03-06T14:00:00Z', '00000000-0000-0000-0000-000000000001', 1, '2026-03-06T15:00:00Z', '2026-03-06T12:00:00Z', '2026-03-06T15:00:00Z');

-- Giggster: REJECTED
INSERT OR IGNORE INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency, notes, ai_confidence, assigned_to, platform_actioned, created_at, updated_at)
VALUES ('b0000007-0000-0000-0000-000000000007', 'giggster', 'GIG-20260310-4830', 'REJECTED', NULL, 'Dave Thompson', 'dave.t@indie.film', '2026-03-12', '09:00', '13:00', 4.0, 8, 300.00, 'GBP', 'Student film project. Conflicts with existing confirmed booking.', 0.90, '00000000-0000-0000-0000-000000000001', 0, '2026-03-06T18:00:00Z', '2026-03-07T08:00:00Z');

-- Scouty: PENDING (another one for a busy inbox)
INSERT OR IGNORE INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency, notes, ai_confidence, assigned_to, platform_actioned, created_at, updated_at)
VALUES ('b0000008-0000-0000-0000-000000000008', 'scouty', 'SCT-2026-03160', 'PENDING', NULL, 'Priya Sharma', 'priya@bollywooduk.com', '2026-03-20', '10:00', '16:00', 6.0, 12, 450.00, 'GBP', 'Bollywood dance sequence filming. Need open floor space.', 0.78, NULL, 0, '2026-03-07T13:00:00Z', '2026-03-07T13:00:00Z');

-- Audit events for the test bookings
INSERT OR IGNORE INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES
('e001', 'b0000001-0000-0000-0000-000000000001', 'RECEIVED', NULL, '{"source":"email","platform":"giggster"}', '2026-03-07T08:30:00Z'),
('e002', 'b0000001-0000-0000-0000-000000000001', 'PARSED', NULL, '{"confidence":0.92}', '2026-03-07T08:30:05Z'),
('e003', 'b0000001-0000-0000-0000-000000000001', 'ASSIGNED', '00000000-0000-0000-0000-000000000001', '{"room_id":"550e8400-e29b-41d4-a716-446655440001","room_name":"Studio A"}', '2026-03-07T09:00:00Z'),
('e004', 'b0000001-0000-0000-0000-000000000001', 'APPROVED', '00000000-0000-0000-0000-000000000001', '{"from":"PENDING","to":"APPROVED"}', '2026-03-07T10:00:00Z'),
('e005', 'b0000001-0000-0000-0000-000000000001', 'PLATFORM_ACTIONED', '00000000-0000-0000-0000-000000000001', '{"actioned_at":"2026-03-07T10:30:00Z"}', '2026-03-07T10:30:00Z'),
('e006', 'b0000001-0000-0000-0000-000000000001', 'CONFIRMED', '00000000-0000-0000-0000-000000000001', '{"from":"PLATFORM_ACTIONED","to":"CONFIRMED"}', '2026-03-07T11:00:00Z'),
('e007', 'b0000002-0000-0000-0000-000000000002', 'RECEIVED', NULL, '{"source":"email","platform":"peerspace"}', '2026-03-07T07:15:00Z'),
('e008', 'b0000002-0000-0000-0000-000000000002', 'PARSED', NULL, '{"confidence":0.88}', '2026-03-07T07:15:05Z'),
('e009', 'b0000002-0000-0000-0000-000000000002', 'APPROVED', '00000000-0000-0000-0000-000000000001', '{"from":"PENDING","to":"APPROVED"}', '2026-03-07T09:00:00Z'),
('e010', 'b0000003-0000-0000-0000-000000000003', 'RECEIVED', NULL, '{"source":"email","platform":"scouty"}', '2026-03-07T11:45:00Z'),
('e011', 'b0000003-0000-0000-0000-000000000003', 'PARSED', NULL, '{"confidence":0.85}', '2026-03-07T11:45:05Z'),
('e012', 'b0000004-0000-0000-0000-000000000004', 'RECEIVED', NULL, '{"source":"email","platform":"tagvenue"}', '2026-03-07T12:00:00Z'),
('e013', 'b0000004-0000-0000-0000-000000000004', 'PARSED', NULL, '{"confidence":0.42,"status":"NEEDS_REVIEW"}', '2026-03-07T12:00:05Z'),
('e014', 'b0000005-0000-0000-0000-000000000005', 'RECEIVED', NULL, '{"source":"direct_website"}', '2026-03-07T06:00:00Z'),
('e015', 'b0000006-0000-0000-0000-000000000006', 'RECEIVED', NULL, '{"source":"email","platform":"peerspace"}', '2026-03-06T12:00:00Z'),
('e016', 'b0000006-0000-0000-0000-000000000006', 'APPROVED', '00000000-0000-0000-0000-000000000001', '{"from":"PENDING","to":"APPROVED"}', '2026-03-06T14:00:00Z'),
('e017', 'b0000006-0000-0000-0000-000000000006', 'PLATFORM_ACTIONED', '00000000-0000-0000-0000-000000000001', '{"actioned_at":"2026-03-06T15:00:00Z"}', '2026-03-06T15:00:00Z');
