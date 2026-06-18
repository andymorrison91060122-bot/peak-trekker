ALTER TABLE public.mountain_waypoints
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);

ALTER TABLE public.mountain_waypoints
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);

ALTER TABLE public.mountain_waypoints
  DROP CONSTRAINT IF EXISTS mountain_waypoints_latitude_range;

ALTER TABLE public.mountain_waypoints
  ADD CONSTRAINT mountain_waypoints_latitude_range
  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90));

ALTER TABLE public.mountain_waypoints
  DROP CONSTRAINT IF EXISTS mountain_waypoints_longitude_range;

ALTER TABLE public.mountain_waypoints
  ADD CONSTRAINT mountain_waypoints_longitude_range
  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));
