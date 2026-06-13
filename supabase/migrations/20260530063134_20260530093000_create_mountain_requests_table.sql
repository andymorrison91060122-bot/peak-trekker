-- FU-6: record-only UGC mountain collection requests.
-- Production apply is deploy-gated in V3: Vercel READY -> baseline -> dry-run -> apply -> verify.

CREATE TABLE IF NOT EXISTS public.mountain_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_source TEXT NOT NULL CHECK (request_source IN ('import_distance_blocked', 'import_no_match')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending')),
  location_name TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude_m INTEGER,
  province TEXT,
  track_name TEXT,
  file_name TEXT,
  import_format TEXT CHECK (import_format IN ('gpx', 'kml', 'fit')),
  candidate_mountain_id UUID REFERENCES public.mountains(id) ON DELETE SET NULL,
  candidate_mountain_name TEXT,
  candidate_distance_m INTEGER,
  reference_point_source TEXT CHECK (reference_point_source IN ('median', 'highest', 'center')),
  track_content_hash TEXT,
  request_fingerprint TEXT NOT NULL,
  dedupe_bucket_start TIMESTAMPTZ NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mountain_requests_created_at
  ON public.mountain_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mountain_requests_status_created_at
  ON public.mountain_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mountain_requests_user_created_at
  ON public.mountain_requests(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mountain_requests_dedupe
  ON public.mountain_requests(user_id, request_fingerprint, dedupe_bucket_start);

ALTER TABLE public.mountain_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mountain_requests_insert_own ON public.mountain_requests;
CREATE POLICY mountain_requests_insert_own ON public.mountain_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mountain_requests_select_admin ON public.mountain_requests;
CREATE POLICY mountain_requests_select_admin ON public.mountain_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = TRUE
    )
  );

REVOKE ALL ON TABLE public.mountain_requests FROM PUBLIC, anon, authenticated;
GRANT INSERT ON TABLE public.mountain_requests TO authenticated;
GRANT SELECT ON TABLE public.mountain_requests TO authenticated;
GRANT ALL ON TABLE public.mountain_requests TO service_role;
