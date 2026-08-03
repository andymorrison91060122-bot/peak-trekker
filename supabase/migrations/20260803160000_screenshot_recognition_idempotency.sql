-- Persist a bounded, replayable recognition response with the quota attempt that consumed it.
-- Results are readable only by their authenticated owner and expire at the next quota-month boundary.

BEGIN;

ALTER TABLE public.screenshot_quota_attempts
  ADD COLUMN IF NOT EXISTS recognition_result JSONB,
  ADD COLUMN IF NOT EXISTS recognition_result_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS result_expires_at TIMESTAMPTZ;

ALTER TABLE public.screenshot_quota_attempts
  DROP CONSTRAINT IF EXISTS screenshot_quota_attempts_request_id_key;

ALTER TABLE public.screenshot_quota_attempts
  ADD CONSTRAINT screenshot_quota_attempts_user_request_id_key UNIQUE (user_id, request_id),
  ADD CONSTRAINT screenshot_quota_attempts_result_bytes_check
    CHECK (recognition_result_bytes IS NULL OR recognition_result_bytes BETWEEN 1 AND 65536);

CREATE OR REPLACE FUNCTION public.reserve_screenshot_quota_attempt(
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
  attempt_row public.screenshot_quota_attempts%ROWTYPE;
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'screenshot_quota row missing after upsert' USING ERRCODE = 'P0002';
  END IF;

  -- Quota attempts are month-scoped. The next month's first reservation removes expired replay payloads.
  UPDATE public.screenshot_quota_attempts AS a
  SET recognition_result = NULL,
      recognition_result_bytes = NULL,
      result_expires_at = NULL
  WHERE a.user_id = p_user_id
    AND a.result_expires_at IS NOT NULL
    AND a.result_expires_at <= now();

  SELECT a.*
  INTO attempt_row
  FROM public.screenshot_quota_attempts AS a
  WHERE a.user_id = p_user_id
    AND a.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    success := FALSE;
    reason := 'existing';
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    free_used := locked_row.free_used;
    paid_used := locked_row.paid_used;
    RETURN NEXT;
    RETURN;
  END IF;

  IF locked_row.free_used < p_free_limit THEN
    UPDATE public.screenshot_quota AS q
    SET free_used = q.free_used + 1, updated_at = now()
    WHERE q.id = locked_row.id
    RETURNING q.free_used, q.paid_used
    INTO free_used, paid_used;
    chosen_bucket := 'free';
  ELSIF locked_row.paid_used < p_paid_limit THEN
    UPDATE public.screenshot_quota AS q
    SET paid_used = q.paid_used + 1, updated_at = now()
    WHERE q.id = locked_row.id
    RETURNING q.free_used, q.paid_used
    INTO free_used, paid_used;
    chosen_bucket := 'paid';
  ELSE
    success := FALSE;
    reason := 'exhausted';
    request_id := p_request_id;
    bucket := NULL;
    free_used := locked_row.free_used;
    paid_used := locked_row.paid_used;
    RETURN NEXT;
    RETURN;
  END IF;

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
  RETURN NEXT;
END;
$$;

-- Keep the two-argument overload for migration-first deployment and rollback compatibility.
-- Remove it only in a future separate migration after this rollout.

CREATE FUNCTION public.complete_screenshot_quota_attempt(
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

  IF attempt_row.status = 'consumed' THEN
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
    RETURN;
  END IF;

  IF attempt_row.status <> 'reserved' THEN
    SELECT q.free_used, q.paid_used
    INTO free_used, paid_used
    FROM public.screenshot_quota AS q
    WHERE q.user_id = p_user_id
      AND q.month_key = attempt_row.month_key;

    success := FALSE;
    reason := 'not_reserved';
    request_id := p_request_id;
    bucket := attempt_row.bucket;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.screenshot_quota_attempts AS a
  SET status = 'consumed',
      consumed_at = now(),
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

CREATE OR REPLACE FUNCTION public.get_screenshot_recognition_replay(
  p_request_id TEXT
)
RETURNS TABLE(
  found BOOLEAN,
  status TEXT,
  recognition_result JSONB
)
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
    WHEN attempt_row.status = 'consumed'
      AND attempt_row.result_expires_at > now()
      THEN attempt_row.recognition_result
    ELSE NULL
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_screenshot_quota_attempt(UUID, TEXT, JSONB)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.complete_screenshot_quota_attempt(UUID, TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_screenshot_recognition_replay(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_screenshot_recognition_replay(TEXT) TO authenticated;

COMMIT;
