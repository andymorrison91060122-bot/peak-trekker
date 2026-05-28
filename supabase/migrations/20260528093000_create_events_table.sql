-- FU-55: self-hosted analytics event collection.
-- Production apply is deploy-gated in V3: Vercel READY -> baseline -> dry-run -> apply -> verify.

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'auth', 'business', 'paid_attempt', 'system')),
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  page_path TEXT,
  referrer TEXT,
  user_agent TEXT,
  client_ts TIMESTAMPTZ,
  server_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_event_name_server_ts
  ON public.events(event_name, server_ts DESC);

CREATE INDEX IF NOT EXISTS idx_events_user_server_ts
  ON public.events(user_id, server_ts DESC);

CREATE INDEX IF NOT EXISTS idx_events_session_id
  ON public.events(session_id);

CREATE INDEX IF NOT EXISTS idx_events_type_server_ts
  ON public.events(event_type, server_ts DESC);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_insert_anon_authenticated ON public.events;
CREATE POLICY events_insert_anon_authenticated ON public.events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS events_select_admin ON public.events;
CREATE POLICY events_select_admin ON public.events
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

REVOKE ALL ON TABLE public.events FROM PUBLIC, anon, authenticated;
GRANT INSERT ON TABLE public.events TO anon, authenticated;
GRANT SELECT ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;
