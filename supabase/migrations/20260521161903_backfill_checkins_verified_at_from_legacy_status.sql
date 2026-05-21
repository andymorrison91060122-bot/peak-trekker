UPDATE public.checkins
SET verified_at = created_at
WHERE verified_at IS NULL
  AND status IN ('approved', 'verified');
