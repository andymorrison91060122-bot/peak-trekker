-- FU-99: forward-fill measured fields for auto-summit GPS checkins.
-- Deploy-gated: do not apply to the shared production project without explicit
-- user approval and a clean remote migration/schema drift check.
-- This migration only replaces public.verify_and_record_checkin; it does not add
-- columns, change table RLS, or grant execution beyond authenticated.
-- SECURITY DEFINER safety: the function rejects missing/mismatched auth.uid(),
-- locks the caller-owned trek session by id + user_id before deriving values,
-- and every write is scoped to user_id = p_user_id so callers can only finalize
-- their own session/checkin.

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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  locked_session public.trek_sessions%ROWTYPE;
  existing_checkin_id UUID;
  existing_checkin_verified_at TIMESTAMPTZ;
  inserted_checkin_id UUID;
  session_duration_seconds INTEGER;
  session_end_time TIMESTAMPTZ;
  updated_count INTEGER;
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

  session_duration_seconds := CASE
    WHEN p_verified_at IS NOT NULL AND locked_session.started_at IS NOT NULL
      THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_verified_at - locked_session.started_at))))::INTEGER
    ELSE NULL
  END;
  session_end_time := COALESCE(locked_session.ended_at, p_verified_at);

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
        completion_status = 'complete',
        distance_meters = COALESCE(distance_meters, locked_session.distance_m),
        duration_seconds = COALESCE(duration_seconds, session_duration_seconds),
        elevation_gain_meters = COALESCE(elevation_gain_meters, locked_session.ascent_m),
        elevation_loss_meters = COALESCE(elevation_loss_meters, locked_session.descent_m),
        max_elevation_meters = COALESCE(max_elevation_meters, locked_session.max_altitude_m),
        start_time = COALESCE(start_time, locked_session.started_at),
        end_time = COALESCE(end_time, session_end_time),
        track_points = COALESCE(track_points, locked_session.track_points)
      WHERE id = existing_checkin_id
        AND user_id = p_user_id;

      GET DIAGNOSTICS updated_count = ROW_COUNT;
      IF updated_count <> 1 THEN
        RAISE EXCEPTION 'verify_and_record_checkin failed to update existing checkin'
          USING ERRCODE = 'P0002';
      END IF;
    END IF;

    UPDATE public.trek_sessions
    SET
      mountain_id = COALESCE(p_mountain_id, locked_session.mountain_id),
      status = 'summit_verified',
      verify_state = 'verified',
      ended_at = COALESCE(ended_at, p_verified_at)
    WHERE id = p_session_id
      AND user_id = p_user_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count <> 1 THEN
      RAISE EXCEPTION 'verify_and_record_checkin failed to update trek session'
        USING ERRCODE = 'P0002';
    END IF;

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
    completion_status,
    distance_meters,
    duration_seconds,
    elevation_gain_meters,
    elevation_loss_meters,
    max_elevation_meters,
    start_time,
    end_time,
    track_points
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
    'complete',
    locked_session.distance_m,
    session_duration_seconds,
    locked_session.ascent_m,
    locked_session.descent_m,
    locked_session.max_altitude_m,
    locked_session.started_at,
    session_end_time,
    locked_session.track_points
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

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN
    RAISE EXCEPTION 'verify_and_record_checkin failed to update trek session'
      USING ERRCODE = 'P0002';
  END IF;

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
) FROM PUBLIC, anon, service_role;

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
