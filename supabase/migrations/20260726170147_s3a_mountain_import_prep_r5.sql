-- S3-A Migration A: schema preparation for the 359-mountain import.
-- Production ledger version: 20260726170147.
-- This migration intentionally contains no activation precheck or trigger.
-- Migration B installs those guards only after the import and legacy
-- reconciliation have completed and been reviewed.
--
-- Safety model:
-- - Split read visibility from list/new-record eligibility:
--   is_readable controls RLS SELECT visibility for historical reads.
--   is_active controls Explore/search/new-record selection.
-- - New columns fail closed: new rows default to is_readable=false and
--   is_active=false, and the importer must explicitly set both values.
-- - Existing 18 legacy rows are explicitly made readable in the same
--   transaction so historical archive/profile/activity/share reads do not
--   lose their mountain join data.

ALTER TABLE public.mountains
  ALTER COLUMN is_active SET DEFAULT false;

ALTER TABLE public.mountains
  ALTER COLUMN altitude DROP NOT NULL;

ALTER TABLE public.mountains
  ADD COLUMN IF NOT EXISTS altitude_m_exact NUMERIC(7,1),
  ADD COLUMN IF NOT EXISTS is_readable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS effective_canonical_key TEXT,
  ADD COLUMN IF NOT EXISTS provinces TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS province_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS length_km NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS route_reference JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS access_status TEXT,
  ADD COLUMN IF NOT EXISTS closed_basis TEXT,
  ADD COLUMN IF NOT EXISTS access_source TEXT,
  ADD COLUMN IF NOT EXISTS access_note TEXT,
  ADD COLUMN IF NOT EXISTS risk_note TEXT,
  ADD COLUMN IF NOT EXISTS route_note TEXT,
  ADD COLUMN IF NOT EXISTS image_is_illustrative BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_license_manifest JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS quality_tier TEXT,
  ADD COLUMN IF NOT EXISTS intro_has_needs_review_claim BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intro_review_claims JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS semantic_review_status TEXT,
  ADD COLUMN IF NOT EXISTS source_payload_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS source_payload_hashes JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS field_review_status JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS coordinate_kind TEXT,
  ADD COLUMN IF NOT EXISTS coordinate_precision_decimals SMALLINT,
  ADD COLUMN IF NOT EXISTS coordinate_status TEXT,
  ADD COLUMN IF NOT EXISTS coordinate_source TEXT,
  ADD COLUMN IF NOT EXISTS coordinate_source_url TEXT,
  ADD COLUMN IF NOT EXISTS coordinate_provenance JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS summit_radius_m INTEGER;

-- Existing production rows are historical join anchors and must remain
-- readable even if they are not listable/selectable for new records.
-- This uses exact production ids, not names, so an import-tail execution cannot
-- accidentally flip the newly imported 344 rows to readable.
UPDATE public.mountains
SET is_readable = true
WHERE id IN (
  '9d7abd84-3eac-4472-8ba5-4c4ee6bab226',
  '216508c9-ffca-4164-8010-534d8650ee64',
  '5d3abbe4-7e4c-4a29-8257-ec8d6c2234b9',
  'f52bd0d3-2331-4404-b522-aaca38dff872',
  'c3455346-3f62-4d4b-9ccc-ac83e9babdfc',
  '44d40dcd-f1d0-47af-98bb-154505a72fa5',
  '1c250ea9-7c86-4322-9f10-f17e72430f4c',
  '39da9919-3efd-4523-b5a2-2bf9ba6a9eaa',
  'd5374798-ed2d-44b5-b338-b11cc8e207b7',
  '4d1a818b-8038-49d1-a173-a58e8c76801c',
  '11e9d0e9-8355-41b4-bc15-0b7e99d43c96',
  'a470ba81-6504-4f7f-b76b-fa01919197f3',
  'b733089f-cc28-43f1-a87a-d691f24134c8',
  '674b2a19-344e-4052-9ebf-62f4e6faeea9',
  '67bf0560-1e07-457b-9afa-b113d8b99661',
  'a82c819e-8f53-4a78-a58c-dd2242d87af2',
  '9c8848e9-6e18-4883-b8da-475699c7c856',
  '404add39-6b3f-4180-988e-4d67e09993b3'
)
AND is_readable IS DISTINCT FROM true;

CREATE UNIQUE INDEX IF NOT EXISTS mountains_effective_canonical_key_unique
  ON public.mountains (effective_canonical_key)
  WHERE effective_canonical_key IS NOT NULL;

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_access_status_check,
  ADD CONSTRAINT mountains_access_status_check
    CHECK (
      access_status IS NULL
      OR access_status IN ('open', 'closed', 'pilgrimage_only', 'unknown')
    );

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_quality_tier_check,
  ADD CONSTRAINT mountains_quality_tier_check
    CHECK (
      quality_tier IS NULL
      OR quality_tier IN ('ready', 'needs_review', 'blocked')
    );

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_semantic_review_status_check,
  ADD CONSTRAINT mountains_semantic_review_status_check
    CHECK (
      semantic_review_status IS NULL
      OR semantic_review_status IN ('approved', 'needs_review', 'blocked', 'unknown')
    );

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_altitude_m_exact_range,
  ADD CONSTRAINT mountains_altitude_m_exact_range
    CHECK (altitude_m_exact IS NULL OR altitude_m_exact BETWEEN -500 AND 9000);

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_length_km_range,
  ADD CONSTRAINT mountains_length_km_range
    CHECK (length_km IS NULL OR length_km >= 0);

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_estimated_duration_minutes_range,
  ADD CONSTRAINT mountains_estimated_duration_minutes_range
    CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0);

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_route_reference_array,
  ADD CONSTRAINT mountains_route_reference_array
    CHECK (jsonb_typeof(route_reference) = 'array');

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_image_license_manifest_array,
  ADD CONSTRAINT mountains_image_license_manifest_array
    CHECK (jsonb_typeof(image_license_manifest) = 'array');

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_source_payload_hash_sha256,
  ADD CONSTRAINT mountains_source_payload_hash_sha256
    CHECK (source_payload_sha256 IS NULL OR source_payload_sha256 ~ '^[a-f0-9]{64}$');

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_field_review_status_object,
  ADD CONSTRAINT mountains_field_review_status_object
    CHECK (jsonb_typeof(field_review_status) = 'object');

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_coordinate_kind_check,
  ADD CONSTRAINT mountains_coordinate_kind_check
    CHECK (
      coordinate_kind IS NULL
      OR coordinate_kind IN ('summit', 'area', 'seed')
    );

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_coordinate_precision_decimals_range,
  ADD CONSTRAINT mountains_coordinate_precision_decimals_range
    CHECK (
      coordinate_precision_decimals IS NULL
      OR coordinate_precision_decimals BETWEEN 0 AND 12
    );

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_coordinate_status_check,
  ADD CONSTRAINT mountains_coordinate_status_check
    CHECK (
      coordinate_status IS NULL
      OR coordinate_status IN ('resolved', 'unresolved')
    );

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_coordinate_provenance_object,
  ADD CONSTRAINT mountains_coordinate_provenance_object
    CHECK (jsonb_typeof(coordinate_provenance) = 'object');

ALTER TABLE public.mountains
  DROP CONSTRAINT IF EXISTS mountains_summit_radius_m_range,
  ADD CONSTRAINT mountains_summit_radius_m_range
    CHECK (summit_radius_m IS NULL OR summit_radius_m > 0);

DROP POLICY IF EXISTS mountains_select ON public.mountains;
CREATE POLICY mountains_select
  ON public.mountains
  FOR SELECT
  USING (is_readable = true);
