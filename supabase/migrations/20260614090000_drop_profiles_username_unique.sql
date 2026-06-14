-- FU-90 Phase 2A M1: profiles.username becomes a display nickname, not a unique handle.
--
-- Rollback note: re-adding uniqueness is only lossless while duplicate username
-- count is still zero. Once duplicate nicknames are accepted in production, a
-- rollback must first resolve duplicates intentionally.

BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_key;

DROP INDEX IF EXISTS public.profiles_username_key;

COMMIT;
