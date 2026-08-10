-- QUOTA-001: qualification is checked before OCR; quota is consumed only by
-- the screenshot-specific archive finalization transaction. A new request
-- supersedes every older unfinished recognition for the same user.

BEGIN;

ALTER TABLE public.screenshot_quota_attempts
  ADD COLUMN IF NOT EXISTS checkin_id UUID;

ALTER TABLE public.screenshot_quota_attempts
  DROP CONSTRAINT IF EXISTS screenshot_quota_attempts_status_check;

ALTER TABLE public.screenshot_quota_attempts
  ADD CONSTRAINT screenshot_quota_attempts_status_check
    CHECK (status IN ('reserved', 'recognized', 'consumed', 'refunded', 'expired'));

CREATE OR REPLACE FUNCTION public.reserve_screenshot_recognition_lease(
  p_user_id UUID,
  p_month_key TEXT,
  p_free_limit INTEGER,
  p_paid_limit INTEGER,
  p_request_id TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  reason TEXT,
  request_id TEXT,
  bucket TEXT,
  free_used INTEGER,
  paid_used INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  locked_row public.screenshot_quota%ROWTYPE;
  existing_attempt public.screenshot_quota_attempts%ROWTYPE;
  chosen_bucket TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required' USING ERRCODE = '22023';
  END IF;

  IF p_request_id IS NULL
    OR p_request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid p_request_id' USING ERRCODE = '22023';
  END IF;

  IF p_month_key IS NULL OR p_month_key !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'invalid p_month_key' USING ERRCODE = '22023';
  END IF;

  IF p_free_limit < 0 OR p_paid_limit < 0 THEN
    RAISE EXCEPTION 'quota limits must be non-negative' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.screenshot_quota (user_id, month_key)
  VALUES (p_user_id, p_month_key)
  ON CONFLICT (user_id, month_key) DO NOTHING;

  SELECT q.*
  INTO locked_row
  FROM public.screenshot_quota AS q
  WHERE q.user_id = p_user_id
    AND q.month_key = p_month_key
  FOR UPDATE;

  -- Expired recognition payloads are cleanup-only. They do not change attempt
  -- status, start eligibility, or screenshot finalization semantics.
  UPDATE public.screenshot_quota_attempts AS a
  SET recognition_result = NULL,
      recognition_result_bytes = NULL,
      result_expires_at = NULL
  WHERE a.user_id = p_user_id
    AND a.result_expires_at IS NOT NULL
    AND a.result_expires_at <= now();

  SELECT a.*
  INTO existing_attempt
  FROM public.screenshot_quota_attempts AS a
  WHERE a.user_id = p_user_id
    AND a.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    success := FALSE;
    reason := 'existing';
    request_id := p_request_id;
    bucket := existing_attempt.bucket;
    free_used := locked_row.free_used;
    paid_used := locked_row.paid_used;
    RETURN NEXT;
    RETURN;
  END IF;

  IF locked_row.free_used >= p_free_limit
    AND locked_row.paid_used >= p_paid_limit THEN
    success := FALSE;
    reason := 'exhausted';
    request_id := p_request_id;
    bucket := NULL;
    free_used := locked_row.free_used;
    paid_used := locked_row.paid_used;
    RETURN NEXT;
    RETURN;
  END IF;

  chosen_bucket := CASE
    WHEN locked_row.free_used < p_free_limit THEN 'free'
    ELSE 'paid'
  END;

  -- New recognition wins. Once this update commits, older tabs can no longer finalize.
  UPDATE public.screenshot_quota_attempts AS a
  SET status = 'expired',
      recognition_result = NULL,
      recognition_result_bytes = NULL,
      result_expires_at = NULL
  WHERE a.user_id = p_user_id
    AND a.request_id <> p_request_id
    AND a.status IN ('reserved', 'recognized');

  INSERT INTO public.screenshot_quota_attempts (
    request_id,
    user_id,
    month_key,
    bucket,
    status
  ) VALUES (
    p_request_id,
    p_user_id,
    p_month_key,
    chosen_bucket,
    'reserved'
  );

  success := TRUE;
  reason := NULL;
  request_id := p_request_id;
  bucket := chosen_bucket;
  free_used := locked_row.free_used;
  paid_used := locked_row.paid_used;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_screenshot_recognition_attempt(
  p_user_id UUID,
  p_request_id TEXT,
  p_recognition_result JSONB
)
RETURNS TABLE(
  success BOOLEAN,
  reason TEXT,
  request_id TEXT,
  bucket TEXT,
  free_used INTEGER,
  paid_used INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  attempt_row public.screenshot_quota_attempts%ROWTYPE;
  result_bytes INTEGER;
BEGIN
  IF p_user_id IS NULL
    OR p_request_id IS NULL
    OR p_request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid recognition attempt' USING ERRCODE = '22023';
  END IF;

  IF p_recognition_result IS NULL
    OR jsonb_typeof(p_recognition_result) <> 'object'
    OR NOT (p_recognition_result ? 'ocrSource')
    OR NOT (p_recognition_result ? 'ocrResult')
    OR NOT (p_recognition_result ? 'parsedFields') THEN
    RAISE EXCEPTION 'invalid recognition result' USING ERRCODE = '22023';
  END IF;

  result_bytes := octet_length(convert_to(p_recognition_result::TEXT, 'UTF8'));
  IF result_bytes > 65536 THEN
    RAISE EXCEPTION 'recognition result exceeds 65536 bytes' USING ERRCODE = '22023';
  END IF;

  SELECT a.*
  INTO attempt_row
  FROM public.screenshot_quota_attempts AS a
  WHERE a.user_id = p_user_id
    AND a.request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    success := FALSE;
    reason := 'not_found';
    request_id := p_request_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF attempt_row.status = 'recognized'
    AND attempt_row.recognition_result IS NOT NULL THEN
    success := TRUE;
    reason := 'already_recognized';
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    SELECT q.free_used, q.paid_used
    INTO free_used, paid_used
    FROM public.screenshot_quota AS q
    WHERE q.user_id = p_user_id
      AND q.month_key = attempt_row.month_key;
    RETURN NEXT;
    RETURN;
  END IF;

  IF attempt_row.status <> 'reserved' THEN
    success := FALSE;
    reason := 'not_reserved';
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.screenshot_quota_attempts AS a
  SET status = 'recognized',
      recognition_result = p_recognition_result,
      recognition_result_bytes = result_bytes,
      result_expires_at = date_trunc('month', now()) + INTERVAL '1 month'
  WHERE a.id = attempt_row.id;

  SELECT q.free_used, q.paid_used
  INTO free_used, paid_used
  FROM public.screenshot_quota AS q
  WHERE q.user_id = p_user_id
    AND q.month_key = attempt_row.month_key;

  success := TRUE;
  reason := NULL;
  request_id := p_request_id;
  bucket := attempt_row.bucket;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_screenshot_recognition_lease(
  p_user_id UUID,
  p_request_id TEXT
)
RETURNS TABLE(success BOOLEAN, reason TEXT, request_id TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  attempt_row public.screenshot_quota_attempts%ROWTYPE;
BEGIN
  SELECT a.*
  INTO attempt_row
  FROM public.screenshot_quota_attempts AS a
  WHERE a.user_id = p_user_id
    AND a.request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    success := FALSE;
    reason := 'not_found';
  ELSIF attempt_row.status IN ('reserved', 'recognized') THEN
    UPDATE public.screenshot_quota_attempts
    SET status = 'expired',
        recognition_result = NULL,
        recognition_result_bytes = NULL,
        result_expires_at = NULL
    WHERE id = attempt_row.id;
    success := TRUE;
    reason := NULL;
  ELSE
    success := TRUE;
    reason := 'already_released';
  END IF;

  request_id := p_request_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_screenshot_recognition_replay(
  p_request_id TEXT
)
RETURNS TABLE(found BOOLEAN, status TEXT, recognition_result JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attempt_row public.screenshot_quota_attempts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
    OR p_request_id IS NULL
    OR p_request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    found := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT a.*
  INTO attempt_row
  FROM public.screenshot_quota_attempts AS a
  WHERE a.user_id = auth.uid()
    AND a.request_id = p_request_id;

  IF NOT FOUND THEN
    found := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  found := TRUE;
  status := attempt_row.status;
  recognition_result := CASE
    WHEN attempt_row.status IN ('recognized', 'consumed')
      THEN attempt_row.recognition_result
    ELSE NULL
  END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_screenshot_recognition(
  p_user_id UUID,
  p_month_key TEXT,
  p_free_limit INTEGER,
  p_paid_limit INTEGER,
  p_request_id TEXT,
  p_checkin_payload JSONB
)
RETURNS TABLE(
  success BOOLEAN,
  reason TEXT,
  request_id TEXT,
  bucket TEXT,
  checkin_id UUID,
  free_used INTEGER,
  paid_used INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  attempt_row public.screenshot_quota_attempts%ROWTYPE;
  locked_row public.screenshot_quota%ROWTYPE;
  new_checkin_id UUID;
  chosen_bucket TEXT;
BEGIN
  IF p_user_id IS NULL
    OR p_month_key IS NULL
    OR p_month_key !~ '^[0-9]{4}-[0-9]{2}$'
    OR p_request_id IS NULL
    OR p_request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid screenshot finalization request' USING ERRCODE = '22023';
  END IF;

  IF p_free_limit < 0 OR p_paid_limit < 0
    OR p_checkin_payload IS NULL
    OR jsonb_typeof(p_checkin_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid screenshot finalization payload' USING ERRCODE = '22023';
  END IF;

  -- Finalization follows the same quota-first lock order as reservation.
  SELECT q.*
  INTO locked_row
  FROM public.screenshot_quota AS q
  WHERE q.user_id = p_user_id
    AND q.month_key = p_month_key
  FOR UPDATE;

  SELECT a.*
  INTO attempt_row
  FROM public.screenshot_quota_attempts AS a
  WHERE a.user_id = p_user_id
    AND a.request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    success := FALSE;
    reason := 'not_found';
    request_id := p_request_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF attempt_row.status = 'consumed' THEN
    SELECT q.free_used, q.paid_used
    INTO free_used, paid_used
    FROM public.screenshot_quota AS q
    WHERE q.user_id = p_user_id
      AND q.month_key = p_month_key;
    IF attempt_row.checkin_id IS NULL THEN
      success := FALSE;
      reason := 'legacy_consumed';
    ELSE
      success := TRUE;
      reason := 'already_finalized';
      checkin_id := attempt_row.checkin_id;
    END IF;
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    RETURN NEXT;
    RETURN;
  END IF;

  IF attempt_row.status = 'reserved' THEN
    success := FALSE;
    reason := 'pending';
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    RETURN NEXT;
    RETURN;
  END IF;

  IF attempt_row.status = 'expired' THEN
    success := FALSE;
    reason := 'expired';
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    RETURN NEXT;
    RETURN;
  END IF;

  IF attempt_row.status <> 'recognized'
    OR attempt_row.recognition_result IS NULL THEN
    success := FALSE;
    reason := 'not_ready';
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    RETURN NEXT;
    RETURN;
  END IF;

  IF locked_row.free_used < p_free_limit THEN
    chosen_bucket := 'free';
    UPDATE public.screenshot_quota AS q
    SET free_used = q.free_used + 1, updated_at = now()
    WHERE q.id = locked_row.id
    RETURNING q.free_used, q.paid_used INTO free_used, paid_used;
  ELSIF locked_row.paid_used < p_paid_limit THEN
    chosen_bucket := 'paid';
    UPDATE public.screenshot_quota AS q
    SET paid_used = q.paid_used + 1, updated_at = now()
    WHERE q.id = locked_row.id
    RETURNING q.free_used, q.paid_used INTO free_used, paid_used;
  ELSE
    success := FALSE;
    reason := 'exhausted';
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    free_used := locked_row.free_used;
    paid_used := locked_row.paid_used;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.checkins (
    user_id,
    mountain_id,
    type,
    source,
    completion_status,
    latitude,
    longitude,
    note,
    verified_at,
    verification_distance_m,
    ranking_weight,
    distance_meters,
    duration_seconds,
    elevation_gain_meters,
    elevation_loss_meters,
    max_elevation_meters,
    min_elevation_meters,
    start_time,
    end_time,
    track_name,
    track_points,
    screenshot_route_shape
  ) VALUES (
    p_user_id,
    NULLIF(p_checkin_payload->>'mountain_id', '')::UUID,
    COALESCE(NULLIF(p_checkin_payload->>'type', ''), 'gps'),
    COALESCE(NULLIF(p_checkin_payload->>'source', ''), 'screenshot_recognition'),
    COALESCE(NULLIF(p_checkin_payload->>'completion_status', ''), 'complete'),
    NULLIF(p_checkin_payload->>'latitude', '')::DOUBLE PRECISION,
    NULLIF(p_checkin_payload->>'longitude', '')::DOUBLE PRECISION,
    COALESCE(p_checkin_payload->>'note', ''),
    NULLIF(p_checkin_payload->>'verified_at', '')::TIMESTAMPTZ,
    NULLIF(p_checkin_payload->>'verification_distance_m', '')::DOUBLE PRECISION,
    COALESCE(NULLIF(p_checkin_payload->>'ranking_weight', '')::DOUBLE PRECISION, 0),
    NULLIF(p_checkin_payload->>'distance_meters', '')::DOUBLE PRECISION,
    NULLIF(p_checkin_payload->>'duration_seconds', '')::INTEGER,
    NULLIF(p_checkin_payload->>'elevation_gain_meters', '')::DOUBLE PRECISION,
    NULLIF(p_checkin_payload->>'elevation_loss_meters', '')::DOUBLE PRECISION,
    NULLIF(p_checkin_payload->>'max_elevation_meters', '')::DOUBLE PRECISION,
    NULLIF(p_checkin_payload->>'min_elevation_meters', '')::DOUBLE PRECISION,
    NULLIF(p_checkin_payload->>'start_time', '')::TIMESTAMPTZ,
    NULLIF(p_checkin_payload->>'end_time', '')::TIMESTAMPTZ,
    COALESCE(NULLIF(p_checkin_payload->>'track_name', ''), '截图识别活动'),
    COALESCE(p_checkin_payload->'track_points', '[]'::JSONB),
    p_checkin_payload->'screenshot_route_shape'
  )
  RETURNING id INTO new_checkin_id;

  UPDATE public.screenshot_quota_attempts AS a
  SET status = 'consumed',
      bucket = chosen_bucket,
      consumed_at = now(),
      checkin_id = new_checkin_id
  WHERE a.id = attempt_row.id;

  success := TRUE;
  reason := NULL;
  request_id := p_request_id;
  bucket := chosen_bucket;
  checkin_id := new_checkin_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_screenshot_recognition_lease(UUID, TEXT, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.reserve_screenshot_recognition_lease(UUID, TEXT, INTEGER, INTEGER, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_screenshot_recognition_attempt(UUID, TEXT, JSONB)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.complete_screenshot_recognition_attempt(UUID, TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_screenshot_recognition_lease(UUID, TEXT)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.release_screenshot_recognition_lease(UUID, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_screenshot_recognition(UUID, TEXT, INTEGER, INTEGER, TEXT, JSONB)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.finalize_screenshot_recognition(UUID, TEXT, INTEGER, INTEGER, TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_screenshot_recognition_replay(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_screenshot_recognition_replay(TEXT) TO authenticated;

COMMIT;
