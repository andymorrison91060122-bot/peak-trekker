-- Deploy order: apply this migration before deploying app code that writes
-- screenshot_route_shape. The Activity read path has an app-level fallback for
-- a missing column, but screenshot write requests with this column still rely on
-- migration-before-code and should fail explicitly rather than silently dropping
-- a user-drawn route.
alter table public.checkins
  add column if not exists screenshot_route_shape jsonb;

comment on column public.checkins.screenshot_route_shape is
  'Normalized non-geographic screenshot route shape for user-seeded screenshot calibration. Not GPS and not used for distance, ascent, summit, navigation, PMTiles, or community route rendering.';
