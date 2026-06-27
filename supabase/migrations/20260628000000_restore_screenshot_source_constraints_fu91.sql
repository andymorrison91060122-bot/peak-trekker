-- FU-91 Phase 2A proof candidate.
-- Restores live source-check semantics for screenshot recognition sources.
-- Do NOT apply this migration to production before FU-91 Phase 2B merge + Phase 2C explicit GO.

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_source_check;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_source_check
  CHECK (source IS NULL OR (source = ANY (ARRAY['realtime_gps'::text, 'historical_photo'::text, 'track_import'::text, 'screenshot_recognition'::text])));

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_source_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_source_type_check
  CHECK (source_type IS NULL OR (source_type = ANY (ARRAY['realtime_gps'::text, 'historical_photo'::text, 'track_import'::text, 'screenshot_recognition'::text])));

ALTER TABLE public.checkins_archive_20260513
  DROP CONSTRAINT IF EXISTS checkins_source_check;
ALTER TABLE public.checkins_archive_20260513
  ADD CONSTRAINT checkins_source_check
  CHECK (source IS NULL OR (source = ANY (ARRAY['realtime_gps'::text, 'historical_photo'::text, 'track_import'::text, 'screenshot_recognition'::text])));

ALTER TABLE public.posts_archive_20260513
  DROP CONSTRAINT IF EXISTS posts_source_type_check;
ALTER TABLE public.posts_archive_20260513
  ADD CONSTRAINT posts_source_type_check
  CHECK (source_type IS NULL OR (source_type = ANY (ARRAY['realtime_gps'::text, 'historical_photo'::text, 'track_import'::text, 'screenshot_recognition'::text])));
