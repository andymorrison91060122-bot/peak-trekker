-- FU-90 Phase 2A M2: hydrate profiles from signup metadata in the auth trigger.
--
-- M1 in the same release removes profiles.username uniqueness before this trigger
-- can persist duplicate display nicknames.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_nickname(value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  raw_value TEXT := COALESCE(value, '');
  normalized TEXT := BTRIM(COALESCE(value, ''));
BEGIN
  IF raw_value ~ '[[:cntrl:]]' THEN
    RETURN NULL;
  END IF;

  IF normalized = '' THEN
    RETURN NULL;
  END IF;

  IF char_length(normalized) < 2 OR char_length(normalized) > 12 THEN
    RETURN NULL;
  END IF;

  IF normalized !~ '^[A-Za-z0-9 _一-鿿㐀-䶿豈-﫿-]+$' THEN
    RETURN NULL;
  END IF;

  RETURN normalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  metadata_nickname TEXT := public.validate_nickname(NEW.raw_user_meta_data ->> 'nickname');
  metadata_province TEXT := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'province', '')), '');
  metadata_province_code TEXT := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'province_code', '')), '');
  profile_username TEXT := COALESCE(metadata_nickname, 'user_' || LEFT(NEW.id::TEXT, 12));
  profile_province TEXT := NULL;
  profile_province_code TEXT := NULL;
BEGIN
  IF metadata_province IS NOT NULL
    AND char_length(metadata_province) <= 20
    AND metadata_province_code IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.province_stats
      WHERE province_code = metadata_province_code
    )
  THEN
    profile_province := metadata_province;
    profile_province_code := metadata_province_code;
  END IF;

  INSERT INTO public.profiles (
    id,
    username,
    province,
    province_code,
    created_via,
    created_at
  )
  VALUES (
    NEW.id,
    profile_username,
    profile_province,
    profile_province_code,
    'trigger',
    NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DO $$
DECLARE
  trigger_enabled BOOLEAN;
  function_secure BOOLEAN;
  function_has_empty_search_path BOOLEAN;
  unsafe_execute_grants INTEGER;
BEGIN
  IF public.validate_nickname('山友') <> '山友' THEN
    RAISE EXCEPTION 'validate_nickname rejected a 2-char CJK nickname';
  END IF;

  IF public.validate_nickname('一二三四五六七八九十甲乙') <> '一二三四五六七八九十甲乙' THEN
    RAISE EXCEPTION 'validate_nickname rejected a 12-char CJK nickname';
  END IF;

  IF public.validate_nickname('㐀㐁') <> '㐀㐁' THEN
    RAISE EXCEPTION 'validate_nickname rejected CJK Extension A';
  END IF;

  IF public.validate_nickname('豈﫿') <> '豈﫿' THEN
    RAISE EXCEPTION 'validate_nickname rejected CJK compatibility range';
  END IF;

  IF public.validate_nickname('山友😀') IS NOT NULL THEN
    RAISE EXCEPTION 'validate_nickname accepted emoji';
  END IF;

  IF public.validate_nickname(E'山\n友') IS NOT NULL THEN
    RAISE EXCEPTION 'validate_nickname accepted newline';
  END IF;

  IF public.validate_nickname(E'山\t友') IS NOT NULL THEN
    RAISE EXCEPTION 'validate_nickname accepted control character';
  END IF;

  IF public.validate_nickname('山友!') IS NOT NULL THEN
    RAISE EXCEPTION 'validate_nickname accepted punctuation';
  END IF;

  IF public.validate_nickname('一二三四五六七八九十甲乙丙') IS NOT NULL THEN
    RAISE EXCEPTION 'validate_nickname accepted overlength nickname';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.province_stats WHERE province_code = 'ZJ') THEN
    RAISE EXCEPTION 'province_stats is missing valid province code ZJ';
  END IF;

  IF EXISTS (SELECT 1 FROM public.province_stats WHERE province_code = 'BAD') THEN
    RAISE EXCEPTION 'province_stats unexpectedly accepted invalid province code BAD';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
      AND t.tgenabled = 'O'
      AND NOT t.tgisinternal
  ) INTO trigger_enabled;

  IF NOT trigger_enabled THEN
    RAISE EXCEPTION 'Trigger on_auth_user_created was not created or is not enabled';
  END IF;

  SELECT p.prosecdef INTO function_secure
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

  IF NOT function_secure THEN
    RAISE EXCEPTION 'Function public.handle_new_user() is not SECURITY DEFINER';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    CROSS JOIN LATERAL unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) AS setting
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_new_user'
      AND replace(setting, '"', '') = 'search_path='
  ) INTO function_has_empty_search_path;

  IF NOT function_has_empty_search_path THEN
    RAISE EXCEPTION 'Function public.handle_new_user() does not have empty search_path';
  END IF;

  SELECT COUNT(*) INTO unsafe_execute_grants
  FROM information_schema.routine_privileges
  WHERE specific_schema = 'public'
    AND routine_name = 'handle_new_user'
    AND privilege_type = 'EXECUTE'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');

  IF unsafe_execute_grants > 0 THEN
    RAISE EXCEPTION 'Unsafe EXECUTE grants remain on public.handle_new_user(): %', unsafe_execute_grants;
  END IF;

  RAISE NOTICE 'FU-90 profile metadata trigger verified successfully';
END $$;

COMMIT;
