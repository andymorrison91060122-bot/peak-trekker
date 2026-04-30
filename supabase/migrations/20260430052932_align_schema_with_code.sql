-- N1-A: Align schema with code, add admin guard support
-- Refs:
--   docs/n0-environment-audit.md (drift catalog)
--   docs/regression-debt.md P0 (admin guard + checkins UPDATE policy)
--   docs/map-weather-brief.md §12.1 (weather extension fields)
-- Scope:
--   - Add profiles.is_admin (canonical admin source for RLS, used by app code)
--   - Add posts.is_featured (B2-2 featured posts)
--   - Add mountains.weather_priority_tier / weather_enabled / weather_zone_id
--   - Add checkins UPDATE RLS policy (admin only, via profiles.is_admin)
--   - Harden profiles UPDATE privileges so users cannot self-promote is_admin
-- Out of scope:
--   - weather_cache table (deferred to N4)
--   - altitude/elevation rename (keeping altitude, code/docs updated separately in this batch)
--   - Marking real admin profiles is_admin=TRUE (deferred to N1-B production deployment)

-- 1. profiles.is_admin (canonical admin flag, referenced by app code via canAccessAdminTools)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
  ON public.profiles(is_admin)
  WHERE is_admin = TRUE;

-- Important maintenance note:
-- authenticated users intentionally receive column-level UPDATE grants on profiles
-- instead of table-wide UPDATE. This prevents self-promotion via is_admin.
-- When a future migration adds a user-editable profiles column, explicitly GRANT
-- UPDATE on that new column to authenticated; do not restore table-wide UPDATE.
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;
GRANT UPDATE (
  username,
  avatar_url,
  province,
  province_code,
  license_level,
  total_altitude,
  mountain_count,
  onboarding_version,
  onboarding_completed_at,
  community_status
) ON public.profiles TO authenticated;

-- 2. posts.is_featured (B2-2 featured posts on Mountain Detail)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

UPDATE public.posts
SET is_featured = FALSE
WHERE is_featured IS NULL;

ALTER TABLE public.posts
  ALTER COLUMN is_featured SET DEFAULT FALSE,
  ALTER COLUMN is_featured SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_is_featured
  ON public.posts(is_featured)
  WHERE is_featured = TRUE;

-- 3. mountains weather extension fields (per map-weather-brief §12.1)
ALTER TABLE public.mountains
  ADD COLUMN IF NOT EXISTS weather_priority_tier TEXT
    CHECK (weather_priority_tier IN ('S', 'A', 'B', 'C'))
    DEFAULT 'C';

ALTER TABLE public.mountains
  ADD COLUMN IF NOT EXISTS weather_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.mountains
  ADD COLUMN IF NOT EXISTS weather_zone_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mountains_weather_priority_tier
  ON public.mountains(weather_priority_tier)
  WHERE weather_enabled = TRUE;

-- 4. checkins UPDATE RLS policy (admin only, via profiles.is_admin)
DROP POLICY IF EXISTS checkins_update ON public.checkins;
CREATE POLICY checkins_update ON public.checkins
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = TRUE
    )
  );
