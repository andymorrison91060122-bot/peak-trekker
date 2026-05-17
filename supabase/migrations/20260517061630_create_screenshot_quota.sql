-- FU-33: screenshot OCR monthly quota.
--
-- Product rules:
-- - first OCR month: 5 free recognitions
-- - later months: 2 free recognitions
-- - paid tier: 30 paid recognitions per month
--
-- Security posture:
-- - authenticated users can only read their own quota row.
-- - clients cannot insert/update/delete quota rows.
-- - quota consumption is done by the server route with service_role only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.screenshot_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  free_used INTEGER NOT NULL DEFAULT 0,
  paid_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT screenshot_quota_month_key_check
    CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT screenshot_quota_free_used_check
    CHECK (free_used >= 0),
  CONSTRAINT screenshot_quota_paid_used_check
    CHECK (paid_used >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_screenshot_quota_user_month
  ON public.screenshot_quota(user_id, month_key);

CREATE INDEX IF NOT EXISTS idx_screenshot_quota_user_created
  ON public.screenshot_quota(user_id, created_at);

ALTER TABLE public.screenshot_quota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS screenshot_quota_select_own ON public.screenshot_quota;
CREATE POLICY screenshot_quota_select_own
  ON public.screenshot_quota
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.screenshot_quota FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.screenshot_quota TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.screenshot_quota TO service_role;

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
      free_used = free_used + 1,
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
      paid_used = paid_used + 1,
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

REVOKE ALL ON FUNCTION public.consume_screenshot_quota(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.consume_screenshot_quota(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMIT;
