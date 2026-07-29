-- P2 route-corridor runtime contract.
-- This migration is intentionally unapplied in Stage 2A.

ALTER TABLE public.mountains
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'mountain',
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS route_highpoint_m NUMERIC(7, 1);

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_entity_type_check,
  ADD CONSTRAINT mountains_entity_type_check
    CHECK (entity_type IN ('mountain', 'route_corridor')),
  DROP CONSTRAINT IF EXISTS mountains_route_highpoint_m_range,
  ADD CONSTRAINT mountains_route_highpoint_m_range
    CHECK (route_highpoint_m IS NULL OR route_highpoint_m >= 0),
  DROP CONSTRAINT IF EXISTS mountains_access_status_check,
  ADD CONSTRAINT mountains_access_status_check
    CHECK (
      access_status IS NULL
      OR access_status IN ('open', 'restricted', 'closed', 'pilgrimage_only', 'unknown')
    );

DO $$
DECLARE
  legacy_route_keys CONSTANT TEXT[] := ARRAY[
    'duku-gonglu-route',
    'huangshan-xihai-route',
    'huihang-gudao-route',
    'hutiaoxia-gaolu-route',
    'nanhuang-gudao-route',
    'tianmushan-qijian-route',
    'wangmangling-xiyaigou-route',
    'weizhou-volcanic-landform-route',
    'xiata-gudao-route',
    'yubeng-route'
  ];
  expected_count CONSTANT INTEGER := 10;
  existing_count INTEGER;
  updated_count INTEGER;
  actual_route_count INTEGER;
  actual_weather_disabled_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO existing_count
  FROM public.mountains
  WHERE effective_canonical_key = ANY(legacy_route_keys);

  IF existing_count <> expected_count THEN
    RAISE EXCEPTION
      'route corridor backfill precheck expected %, found %',
      expected_count,
      existing_count;
  END IF;

  UPDATE public.mountains
  SET entity_type = 'route_corridor',
      weather_enabled = false
  WHERE effective_canonical_key = ANY(legacy_route_keys)
    AND (
      entity_type IS DISTINCT FROM 'route_corridor'
      OR weather_enabled IS DISTINCT FROM false
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count < 0 OR updated_count > expected_count THEN
    RAISE EXCEPTION
      'route corridor backfill updated an unexpected row count: %',
      updated_count;
  END IF;

  SELECT COUNT(*)
  INTO actual_route_count
  FROM public.mountains
  WHERE entity_type = 'route_corridor';

  IF actual_route_count <> 10 THEN
    RAISE EXCEPTION
      'route corridor backfill postcheck expected 10, found %',
      actual_route_count;
  END IF;

  SELECT COUNT(*)
  INTO actual_weather_disabled_count
  FROM public.mountains
  WHERE effective_canonical_key = ANY(legacy_route_keys)
    AND entity_type = 'route_corridor'
    AND weather_enabled = false;

  IF actual_weather_disabled_count <> expected_count THEN
    RAISE EXCEPTION
      'route corridor weather backfill postcheck expected %, found %',
      expected_count,
      actual_weather_disabled_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mountains
    WHERE effective_canonical_key = 'gangrenboqi-cluster'
      AND entity_type IS DISTINCT FROM 'mountain'
  ) THEN
    RAISE EXCEPTION 'gangrenboqi-cluster must remain a mountain entity';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.mountain_route_geometries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id UUID NOT NULL REFERENCES public.mountains(id) ON DELETE CASCADE,
  source_record_id TEXT NOT NULL,
  source_field_name TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_file_sha256 TEXT NOT NULL,
  simplified_geometry JSONB NOT NULL,
  bbox NUMERIC[] NOT NULL,
  display_mode TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  point_count INTEGER NOT NULL,
  segment_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mountain_route_geometries_source_sha_check
    CHECK (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mountain_route_geometries_geometry_type_check
    CHECK (
      simplified_geometry->>'type' = 'MultiLineString'
      AND jsonb_typeof(simplified_geometry->'coordinates') = 'array'
    ),
  CONSTRAINT mountain_route_geometries_bbox_check
    CHECK (cardinality(bbox) = 4),
  CONSTRAINT mountain_route_geometries_display_mode_check
    CHECK (display_mode IN ('map', 'trace_only')),
  CONSTRAINT mountain_route_geometries_review_status_check
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT mountain_route_geometries_point_count_check
    CHECK (point_count >= 2),
  CONSTRAINT mountain_route_geometries_segment_count_check
    CHECK (segment_count >= 1),
  CONSTRAINT mountain_route_geometries_source_unique
    UNIQUE (mountain_id, source_file_sha256)
);

COMMENT ON TABLE public.mountain_route_geometries IS
  'Reviewed simplified WGS84 reference geometry. Raw attachment object paths stay in private ingest evidence and are not stored here.';

CREATE UNIQUE INDEX IF NOT EXISTS mountain_route_geometries_one_approved_per_mountain
  ON public.mountain_route_geometries (mountain_id)
  WHERE review_status = 'approved';

ALTER TABLE public.mountain_route_geometries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mountain_route_geometries FROM anon, authenticated;
GRANT SELECT ON TABLE public.mountain_route_geometries TO anon, authenticated;
GRANT ALL ON TABLE public.mountain_route_geometries TO service_role;

DROP POLICY IF EXISTS mountain_route_geometries_select_reviewed
  ON public.mountain_route_geometries;
CREATE POLICY mountain_route_geometries_select_reviewed
  ON public.mountain_route_geometries
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mountains AS mountain
      WHERE mountain.id = mountain_route_geometries.mountain_id
        AND mountain.is_readable = true
        AND mountain_route_geometries.review_status = 'approved'
    )
  );

DO $$
DECLARE
  blockers JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'effective_canonical_key', effective_canonical_key,
      'entity_type', entity_type,
      'altitude_missing', altitude IS NULL,
      'cover_missing', NULLIF(BTRIM(cover_image), '') IS NULL,
      'description_missing', NULLIF(BTRIM(description), '') IS NULL,
      'risk_note_missing', NULLIF(BTRIM(risk_note), '') IS NULL,
      'route_note_missing', NULLIF(BTRIM(route_note), '') IS NULL
    )
    ORDER BY name
  )
  INTO blockers
  FROM public.mountains
  WHERE is_active = true
    AND (
      is_readable IS DISTINCT FROM true
      OR (entity_type = 'mountain' AND altitude IS NULL)
      OR NULLIF(BTRIM(cover_image), '') IS NULL
      OR NULLIF(BTRIM(description), '') IS NULL
      OR NULLIF(BTRIM(risk_note), '') IS NULL
      OR NULLIF(BTRIM(route_note), '') IS NULL
    );

  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION
      'route-aware mountain activation guard precheck failed: %',
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
       OR (NEW.entity_type = 'mountain' AND NEW.altitude IS NULL)
       OR NULLIF(BTRIM(NEW.cover_image), '') IS NULL
       OR NULLIF(BTRIM(NEW.description), '') IS NULL
       OR NULLIF(BTRIM(NEW.risk_note), '') IS NULL
       OR NULLIF(BTRIM(NEW.route_note), '') IS NULL THEN
      RAISE EXCEPTION
        'entity cannot be active until shared content is ready; mountain entities also require altitude';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
