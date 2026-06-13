-- Reconstructed from remote schema_migrations on 2026-06-13 for history completeness.
CREATE TABLE IF NOT EXISTS public.checkins_archive_20260513
(LIKE public.checkins INCLUDING ALL);

CREATE TABLE IF NOT EXISTS public.checkin_assets_archive_20260513
(LIKE public.checkin_assets INCLUDING ALL);

CREATE TABLE IF NOT EXISTS public.posts_archive_20260513
(LIKE public.posts INCLUDING ALL);

ALTER TABLE public.checkins_archive_20260513 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_assets_archive_20260513 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts_archive_20260513 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.checkins_archive_20260513 FROM anon, authenticated;
REVOKE ALL ON TABLE public.checkin_assets_archive_20260513 FROM anon, authenticated;
REVOKE ALL ON TABLE public.posts_archive_20260513 FROM anon, authenticated;
