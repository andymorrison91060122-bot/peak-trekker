-- Forward repair for the deployed reserve function's truncated UUID validation.
-- The ledgered idempotency migration remains unchanged.

BEGIN;

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

REVOKE ALL ON FUNCTION public.reserve_screenshot_quota_attempt(UUID, TEXT, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.reserve_screenshot_quota_attempt(UUID, TEXT, INTEGER, INTEGER, TEXT)
  TO service_role;

COMMIT;
