-- N1-A follow-up: allow admin reviewers to see pending checkins they can update.
-- PostgreSQL RLS applies row visibility to UPDATE targets; without the admin
-- branch here, checkins_update can exist but admin review updates still affect
-- 0 rows for pending checkins owned by other users.

DROP POLICY IF EXISTS checkins_select ON public.checkins;
CREATE POLICY checkins_select ON public.checkins
  FOR SELECT
  USING (
    status = 'approved'
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = TRUE
    )
  );
