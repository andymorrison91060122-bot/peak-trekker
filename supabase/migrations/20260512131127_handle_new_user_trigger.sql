-- P0 Profiles trigger sync hardening
--
-- Purpose:
-- 1. Replace the existing public.handle_new_user() trigger function with the
--    Task A username/source rules.
-- 2. Recreate the auth.users insert trigger that syncs new auth users into
--    public.profiles.
-- 3. Harden the SECURITY DEFINER function with a fixed search_path and
--    restricted EXECUTE privileges.
--
-- Predecessor: 20260512123133_backfill_orphan_profiles.sql
-- Decision: T1, username = 'user_' || LEFT(id, 12), created_via = 'trigger'

BEGIN;

-- =========================================================================
-- Step 1: Create or replace the auth.users -> profiles sync function.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, created_via, created_at)
  VALUES (
    NEW.id,
    'user_' || LEFT(NEW.id::TEXT, 12),
    'trigger',
    NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- =========================================================================
-- Step 2: Restrict direct execution of this SECURITY DEFINER function.
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- =========================================================================
-- Step 3: Recreate the trigger on auth.users.
-- =========================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- Step 4: Verify function/trigger/security posture inside the transaction.
-- =========================================================================
DO $$
DECLARE
  trigger_enabled BOOLEAN;
  function_secure BOOLEAN;
  function_has_search_path BOOLEAN;
  unsafe_execute_grants INTEGER;
BEGIN
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
      AND setting LIKE 'search_path=%'
  ) INTO function_has_search_path;

  IF NOT function_has_search_path THEN
    RAISE EXCEPTION 'Function public.handle_new_user() does not have a fixed search_path';
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

  RAISE NOTICE 'public.handle_new_user() and on_auth_user_created verified successfully';
END $$;

COMMIT;
