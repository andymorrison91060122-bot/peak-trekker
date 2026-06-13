-- FU-46 close patch: restore owner profile avatar update permissions.
--
-- profiles uses column-level UPDATE grants so authenticated users cannot
-- self-promote admin/payment fields. Keep that model and explicitly grant
-- only user-editable profile columns.

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
