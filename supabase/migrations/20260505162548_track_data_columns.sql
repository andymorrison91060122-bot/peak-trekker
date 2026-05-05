-- N-Track-Persistence: persist track statistics and points on imported checkins
-- These nullable fields are used by track imports first, and can later support
-- realtime GPS sessions. Existing GPS/photo checkins remain valid with NULLs.

ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS distance_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS elevation_gain_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS elevation_loss_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS max_elevation_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS min_elevation_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS track_name TEXT,
  ADD COLUMN IF NOT EXISTS track_points JSONB;

COMMENT ON COLUMN public.checkins.track_points IS
  'JSONB array of track points [{lat,lng,ele?,time?}]. Used by track imports and GPS sessions.';
