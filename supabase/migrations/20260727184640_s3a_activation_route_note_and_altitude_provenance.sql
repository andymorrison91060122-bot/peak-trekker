-- S3-A T11 forward closeout:
-- 1. Preserve the five approved altitude decisions with their public source URLs.
-- 2. Extend the continuous activation invariant to require an honest route note.

DO $$
DECLARE
  missing_keys TEXT[];
BEGIN
  SELECT ARRAY_AGG(expected.effective_canonical_key ORDER BY expected.effective_canonical_key)
  INTO missing_keys
  FROM (
    VALUES
      ('aerjin-shan'),
      ('weizhou-volcanic-landform-route'),
      ('yading-xiannairi'),
      ('yading-xianuoduoji'),
      ('yading-yangmaiyong')
  ) AS expected(effective_canonical_key)
  LEFT JOIN public.mountains AS mountain
    ON mountain.effective_canonical_key = expected.effective_canonical_key
  WHERE mountain.id IS NULL
     OR jsonb_typeof(mountain.field_review_status->'altitude_resolution') IS DISTINCT FROM 'object';

  IF missing_keys IS NOT NULL THEN
    RAISE EXCEPTION
      'T11 altitude provenance precheck failed for canonical keys: %',
      missing_keys;
  END IF;
END;
$$;

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.mountains AS mountain
  SET field_review_status = jsonb_set(
    mountain.field_review_status,
    '{altitude_resolution,source_url}',
    to_jsonb(source.source_url),
    false
  )
  FROM (
    VALUES
      (
        'aerjin-shan',
        'https://ydyl.gansu.gov.cn/gsydyl/gjjl/llssl/202311/t20231128_15845.html'
      ),
      (
        'weizhou-volcanic-landform-route',
        'https://hyj.gxzf.gov.cn/zwgk_66846/hygl/t7663494.shtml'
      ),
      (
        'yading-xiannairi',
        'https://www.forestry.gov.cn/c/www/kjkjxw/529581.jhtml'
      ),
      (
        'yading-xianuoduoji',
        'https://www.forestry.gov.cn/c/www/kjkjxw/529581.jhtml'
      ),
      (
        'yading-yangmaiyong',
        'https://www.forestry.gov.cn/c/www/kjkjxw/529581.jhtml'
      )
  ) AS source(effective_canonical_key, source_url)
  WHERE mountain.effective_canonical_key = source.effective_canonical_key
    AND mountain.field_review_status->'altitude_resolution'->>'source_url'
      IS DISTINCT FROM source.source_url;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count < 0 OR updated_count > 5 THEN
    RAISE EXCEPTION
      'T11 altitude provenance update affected an unexpected row count: %',
      updated_count;
  END IF;
END;
$$;

DO $$
DECLARE
  blockers JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'effective_canonical_key', effective_canonical_key,
      'name', name,
      'route_note_missing', NULLIF(BTRIM(route_note), '') IS NULL
    )
    ORDER BY name
  )
  INTO blockers
  FROM public.mountains
  WHERE is_active = true
    AND NULLIF(BTRIM(route_note), '') IS NULL;

  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION
      'mountains_activation_route_note_guard precheck failed: %',
      blockers;
  END IF;
END;
$$;

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
       OR NULLIF(BTRIM(NEW.risk_note), '') IS NULL
       OR NULLIF(BTRIM(NEW.route_note), '') IS NULL THEN
      RAISE EXCEPTION
        'mountain cannot be active until is_readable, altitude, cover_image, description, risk_note, and route_note are present';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
