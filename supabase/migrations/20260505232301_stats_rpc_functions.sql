-- N-Stats-RPC: create stats functions referenced by trek/admin checkin flows.
-- Scope:
--   - Resolve missing RPC functions that caused PGRST202 and statsWarning.
--   - Keep existing stat semantics and parameter names used by supabase.rpc().
-- Out of scope:
--   - New statistics dimensions.
--   - Trek verification transaction logic.
--   - Frontend UI changes.

CREATE OR REPLACE FUNCTION public.increment_checkin_count(mid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF mid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.mountains
  SET checkin_count = COALESCE(checkin_count, 0) + 1
  WHERE id = mid;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_user_stats(uid UUID, alt INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    mountain_count = COALESCE(mountain_count, 0) + 1,
    total_altitude = GREATEST(COALESCE(total_altitude, 0), COALESCE(alt, 0))
  WHERE id = uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_province_score(pname TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(TRIM(COALESCE(pname, '')), '') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.province_stats
  SET score = COALESCE(score, 0) + 1
  WHERE province_name = pname;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_checkin_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_user_stats(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_province_score(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.increment_checkin_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_user_stats(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_province_score(TEXT) TO authenticated;
