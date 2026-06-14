-- FU-93: atomic, idempotent trek point append.
-- This migration is deploy-gated. Do not apply until the matching app code has
-- been reviewed in the Draft PR and production push is explicitly approved.

CREATE OR REPLACE FUNCTION public.append_trek_points(
  p_session_id UUID,
  p_points JSONB
)
RETURNS TABLE(
  accepted_ids TEXT[],
  rejected_ids TEXT[],
  point_count INTEGER,
  distance_m INTEGER,
  ascent_m INTEGER,
  descent_m INTEGER,
  max_altitude_m INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  locked_session public.trek_sessions%ROWTYPE;
  raw_point JSONB;
  normalized_point JSONB;
  legacy_points JSONB[] := ARRAY[]::JSONB[];
  keyed_points JSONB[] := ARRAY[]::JSONB[];
  sorted_keyed_points JSONB[] := ARRAY[]::JSONB[];
  canonical_points JSONB[] := ARRAY[]::JSONB[];
  stored_points JSONB[] := ARRAY[]::JSONB[];
  seen_ids TEXT[] := ARRAY[]::TEXT[];
  incoming_ids TEXT[] := ARRAY[]::TEXT[];
  stored_ids TEXT[] := ARRAY[]::TEXT[];
  point_id TEXT;
  point_lat DOUBLE PRECISION;
  point_lng DOUBLE PRECISION;
  point_accuracy DOUBLE PRECISION;
  point_altitude DOUBLE PRECISION;
  point_ts DOUBLE PRECISION;
  point_capture_seq DOUBLE PRECISION;
  prev_point JSONB;
  prev_lat DOUBLE PRECISION;
  prev_lng DOUBLE PRECISION;
  prev_altitude DOUBLE PRECISION;
  prev_ts DOUBLE PRECISION;
  d_lat DOUBLE PRECISION;
  d_lng DOUBLE PRECISION;
  hav_a DOUBLE PRECISION;
  segment_m DOUBLE PRECISION;
  elapsed_seconds DOUBLE PRECISION;
  speed_mps DOUBLE PRECISION;
  delta_altitude DOUBLE PRECISION;
  total_distance_m DOUBLE PRECISION := 0;
  total_ascent_m INTEGER := 0;
  total_descent_m INTEGER := 0;
  next_max_altitude_m INTEGER := NULL;
  existing_count INTEGER := 0;
  batch_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'append_trek_points unauthorized' USING ERRCODE = '42501';
  END IF;

  accepted_ids := ARRAY[]::TEXT[];
  rejected_ids := ARRAY[]::TEXT[];

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'p_session_id required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_points) <> 'array' THEN
    RAISE EXCEPTION 'p_points must be an array' USING ERRCODE = '22023';
  END IF;

  batch_count := jsonb_array_length(p_points);
  IF batch_count > 500 THEN
    RAISE EXCEPTION 'append_trek_points batch too large' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO locked_session
  FROM public.trek_sessions
  WHERE trek_sessions.id = p_session_id
    AND trek_sessions.user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trek session not found or forbidden' USING ERRCODE = 'P0002';
  END IF;

  IF locked_session.status <> 'tracking' THEN
    RAISE EXCEPTION 'session is not tracking' USING ERRCODE = '25000';
  END IF;

  FOR raw_point IN
    SELECT value FROM jsonb_array_elements(COALESCE(locked_session.track_points, '[]'::JSONB))
  LOOP
    IF jsonb_typeof(raw_point) <> 'object' THEN
      CONTINUE;
    END IF;

    point_lat := (raw_point ->> 'lat')::DOUBLE PRECISION;
    point_lng := (raw_point ->> 'lng')::DOUBLE PRECISION;
    point_accuracy := (raw_point ->> 'accuracy')::DOUBLE PRECISION;
    point_ts := (raw_point ->> 'ts')::DOUBLE PRECISION;
    point_altitude := NULL;
    point_capture_seq := NULL;
    point_id := NULLIF(BTRIM(raw_point ->> 'id'), '');

    IF raw_point ? 'altitude' AND raw_point ->> 'altitude' IS NOT NULL THEN
      point_altitude := (raw_point ->> 'altitude')::DOUBLE PRECISION;
    END IF;
    IF raw_point ? 'captureSeq' AND raw_point ->> 'captureSeq' IS NOT NULL THEN
      point_capture_seq := (raw_point ->> 'captureSeq')::DOUBLE PRECISION;
    END IF;

    IF point_lat < -90 OR point_lat > 90 OR point_lng < -180 OR point_lng > 180 THEN
      CONTINUE;
    END IF;

    normalized_point := jsonb_build_object(
      'lat', point_lat,
      'lng', point_lng,
      'accuracy', point_accuracy,
      'altitude', point_altitude,
      'ts', point_ts
    );

    IF point_id IS NOT NULL AND point_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      normalized_point := normalized_point || jsonb_build_object('id', point_id);
      IF point_capture_seq IS NOT NULL THEN
        normalized_point := normalized_point || jsonb_build_object('captureSeq', point_capture_seq);
      END IF;
      keyed_points := array_append(keyed_points, normalized_point);
    ELSE
      legacy_points := array_append(legacy_points, normalized_point);
    END IF;
  END LOOP;

  existing_count := COALESCE(array_length(legacy_points, 1), 0) + COALESCE(array_length(keyed_points, 1), 0);
  IF existing_count + batch_count > 20000 THEN
    RAISE EXCEPTION 'trek session track point cap exceeded' USING ERRCODE = '54000';
  END IF;

  FOR raw_point IN SELECT value FROM jsonb_array_elements(p_points)
  LOOP
    IF jsonb_typeof(raw_point) <> 'object' THEN
      RAISE EXCEPTION 'invalid point payload' USING ERRCODE = '22023';
    END IF;

    point_id := NULLIF(BTRIM(raw_point ->> 'id'), '');
    point_lat := (raw_point ->> 'lat')::DOUBLE PRECISION;
    point_lng := (raw_point ->> 'lng')::DOUBLE PRECISION;
    point_accuracy := (raw_point ->> 'accuracy')::DOUBLE PRECISION;
    point_ts := (raw_point ->> 'ts')::DOUBLE PRECISION;
    point_capture_seq := (raw_point ->> 'captureSeq')::DOUBLE PRECISION;
    point_altitude := NULL;

    IF raw_point ? 'altitude' AND raw_point ->> 'altitude' IS NOT NULL THEN
      point_altitude := (raw_point ->> 'altitude')::DOUBLE PRECISION;
    END IF;

    IF point_id IS NULL OR point_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid point id' USING ERRCODE = '22023';
    END IF;
    IF point_lat < -90 OR point_lat > 90 OR point_lng < -180 OR point_lng > 180 THEN
      RAISE EXCEPTION 'invalid point coordinates' USING ERRCODE = '22023';
    END IF;
    IF point_accuracy < 0 OR point_accuracy > 10000 THEN
      RAISE EXCEPTION 'invalid point accuracy' USING ERRCODE = '22023';
    END IF;
    IF point_ts < 0 OR point_ts > 4102444800000 THEN
      RAISE EXCEPTION 'invalid point timestamp' USING ERRCODE = '22023';
    END IF;
    IF point_capture_seq < 0 OR point_capture_seq > 9007199254740991 THEN
      RAISE EXCEPTION 'invalid point captureSeq' USING ERRCODE = '22023';
    END IF;
    IF point_altitude IS NOT NULL AND (point_altitude < -1000 OR point_altitude > 10000) THEN
      RAISE EXCEPTION 'invalid point altitude' USING ERRCODE = '22023';
    END IF;

    IF NOT point_id = ANY(incoming_ids) THEN
      incoming_ids := array_append(incoming_ids, point_id);
    END IF;

    keyed_points := array_append(
      keyed_points,
      jsonb_build_object(
        'id', point_id,
        'lat', point_lat,
        'lng', point_lng,
        'accuracy', point_accuracy,
        'altitude', point_altitude,
        'ts', point_ts,
        'captureSeq', point_capture_seq
      )
    );
  END LOOP;

  SELECT COALESCE(array_agg(point ORDER BY (point ->> 'ts')::DOUBLE PRECISION, COALESCE((point ->> 'captureSeq')::DOUBLE PRECISION, 9007199254740991), point ->> 'id'), ARRAY[]::JSONB[])
  INTO sorted_keyed_points
  FROM unnest(keyed_points) AS point;

  FOREACH raw_point IN ARRAY sorted_keyed_points LOOP
    point_id := raw_point ->> 'id';
    IF point_id IS NULL OR point_id = ANY(seen_ids) THEN
      CONTINUE;
    END IF;
    seen_ids := array_append(seen_ids, point_id);
    canonical_points := array_append(canonical_points, raw_point);
  END LOOP;

  canonical_points := legacy_points || canonical_points;

  FOREACH raw_point IN ARRAY canonical_points LOOP
    point_id := raw_point ->> 'id';
    prev_point := stored_points[array_length(stored_points, 1)];

    IF point_id = ANY(incoming_ids) AND prev_point IS NOT NULL THEN
      prev_lat := (prev_point ->> 'lat')::DOUBLE PRECISION;
      prev_lng := (prev_point ->> 'lng')::DOUBLE PRECISION;
      prev_ts := (prev_point ->> 'ts')::DOUBLE PRECISION;
      point_lat := (raw_point ->> 'lat')::DOUBLE PRECISION;
      point_lng := (raw_point ->> 'lng')::DOUBLE PRECISION;
      point_accuracy := (raw_point ->> 'accuracy')::DOUBLE PRECISION;
      point_ts := (raw_point ->> 'ts')::DOUBLE PRECISION;

      d_lat := radians(point_lat - prev_lat);
      d_lng := radians(point_lng - prev_lng);
      hav_a := sin(d_lat / 2) * sin(d_lat / 2)
        + cos(radians(prev_lat)) * cos(radians(point_lat)) * sin(d_lng / 2) * sin(d_lng / 2);
      segment_m := 6371000 * 2 * atan2(sqrt(hav_a), sqrt(greatest(0, 1 - hav_a)));
      elapsed_seconds := greatest(1, (point_ts - prev_ts) / 1000);
      speed_mps := segment_m / elapsed_seconds;

      IF speed_mps > 9.5 AND point_accuracy > 25 THEN
        rejected_ids := array_append(rejected_ids, point_id);
        CONTINUE;
      END IF;
    END IF;

    stored_points := array_append(stored_points, raw_point);
    IF point_id IS NOT NULL THEN
      stored_ids := array_append(stored_ids, point_id);
    END IF;
  END LOOP;

  IF COALESCE(array_length(stored_points, 1), 0) > 20000 THEN
    RAISE EXCEPTION 'trek session track point cap exceeded' USING ERRCODE = '54000';
  END IF;

  prev_point := NULL;
  FOREACH raw_point IN ARRAY stored_points LOOP
    point_altitude := NULL;
    IF raw_point ? 'altitude' AND raw_point ->> 'altitude' IS NOT NULL THEN
      point_altitude := (raw_point ->> 'altitude')::DOUBLE PRECISION;
      next_max_altitude_m := greatest(COALESCE(next_max_altitude_m, round(point_altitude)::INTEGER), round(point_altitude)::INTEGER);
    END IF;

    IF prev_point IS NULL THEN
      prev_point := raw_point;
      CONTINUE;
    END IF;

    prev_lat := (prev_point ->> 'lat')::DOUBLE PRECISION;
    prev_lng := (prev_point ->> 'lng')::DOUBLE PRECISION;
    point_lat := (raw_point ->> 'lat')::DOUBLE PRECISION;
    point_lng := (raw_point ->> 'lng')::DOUBLE PRECISION;
    d_lat := radians(point_lat - prev_lat);
    d_lng := radians(point_lng - prev_lng);
    hav_a := sin(d_lat / 2) * sin(d_lat / 2)
      + cos(radians(prev_lat)) * cos(radians(point_lat)) * sin(d_lng / 2) * sin(d_lng / 2);
    total_distance_m := total_distance_m + (6371000 * 2 * atan2(sqrt(hav_a), sqrt(greatest(0, 1 - hav_a))));

    IF prev_point ? 'altitude'
      AND prev_point ->> 'altitude' IS NOT NULL
      AND raw_point ? 'altitude'
      AND raw_point ->> 'altitude' IS NOT NULL
    THEN
      prev_altitude := (prev_point ->> 'altitude')::DOUBLE PRECISION;
      point_altitude := (raw_point ->> 'altitude')::DOUBLE PRECISION;
      delta_altitude := point_altitude - prev_altitude;
      IF delta_altitude > 0 THEN
        total_ascent_m := total_ascent_m + round(delta_altitude)::INTEGER;
      ELSIF delta_altitude < 0 THEN
        total_descent_m := total_descent_m + round(abs(delta_altitude))::INTEGER;
      END IF;
    END IF;

    prev_point := raw_point;
  END LOOP;

  FOREACH point_id IN ARRAY incoming_ids LOOP
    IF point_id = ANY(stored_ids) AND NOT point_id = ANY(accepted_ids) THEN
      accepted_ids := array_append(accepted_ids, point_id);
    END IF;
  END LOOP;

  point_count := COALESCE(array_length(stored_points, 1), 0);
  distance_m := round(total_distance_m)::INTEGER;
  ascent_m := total_ascent_m;
  descent_m := total_descent_m;
  max_altitude_m := next_max_altitude_m;

  UPDATE public.trek_sessions
  SET
    track_points = COALESCE((SELECT jsonb_agg(point) FROM unnest(stored_points) AS point), '[]'::JSONB),
    track_summary = jsonb_build_object(
      'distance_m', round(total_distance_m)::INTEGER,
      'ascent_m', total_ascent_m,
      'descent_m', total_descent_m,
      'max_altitude_m', next_max_altitude_m,
      'point_count', COALESCE(array_length(stored_points, 1), 0)
    ),
    distance_m = round(total_distance_m)::INTEGER,
    ascent_m = total_ascent_m,
    descent_m = total_descent_m,
    max_altitude_m = next_max_altitude_m
  WHERE id = p_session_id
    AND user_id = auth.uid();

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.append_trek_points(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_trek_points(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_trek_points(UUID, JSONB) TO service_role;

DO $$
DECLARE
  config_value TEXT;
  definer_enabled BOOLEAN;
BEGIN
  SELECT prosecdef, COALESCE(array_to_string(proconfig, ','), '')
  INTO definer_enabled, config_value
  FROM pg_proc
  WHERE oid = 'public.append_trek_points(uuid,jsonb)'::regprocedure;

  IF definer_enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'append_trek_points must be SECURITY DEFINER';
  END IF;

  IF config_value NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'append_trek_points must set search_path';
  END IF;
END;
$$;
