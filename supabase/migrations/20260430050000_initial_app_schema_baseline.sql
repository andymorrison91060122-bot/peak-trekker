-- FU-91 app-owned schema baseline for fresh environments.
-- Production existing project must NOT execute this DDL; production ledger repair is a separate Phase 2C metadata-only step after merge.

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  province TEXT,
  province_code TEXT,
  license_level TEXT DEFAULT 'none' CHECK (license_level IN ('none','basic','intermediate','advanced')),
  total_altitude INTEGER DEFAULT 0,
  mountain_count INTEGER DEFAULT 0,
  onboarding_version TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  community_status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.mountains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  altitude INTEGER NOT NULL,
  province TEXT NOT NULL,
  province_code TEXT NOT NULL,
  difficulty TEXT DEFAULT 'beginner' CHECK (difficulty IN ('beginner','intermediate','advanced','expert')),
  min_license TEXT DEFAULT 'none' CHECK (min_license IN ('none','basic','intermediate','advanced')),
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  description TEXT,
  cover_image TEXT,
  checkin_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  gallery_images JSONB DEFAULT '[]'::jsonb,
  route_preview_image TEXT
);

CREATE TABLE IF NOT EXISTS public.trek_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mountain_id UUID REFERENCES public.mountains(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'tracking' CHECK (status IN ('tracking','summit_verified','finished','aborted')),
  verify_state TEXT DEFAULT 'pending' CHECK (verify_state IN ('pending','verified','failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  track_points JSONB DEFAULT '[]'::jsonb,
  track_summary JSONB DEFAULT '{}'::jsonb,
  distance_m NUMERIC DEFAULT 0,
  ascent_m INTEGER DEFAULT 0,
  descent_m INTEGER DEFAULT 0,
  max_altitude_m INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mountain_id UUID NOT NULL REFERENCES public.mountains(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gps','photo')),
  source TEXT CHECK (source IN ('realtime_gps','historical_photo')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  photo_url TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  note TEXT,
  session_id UUID REFERENCES public.trek_sessions(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  verification_distance_m INTEGER,
  poster_template TEXT,
  poster_url TEXT,
  ranking_weight INTEGER DEFAULT 0,
  review_note TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('basic','intermediate','advanced')),
  earned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, level)
);

CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  earned_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checkin_id UUID REFERENCES public.checkins(id) ON DELETE CASCADE,
  content TEXT,
  poster_url TEXT,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  title TEXT,
  body TEXT,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public','private')),
  source_type TEXT CHECK (source_type IS NULL OR source_type IN ('realtime_gps','historical_photo')),
  status TEXT DEFAULT 'published' CHECK (status IN ('published','hidden','removed')),
  published_at TIMESTAMPTZ DEFAULT now(),
  cover_asset_id UUID,
  cover_url TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  is_featured BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.checkin_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES public.checkins(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image','video','poster')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.province_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_code TEXT UNIQUE NOT NULL,
  province_name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reference configuration required by later trigger verification migrations.
-- This is not user/business activity data.
INSERT INTO public.province_stats (province_code, province_name, score)
VALUES
  ('BJ','北京',0),('TJ','天津',0),('HE','河北',0),('SX','山西',0),('NM','内蒙古',0),
  ('LN','辽宁',0),('JL','吉林',0),('HL','黑龙江',0),('SH','上海',0),('JS','江苏',0),
  ('ZJ','浙江',0),('AH','安徽',0),('FJ','福建',0),('JX','江西',0),('SD','山东',0),
  ('HA','河南',0),('HB','湖北',0),('HN','湖南',0),('GD','广东',0),('GX','广西',0),
  ('HI','海南',0),('CQ','重庆',0),('SC','四川',0),('GZ','贵州',0),('YN','云南',0),
  ('XZ','西藏',0),('SN','陕西',0),('GS','甘肃',0),('QH','青海',0),('NX','宁夏',0),
  ('XJ','新疆',0)
ON CONFLICT (province_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gear_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  weight_grams INTEGER,
  difficulty_tag TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.mountain_waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id UUID NOT NULL REFERENCES public.mountains(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('viewpoint','supply','turnaround','campsite','danger','transport')),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  elevation INTEGER DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_checkin_unique ON public.posts(user_id, checkin_id);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON public.posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility_status ON public.posts(visibility, status);
CREATE INDEX IF NOT EXISTS idx_posts_featured_created_at ON public.posts(is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_assets_checkin_sort ON public.checkin_assets(checkin_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_post_reports_post_status ON public.post_reports(post_id, status);
CREATE INDEX IF NOT EXISTS idx_checkins_source ON public.checkins(source);
CREATE INDEX IF NOT EXISTS idx_checkins_session_id ON public.checkins(session_id);
CREATE INDEX IF NOT EXISTS idx_checkins_status_source ON public.checkins(status, source);
CREATE INDEX IF NOT EXISTS idx_trek_sessions_user_status ON public.trek_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trek_sessions_mountain ON public.trek_sessions(mountain_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_mountain ON public.mountain_waypoints(mountain_id, type, sort_order);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mountains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trek_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mountain_waypoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS mountains_select ON public.mountains;
CREATE POLICY mountains_select ON public.mountains FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS checkins_select ON public.checkins;
CREATE POLICY checkins_select ON public.checkins FOR SELECT USING (status = 'approved' OR user_id = auth.uid());
DROP POLICY IF EXISTS checkins_insert ON public.checkins;
CREATE POLICY checkins_insert ON public.checkins FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS trek_sessions_select ON public.trek_sessions;
CREATE POLICY trek_sessions_select ON public.trek_sessions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS trek_sessions_insert ON public.trek_sessions;
CREATE POLICY trek_sessions_insert ON public.trek_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS trek_sessions_update ON public.trek_sessions;
CREATE POLICY trek_sessions_update ON public.trek_sessions FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS posts_select ON public.posts;
CREATE POLICY posts_select ON public.posts FOR SELECT USING (true);
DROP POLICY IF EXISTS posts_insert ON public.posts;
CREATE POLICY posts_insert ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS posts_update ON public.posts;
CREATE POLICY posts_update ON public.posts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS posts_delete ON public.posts;
CREATE POLICY posts_delete ON public.posts FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS checkin_assets_select ON public.checkin_assets;
CREATE POLICY checkin_assets_select ON public.checkin_assets FOR SELECT USING (true);
DROP POLICY IF EXISTS checkin_assets_insert ON public.checkin_assets;
CREATE POLICY checkin_assets_insert ON public.checkin_assets FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.checkins
    WHERE checkins.id = checkin_assets.checkin_id
      AND checkins.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS checkin_assets_update ON public.checkin_assets;
CREATE POLICY checkin_assets_update ON public.checkin_assets FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM public.checkins
    WHERE checkins.id = checkin_assets.checkin_id
      AND checkins.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS checkin_assets_delete ON public.checkin_assets;
CREATE POLICY checkin_assets_delete ON public.checkin_assets FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM public.checkins
    WHERE checkins.id = checkin_assets.checkin_id
      AND checkins.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS comments_select ON public.comments;
CREATE POLICY comments_select ON public.comments FOR SELECT USING (true);
DROP POLICY IF EXISTS comments_insert ON public.comments;
CREATE POLICY comments_insert ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS likes_select ON public.likes;
CREATE POLICY likes_select ON public.likes FOR SELECT USING (true);
DROP POLICY IF EXISTS likes_insert ON public.likes;
CREATE POLICY likes_insert ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS likes_delete ON public.likes;
CREATE POLICY likes_delete ON public.likes FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS post_reports_select ON public.post_reports;
CREATE POLICY post_reports_select ON public.post_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS post_reports_insert ON public.post_reports;
CREATE POLICY post_reports_insert ON public.post_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS post_reports_update ON public.post_reports;
CREATE POLICY post_reports_update ON public.post_reports FOR UPDATE USING (true);

DROP POLICY IF EXISTS waypoints_select ON public.mountain_waypoints;
CREATE POLICY waypoints_select ON public.mountain_waypoints FOR SELECT USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
  ('checkin-photos', 'checkin-photos', true, 8388608, ARRAY['image/jpeg','image/png','image/webp']),
  ('map-tiles', 'map-tiles', true, 52428800, NULL),
  ('mountain-media', 'mountain-media', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_select ON storage.objects;
CREATE POLICY avatars_select ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS avatars_insert ON storage.objects;
CREATE POLICY avatars_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
DROP POLICY IF EXISTS avatars_update ON storage.objects;
CREATE POLICY avatars_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
DROP POLICY IF EXISTS avatars_delete ON storage.objects;
CREATE POLICY avatars_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS checkin_photos_select ON storage.objects;
CREATE POLICY checkin_photos_select ON storage.objects FOR SELECT TO public USING (bucket_id = 'checkin-photos');
DROP POLICY IF EXISTS checkin_photos_insert ON storage.objects;
CREATE POLICY checkin_photos_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'checkin-photos'
  AND (storage.foldername(name))[1] = 'checkins'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
DROP POLICY IF EXISTS checkin_photos_delete ON storage.objects;
CREATE POLICY checkin_photos_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'checkin-photos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS mountain_media_select ON storage.objects;
CREATE POLICY mountain_media_select ON storage.objects FOR SELECT TO public USING (bucket_id = 'mountain-media');
