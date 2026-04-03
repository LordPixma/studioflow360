-- Add calendar_event_id column to bookings table for Outlook Calendar integration
ALTER TABLE bookings ADD COLUMN calendar_event_id TEXT;
