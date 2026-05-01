-- N2-C: Transactional summit verification for server trek sessions
-- Refs:
--   docs/n2-a-trek-stability-audit.md P0-3 / P1-2
-- Scope:
--   - Prevent duplicate approved checkins for one server session
--   - Wrap checkin INSERT + trek_sessions UPDATE in one Postgres transaction
--   - Lock the trek_sessions row with SELECT ... FOR UPDATE during verification
-- Out of scope:
--   - local-trek-session / local-fallback-session behavior
--   - stats RPC transactionality (kept best-effort in application code)
--   - nearest mountain fallback behavior (handled in N2-C phase 2)

DO $$
DECLARE
  duplicate_session_id UUID;
BEGIN
  SELECT session_id
  INTO duplicate_session_id
  FROM public.checkins
  WHERE session_id IS NOT NULL
  GROUP BY session_id
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add unique checkins.session_id index; duplicate session_id found: %', duplicate_session_id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_session_id_unique_not_null
  ON public.checkins(session_id)
  WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.verify_and_record_checkin(
  p_session_id UUID,
  p_user_id UUID,
  p_mountain_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_note TEXT,
  p_verified_at TIMESTAMPTZ,
  p_verification_distance_m INTEGER,
  p_ranking_weight INTEGER
)
RETURNS TABLE(checkin_id UUID, duplicated BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  locked_session public.trek_sessions%ROWTYPE;
  existing_checkin_id UUID;
  inserted_checkin_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'verify_and_record_checkin unauthorized'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO locked_session
  FROM public.trek_sessions
  WHERE id = p_session_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trek session not found or forbidden'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id
  INTO existing_checkin_id
  FROM public.checkins
  WHERE session_id = p_session_id
    AND status = 'approved'
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_checkin_id IS NOT NULL THEN
    UPDATE public.trek_sessions
    SET
      mountain_id = COALESCE(p_mountain_id, locked_session.mountain_id),
      status = 'summit_verified',
      verify_state = 'verified',
      ended_at = COALESCE(ended_at, p_verified_at)
    WHERE id = p_session_id
      AND user_id = p_user_id;

    RETURN QUERY SELECT existing_checkin_id, TRUE;
    RETURN;
  END IF;

  INSERT INTO public.checkins (
    user_id,
    mountain_id,
    type,
    source,
    status,
    latitude,
    longitude,
    note,
    session_id,
    verified_at,
    verification_distance_m,
    ranking_weight
  )
  VALUES (
    p_user_id,
    p_mountain_id,
    'gps',
    'realtime_gps',
    'approved',
    p_latitude,
    p_longitude,
    p_note,
    p_session_id,
    p_verified_at,
    p_verification_distance_m,
    p_ranking_weight
  )
  RETURNING id INTO inserted_checkin_id;

  UPDATE public.trek_sessions
  SET
    mountain_id = p_mountain_id,
    status = 'summit_verified',
    verify_state = 'verified',
    ended_at = p_verified_at
  WHERE id = p_session_id
    AND user_id = p_user_id;

  RETURN QUERY SELECT inserted_checkin_id, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_and_record_checkin(
  UUID,
  UUID,
  UUID,
  NUMERIC,
  NUMERIC,
  TEXT,
  TIMESTAMPTZ,
  INTEGER,
  INTEGER
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.verify_and_record_checkin(
  UUID,
  UUID,
  UUID,
  NUMERIC,
  NUMERIC,
  TEXT,
  TIMESTAMPTZ,
  INTEGER,
  INTEGER
) TO authenticated;
