-- FU-1: prevent the same user from importing the same track content more than once.
-- Historical checkins are intentionally not backfilled; NULL values are ignored by
-- the partial unique index.

ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS track_content_hash TEXT;

COMMENT ON COLUMN public.checkins.track_content_hash IS
  'SHA-256 of normalized imported track points. Used to prevent duplicate track imports per user.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_user_track_content_hash_unique
  ON public.checkins(user_id, track_content_hash)
  WHERE track_content_hash IS NOT NULL;
