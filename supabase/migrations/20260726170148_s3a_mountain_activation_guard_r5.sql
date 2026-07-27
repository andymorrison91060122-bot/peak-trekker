-- S3-A Migration B: activation precheck and continuous invariant.
-- This follows Migration A's production ledger version and remains unapplied.
-- Do not apply until the 359-row import and 18-row legacy reconciliation have
-- completed, the precheck output has been reviewed, and a separate GO exists.

CREATE OR REPLACE FUNCTION public.enforce_mountain_activation_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_active = true THEN
    IF NEW.is_readable IS DISTINCT FROM true
       OR NEW.altitude IS NULL
       OR NULLIF(BTRIM(NEW.cover_image), '') IS NULL
       OR NULLIF(BTRIM(NEW.description), '') IS NULL
       OR NULLIF(BTRIM(NEW.risk_note), '') IS NULL THEN
      RAISE EXCEPTION
        'mountain cannot be active until is_readable, altitude, cover_image, description, and risk_note are present';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  blockers JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', name,
      'is_active', is_active,
      'is_readable', is_readable,
      'altitude_missing', altitude IS NULL,
      'cover_image_missing', NULLIF(BTRIM(cover_image), '') IS NULL,
      'description_missing', NULLIF(BTRIM(description), '') IS NULL,
      'risk_note_missing', NULLIF(BTRIM(risk_note), '') IS NULL
    )
    ORDER BY name
  )
  INTO blockers
  FROM public.mountains
  WHERE is_active = true
    AND (
      is_readable IS DISTINCT FROM true
      OR altitude IS NULL
      OR NULLIF(BTRIM(cover_image), '') IS NULL
      OR NULLIF(BTRIM(description), '') IS NULL
      OR NULLIF(BTRIM(risk_note), '') IS NULL
    );

  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'mountains_activation_ready_guard precheck failed: %', blockers;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS mountains_activation_ready_guard ON public.mountains;
CREATE TRIGGER mountains_activation_ready_guard
BEFORE INSERT OR UPDATE ON public.mountains
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mountain_activation_ready();
