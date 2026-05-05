-- Fix Stats RPC permission denied on profiles
-- Root cause: monetization migration REVOKE'd UPDATE on profiles from authenticated
-- Solution: Change stats functions from SECURITY INVOKER to SECURITY DEFINER
-- These functions are simple increments called after verify_summit_checkin

CREATE OR REPLACE FUNCTION public.increment_checkin_count(mid UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF mid IS NULL THEN RETURN; END IF;
UPDATE public.mountains SET checkin_count = COALESCE(checkin_count, 0) + 1 WHERE id = mid; END; $$;

CREATE OR REPLACE FUNCTION public.increment_user_stats(uid UUID, alt INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF uid IS NULL THEN RETURN; END IF;
UPDATE public.profiles SET mountain_count = COALESCE(mountain_count, 0) + 1,
total_altitude = GREATEST(COALESCE(total_altitude, 0), COALESCE(alt, 0)) WHERE id = uid; END; $$;

CREATE OR REPLACE FUNCTION public.increment_province_score(pname TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF NULLIF(TRIM(COALESCE(pname, '')), '') IS NULL THEN RETURN; END IF;
UPDATE public.province_stats SET score = COALESCE(score, 0) + 1 WHERE province_name = pname; END; $$;
