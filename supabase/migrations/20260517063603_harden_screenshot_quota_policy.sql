-- FU-33 follow-up hardening from Supabase advisors:
-- - avoid per-row auth.uid() evaluation in the select policy
-- - drop the extra user/created_at index; user/month unique index covers quota reads

BEGIN;

DROP POLICY IF EXISTS screenshot_quota_select_own ON public.screenshot_quota;
CREATE POLICY screenshot_quota_select_own
  ON public.screenshot_quota
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP INDEX IF EXISTS public.idx_screenshot_quota_user_created;

COMMIT;
