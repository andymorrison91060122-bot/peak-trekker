-- FU-40: persist Trek auto-pause state when a user exits the Trek flow.
-- paused_elapsed_seconds stores the UI-visible elapsed value at the pause instant.
-- It is not cumulative paused duration; resume compensates started_at and clears it.

BEGIN;

ALTER TABLE public.trek_sessions
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_elapsed_seconds INTEGER;

ALTER TABLE public.trek_sessions
  DROP CONSTRAINT IF EXISTS trek_sessions_status_check;

ALTER TABLE public.trek_sessions
  ADD CONSTRAINT trek_sessions_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'tracking'::text,
        'paused'::text,
        'summit_verified'::text,
        'finished'::text,
        'aborted'::text
      ]
    )
  );

ALTER TABLE public.trek_sessions
  DROP CONSTRAINT IF EXISTS trek_sessions_paused_elapsed_seconds_check;

ALTER TABLE public.trek_sessions
  ADD CONSTRAINT trek_sessions_paused_elapsed_seconds_check
  CHECK (paused_elapsed_seconds IS NULL OR paused_elapsed_seconds >= 0);

COMMENT ON COLUMN public.trek_sessions.paused_at IS
  'Timestamp when an active Trek session was auto-paused by leaving the Trek flow.';

COMMENT ON COLUMN public.trek_sessions.paused_elapsed_seconds IS
  'UI-visible elapsed seconds at the pause instant. Resume compensates started_at and clears this value.';

COMMIT;
