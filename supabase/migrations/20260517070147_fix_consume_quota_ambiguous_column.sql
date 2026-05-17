-- FU-33 patch: consume_screenshot_quota had "column reference free_used is ambiguous"
-- error when UPDATE SET clause's RHS could not disambiguate between the table column
-- and the OUT parameter of the function (both named free_used / paid_used).
-- Fix: explicit table-qualify column references in SET RHS.

BEGIN;

CREATE OR REPLACE FUNCTION public.consume_screenshot_quota(
  p_user_id UUID,
  p_month_key TEXT,
  p_free_limit INTEGER,
  p_paid_limit INTEGER
)
RETURNS TABLE(
  success BOOLEAN,
  reason TEXT,
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
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required'
      USING ERRCODE = '22023';
  END IF;

  IF p_month_key IS NULL OR p_month_key !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'invalid p_month_key'
      USING ERRCODE = '22023';
  END IF;

  IF p_free_limit < 0 OR p_paid_limit < 0 THEN
    RAISE EXCEPTION 'quota limits must be non-negative'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.screenshot_quota (user_id, month_key)
  VALUES (p_user_id, p_month_key)
  ON CONFLICT (user_id, month_key) DO NOTHING;

  SELECT *
  INTO locked_row
  FROM public.screenshot_quota
  WHERE user_id = p_user_id
    AND month_key = p_month_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'screenshot_quota row missing after upsert'
      USING ERRCODE = 'P0002';
  END IF;

  IF locked_row.free_used < p_free_limit THEN
    UPDATE public.screenshot_quota
    SET
      free_used = screenshot_quota.free_used + 1,
      updated_at = now()
    WHERE id = locked_row.id
    RETURNING screenshot_quota.free_used, screenshot_quota.paid_used
    INTO free_used, paid_used;

    success := TRUE;
    reason := NULL;
    bucket := 'free';
    RETURN NEXT;
    RETURN;
  END IF;

  IF locked_row.paid_used < p_paid_limit THEN
    UPDATE public.screenshot_quota
    SET
      paid_used = screenshot_quota.paid_used + 1,
      updated_at = now()
    WHERE id = locked_row.id
    RETURNING screenshot_quota.free_used, screenshot_quota.paid_used
    INTO free_used, paid_used;

    success := TRUE;
    reason := NULL;
    bucket := 'paid';
    RETURN NEXT;
    RETURN;
  END IF;

  success := FALSE;
  reason := 'exhausted';
  bucket := NULL;
  free_used := locked_row.free_used;
  paid_used := locked_row.paid_used;
  RETURN NEXT;
END;
$$;

-- 重申 GRANT（CREATE OR REPLACE 不会重置 GRANT，但显式重申避免遗漏）
REVOKE ALL ON FUNCTION public.consume_screenshot_quota(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.consume_screenshot_quota(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMIT;
