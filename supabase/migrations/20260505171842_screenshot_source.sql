-- N-Screenshot-OCR: allow screenshot recognition as an imported checkin/post source.
-- Scope:
--   - Adds `screenshot_recognition` to checkins.source.
--   - Adds `screenshot_recognition` to posts.source_type.
-- Out of scope:
--   - OCR storage.
--   - Trajectory image extraction.
--   - Frontend screenshot upload UI.

ALTER TABLE public.checkins DROP CONSTRAINT IF EXISTS checkins_source_check;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_source_check
  CHECK (
    source IS NULL
    OR source IN ('realtime_gps', 'historical_photo', 'track_import', 'screenshot_recognition')
  );

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_source_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_source_type_check
  CHECK (
    source_type IS NULL
    OR source_type IN ('realtime_gps', 'historical_photo', 'track_import', 'screenshot_recognition')
  );
