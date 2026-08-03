-- Qualify columns that collide with PL/pgSQL RETURNS TABLE variables.

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
  chosen_bucket TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required' USING ERRCODE = '22023';
  END IF;

  IF p_request_id IS NULL OR length(trim(p_request_id)) = 0 THEN
    RAISE EXCEPTION 'p_request_id required' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.complete_screenshot_quota_attempt(
  p_user_id UUID,
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
  SET status = 'consumed', consumed_at = now()
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

CREATE OR REPLACE FUNCTION public.refund_screenshot_quota_attempt(
  p_user_id UUID,
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
    request_id := p_request_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF attempt_row.status = 'refunded' THEN
    SELECT q.free_used, q.paid_used
    INTO free_used, paid_used
    FROM public.screenshot_quota AS q
    WHERE q.user_id = p_user_id
      AND q.month_key = attempt_row.month_key;

    success := TRUE;
    reason := 'already_refunded';
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

  IF attempt_row.bucket = 'free' THEN
    UPDATE public.screenshot_quota AS q
    SET free_used = GREATEST(q.free_used - 1, 0), updated_at = now()
    WHERE q.user_id = p_user_id
      AND q.month_key = attempt_row.month_key
    RETURNING q.free_used, q.paid_used
    INTO free_used, paid_used;
  ELSE
    UPDATE public.screenshot_quota AS q
    SET paid_used = GREATEST(q.paid_used - 1, 0), updated_at = now()
    WHERE q.user_id = p_user_id
      AND q.month_key = attempt_row.month_key
    RETURNING q.free_used, q.paid_used
    INTO free_used, paid_used;
  END IF;

  UPDATE public.screenshot_quota_attempts AS a
  SET status = 'refunded', refunded_at = now()
  WHERE a.id = attempt_row.id;

  success := TRUE;
  reason := NULL;
  request_id := p_request_id;
  bucket := attempt_row.bucket;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_screenshot_quota_attempt(UUID, TEXT, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.reserve_screenshot_quota_attempt(UUID, TEXT, INTEGER, INTEGER, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_screenshot_quota_attempt(UUID, TEXT)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.complete_screenshot_quota_attempt(UUID, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.refund_screenshot_quota_attempt(UUID, TEXT)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.refund_screenshot_quota_attempt(UUID, TEXT)
  TO service_role;

COMMIT;
