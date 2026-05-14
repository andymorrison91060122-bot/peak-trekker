-- Pre-3.a: distinguish complete summit records from incomplete Trek saves.
-- Existing rows are complete by default; incomplete records keep status='pending'.

ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS completion_status TEXT NOT NULL DEFAULT 'complete';

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_completion_status_check;

ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_completion_status_check
  CHECK (completion_status IN ('complete', 'incomplete'));

CREATE INDEX IF NOT EXISTS idx_checkins_completion_status
  ON public.checkins(completion_status);
