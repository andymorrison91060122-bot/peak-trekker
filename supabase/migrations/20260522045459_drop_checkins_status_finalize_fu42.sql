-- FU-42 sub-sprint 4: finalize removal of checkins.status.
-- This migration is deploy-gated: apply only after the status-free app code is
-- live, because older production code still selects/writes checkins.status.

DROP POLICY IF EXISTS checkins_select ON public.checkins;

CREATE POLICY checkins_select ON public.checkins
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = TRUE
    )
  );

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
  existing_checkin_verified_at TIMESTAMPTZ;
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

  SELECT id, verified_at
  INTO existing_checkin_id, existing_checkin_verified_at
  FROM public.checkins
  WHERE session_id = p_session_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_checkin_id IS NOT NULL THEN
    IF existing_checkin_verified_at IS NULL THEN
      UPDATE public.checkins
      SET
        mountain_id = COALESCE(mountain_id, p_mountain_id),
        latitude = COALESCE(latitude, p_latitude),
        longitude = COALESCE(longitude, p_longitude),
        note = COALESCE(NULLIF(p_note, ''), note),
        verified_at = p_verified_at,
        verification_distance_m = p_verification_distance_m,
        ranking_weight = p_ranking_weight,
        completion_status = 'complete'
      WHERE id = existing_checkin_id
        AND user_id = p_user_id;
    END IF;

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
    latitude,
    longitude,
    note,
    session_id,
    verified_at,
    verification_distance_m,
    ranking_weight,
    completion_status
  )
  VALUES (
    p_user_id,
    p_mountain_id,
    'gps',
    'realtime_gps',
    p_latitude,
    p_longitude,
    p_note,
    p_session_id,
    p_verified_at,
    p_verification_distance_m,
    p_ranking_weight,
    'complete'
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

DROP INDEX IF EXISTS public.idx_checkins_status_source;
ALTER TABLE public.checkins DROP CONSTRAINT IF EXISTS checkins_status_check;
ALTER TABLE public.checkins DROP COLUMN IF EXISTS status;
