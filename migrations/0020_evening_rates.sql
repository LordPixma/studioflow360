-- Add evening rate pricing to rooms
-- evening_hourly_rate: the rate that applies from evening_start_hour onwards
-- evening_start_hour: hour (0-23) when evening rate kicks in, default 18 (6pm)
ALTER TABLE rooms ADD COLUMN evening_hourly_rate REAL;
ALTER TABLE rooms ADD COLUMN evening_start_hour INTEGER NOT NULL DEFAULT 18;
