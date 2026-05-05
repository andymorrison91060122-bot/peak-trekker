-- N-GPX-Import: minimal schema support for imported track checkins
-- Scope:
--   - Allow `track_import` as a checkin/post source label.
--   - Allow checkins without a mountain when the user skips mountain matching.
-- Out of scope:
--   - Persisting parsed track statistics or full track points.
--   - Frontend import UI.

ALTER TABLE public.checkins DROP CONSTRAINT IF EXISTS checkins_source_check;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_source_check
  CHECK (source IS NULL OR source IN ('realtime_gps', 'historical_photo', 'track_import'));

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_source_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_source_type_check
  CHECK (source_type IS NULL OR source_type IN ('realtime_gps', 'historical_photo', 'track_import'));

ALTER TABLE public.checkins
  ALTER COLUMN mountain_id DROP NOT NULL;
