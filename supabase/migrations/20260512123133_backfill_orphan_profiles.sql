-- P0 Profiles orphan backfill
--
-- Purpose:
-- 1. Add public.profiles.created_via for creation-source auditing.
-- 2. Backfill historical auth.users rows that do not have a matching profile.
-- 3. Prepare for Task B handle_new_user trigger rules without adding the trigger here.
--
-- Investigation: chore/profiles-fk-investigation
-- Decisions: D3 + U1 + F1 + T1
-- Expected production orphan count at investigation time: 1,226

BEGIN;

-- =========================================================================
-- Step 1: Add created_via audit column.
-- =========================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_via TEXT NOT NULL DEFAULT 'register';

UPDATE public.profiles
SET created_via = 'register'
WHERE created_via IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN created_via SET DEFAULT 'register',
  ALTER COLUMN created_via SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_created_via_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_created_via_check
      CHECK (created_via IN ('register', 'backfill', 'trigger', 'admin'));
  END IF;
END $$;

-- =========================================================================
-- Step 2: Pre-flight dry-run checks inside the transaction.
-- =========================================================================
DO $$
DECLARE
  orphan_count INTEGER;
  duplicate_candidate_count INTEGER;
  existing_username_collision_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u.id
  );

  SELECT COUNT(*) INTO duplicate_candidate_count
  FROM (
    SELECT 'user_' || LEFT(u.id::text, 12) AS username
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = u.id
    )
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) collisions;

  SELECT COUNT(*) INTO existing_username_collision_count
  FROM auth.users u
  JOIN public.profiles p
    ON p.username = 'user_' || LEFT(u.id::text, 12)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles existing_profile WHERE existing_profile.id = u.id
  );

  RAISE NOTICE 'Orphan users to backfill: %', orphan_count;
  RAISE NOTICE 'Duplicate generated username candidates: %', duplicate_candidate_count;
  RAISE NOTICE 'Generated username collisions with existing profiles: %', existing_username_collision_count;

  IF orphan_count = 0 THEN
    RAISE NOTICE 'No orphans found, skipping backfill.';
  ELSIF orphan_count > 1500 OR orphan_count < 1100 THEN
    RAISE EXCEPTION 'Unexpected orphan count: % (expected around 1226). Aborting for safety.', orphan_count;
  END IF;

  IF duplicate_candidate_count > 0 THEN
    RAISE EXCEPTION 'Generated username candidates are not unique. Aborting.';
  END IF;

  IF existing_username_collision_count > 0 THEN
    RAISE EXCEPTION 'Generated usernames collide with existing profiles. Aborting.';
  END IF;
END $$;

-- =========================================================================
-- Step 3: Backfill orphan users.
-- =========================================================================
INSERT INTO public.profiles (id, username, created_via, created_at)
SELECT
  u.id,
  'user_' || LEFT(u.id::text, 12) AS username,
  'backfill' AS created_via,
  u.created_at
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- Step 4: Post-verification. Any failure rolls back the whole transaction.
-- =========================================================================
DO $$
DECLARE
  remaining_orphan INTEGER;
  backfill_count INTEGER;
  duplicate_username_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_orphan
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u.id
  );

  SELECT COUNT(*) INTO backfill_count
  FROM public.profiles
  WHERE created_via = 'backfill';

  SELECT COUNT(*) INTO duplicate_username_count
  FROM (
    SELECT username
    FROM public.profiles
    GROUP BY username
    HAVING COUNT(*) > 1
  ) duplicates;

  RAISE NOTICE 'Remaining orphans after backfill: %', remaining_orphan;
  RAISE NOTICE 'Total backfill profiles: %', backfill_count;
  RAISE NOTICE 'Duplicate usernames after backfill: %', duplicate_username_count;

  IF remaining_orphan > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % orphans remaining. Aborting.', remaining_orphan;
  END IF;

  IF duplicate_username_count > 0 THEN
    RAISE EXCEPTION 'Duplicate usernames found after backfill. Aborting.';
  END IF;
END $$;

COMMIT;
