-- N4: Weather cache for mountain weather backend
-- Refs:
--   docs/map-weather-brief.md v0.3.1
-- Scope:
--   - Add public.weather_cache for QWeather / Open-Meteo normalized weather data
--   - Cache by mountain_id for phase 1
--   - Public read, service-role write
-- Out of scope:
--   - weather_zone_id cache sharing (future phase)
--   - Vercel Cron configuration
--   - Mountain Detail UI integration

CREATE TABLE IF NOT EXISTS public.weather_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mountain_id UUID NOT NULL REFERENCES public.mountains(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('qweather', 'openmeteo')),
  tier TEXT NOT NULL CHECK (tier IN ('S', 'A', 'B', 'C')),
  weather_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep one latest cache row per mountain. Weather service uses upsert on mountain_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_cache_mountain
  ON public.weather_cache(mountain_id);

-- Query expired cache rows for batch refresh.
-- Do not use a partial index with now(); Postgres requires immutable expressions
-- in index predicates, so the service filters expires_at < now() at query time.
CREATE INDEX IF NOT EXISTS idx_weather_cache_expires
  ON public.weather_cache(expires_at);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weather_cache_select ON public.weather_cache;
CREATE POLICY weather_cache_select
  ON public.weather_cache
  FOR SELECT
  TO public
  USING (true);

-- No INSERT / UPDATE / DELETE policies for anon or authenticated clients.
-- Backend refresh uses the service-role client, which bypasses RLS.
