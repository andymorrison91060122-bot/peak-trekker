-- Peak Trekker 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行

-- 1. 用户扩展表（配合 Supabase Auth）
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  province TEXT,
  province_code TEXT,
  license_level TEXT DEFAULT 'none' CHECK (license_level IN ('none','basic','intermediate','advanced')),
  total_altitude INTEGER DEFAULT 0,
  mountain_count INTEGER DEFAULT 0,
  onboarding_version TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_version TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_status TEXT DEFAULT 'active';

-- 2. 山峰表
CREATE TABLE IF NOT EXISTS public.mountains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mountains ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.mountains ADD COLUMN IF NOT EXISTS route_preview_image TEXT;

-- 3. 轨迹会话表（服务端核验主链路）
CREATE TABLE IF NOT EXISTS public.trek_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  mountain_id UUID REFERENCES public.mountains(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'tracking' CHECK (status IN ('tracking','summit_verified','finished','aborted')),
  verify_state TEXT DEFAULT 'pending' CHECK (verify_state IN ('pending','verified','failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  track_points JSONB DEFAULT '[]'::jsonb,
  track_summary JSONB DEFAULT '{}'::jsonb,
  distance_m NUMERIC DEFAULT 0,
  ascent_m INTEGER DEFAULT 0,
  descent_m INTEGER DEFAULT 0,
  max_altitude_m INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 打卡记录表
CREATE TABLE IF NOT EXISTS public.checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  mountain_id UUID REFERENCES public.mountains(id) ON DELETE CASCADE NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 用户执照表
CREATE TABLE IF NOT EXISTS public.user_licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('basic','intermediate','advanced')),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, level)
);

-- 6. 成就勋章表
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  earned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 动态帖子表
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  checkin_id UUID REFERENCES public.checkins(id) ON DELETE CASCADE,
  content TEXT,
  poster_url TEXT,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.checkin_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checkin_id UUID REFERENCES public.checkins(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image','video','poster')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.post_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 评论表
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 点赞表
CREATE TABLE IF NOT EXISTS public.likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 10. 省份热度统计表
CREATE TABLE IF NOT EXISTS public.province_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  province_code TEXT UNIQUE NOT NULL,
  province_name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. 装备道具展示表
CREATE TABLE IF NOT EXISTS public.gear_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  weight_grams INTEGER,
  difficulty_tag TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

-- RLS 策略（行级安全）
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mountains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trek_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

-- profiles: 自己可读写，他人只读
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- mountains: 所有人可读
CREATE POLICY "mountains_select" ON public.mountains FOR SELECT USING (is_active = true);

-- checkins: 自己可插入，所有人可读已审核的
CREATE POLICY "checkins_select" ON public.checkins FOR SELECT USING (status = 'approved' OR user_id = auth.uid());
CREATE POLICY "checkins_insert" ON public.checkins FOR INSERT WITH CHECK (auth.uid() = user_id);

-- trek_sessions: 仅本人可读写
CREATE POLICY "trek_sessions_select" ON public.trek_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trek_sessions_insert" ON public.trek_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trek_sessions_update" ON public.trek_sessions FOR UPDATE USING (auth.uid() = user_id);

-- posts: 所有人可读，自己可写
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- checkin_assets
CREATE POLICY "checkin_assets_select" ON public.checkin_assets FOR SELECT USING (true);
CREATE POLICY "checkin_assets_insert" ON public.checkin_assets FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.checkins
    WHERE public.checkins.id = checkin_assets.checkin_id
      AND public.checkins.user_id = auth.uid()
  )
);
CREATE POLICY "checkin_assets_update" ON public.checkin_assets FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM public.checkins
    WHERE public.checkins.id = checkin_assets.checkin_id
      AND public.checkins.user_id = auth.uid()
  )
);
CREATE POLICY "checkin_assets_delete" ON public.checkin_assets FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM public.checkins
    WHERE public.checkins.id = checkin_assets.checkin_id
      AND public.checkins.user_id = auth.uid()
  )
);

-- comments
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- likes
CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- post_reports
CREATE POLICY "post_reports_select" ON public.post_reports FOR SELECT USING (true);
CREATE POLICY "post_reports_insert" ON public.post_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_reports_update" ON public.post_reports FOR UPDATE USING (true);

-- 兼容已存在库：补齐新增字段
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.trek_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS verification_distance_m INTEGER;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS poster_template TEXT;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS poster_url TEXT;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS ranking_weight INTEGER DEFAULT 0;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_asset_id UUID;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_visibility_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_visibility_check CHECK (visibility IN ('public','private'));

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check CHECK (status IN ('published','hidden','removed'));

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_source_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_source_type_check CHECK (source_type IS NULL OR source_type IN ('realtime_gps','historical_photo'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_checkin_unique ON public.posts(user_id, checkin_id);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON public.posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility_status ON public.posts(visibility, status);
CREATE INDEX IF NOT EXISTS idx_posts_featured_created_at ON public.posts(is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_assets_checkin_sort ON public.checkin_assets(checkin_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_post_reports_post_status ON public.post_reports(post_id, status);

ALTER TABLE public.checkins DROP CONSTRAINT IF EXISTS checkins_source_check;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_source_check CHECK (source IN ('realtime_gps','historical_photo'));

CREATE INDEX IF NOT EXISTS idx_checkins_source ON public.checkins(source);
CREATE INDEX IF NOT EXISTS idx_checkins_session_id ON public.checkins(session_id);
CREATE INDEX IF NOT EXISTS idx_checkins_status_source ON public.checkins(status, source);

ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS verify_state TEXT DEFAULT 'pending';
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS track_points JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS track_summary JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS distance_m NUMERIC DEFAULT 0;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS ascent_m INTEGER DEFAULT 0;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS descent_m INTEGER DEFAULT 0;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS max_altitude_m INTEGER DEFAULT 0;

ALTER TABLE public.trek_sessions DROP CONSTRAINT IF EXISTS trek_sessions_status_check;
ALTER TABLE public.trek_sessions
  ADD CONSTRAINT trek_sessions_status_check CHECK (status IN ('tracking','summit_verified','finished','aborted'));

ALTER TABLE public.trek_sessions DROP CONSTRAINT IF EXISTS trek_sessions_verify_state_check;
ALTER TABLE public.trek_sessions
  ADD CONSTRAINT trek_sessions_verify_state_check CHECK (verify_state IN ('pending','verified','failed'));

CREATE INDEX IF NOT EXISTS idx_trek_sessions_user_status ON public.trek_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trek_sessions_mountain ON public.trek_sessions(mountain_id);

-- 预置省份数据
INSERT INTO public.province_stats (province_code, province_name, score) VALUES
('BJ','北京',0),('TJ','天津',0),('HE','河北',0),('SX','山西',0),('NM','内蒙古',0),
('LN','辽宁',0),('JL','吉林',0),('HL','黑龙江',0),('SH','上海',0),('JS','江苏',0),
('ZJ','浙江',0),('AH','安徽',0),('FJ','福建',0),('JX','江西',0),('SD','山东',0),
('HA','河南',0),('HB','湖北',0),('HN','湖南',0),('GD','广东',0),('GX','广西',0),
('HI','海南',0),('CQ','重庆',0),('SC','四川',0),('GZ','贵州',0),('YN','云南',0),
('XZ','西藏',0),('SN','陕西',0),('GS','甘肃',0),('QH','青海',0),('NX','宁夏',0),
('XJ','新疆',0)
ON CONFLICT (province_code) DO NOTHING;

-- 预置部分热门山峰数据（国内）
INSERT INTO public.mountains (name, altitude, province, province_code, difficulty, min_license, latitude, longitude, description) VALUES
('泰山', 1545, '山东', 'SD', 'beginner', 'none', 36.2557, 117.1006, '五岳之首，中华文明的象征'),
('黄山', 1864, '安徽', 'AH', 'beginner', 'none', 30.1301, 118.1553, '天下第一奇山，云海松石令人叹为观止'),
('华山', 2154, '陕西', 'SN', 'intermediate', 'none', 34.4869, 110.0877, '奇险天下第一山，险峻绝伦'),
('峨眉山', 3099, '四川', 'SC', 'intermediate', 'basic', 29.5997, 103.3328, '佛教名山，云雾缭绕'),
('武夷山', 2158, '福建', 'FJ', 'intermediate', 'none', 27.7269, 118.0369, '碧水丹山，世界自然与文化遗产'),
('张家界天门山', 1518, '湖南', 'HN', 'beginner', 'none', 29.1311, 110.4776, '天门洞奇观，玻璃栈道'),
('西岳华山南峰', 2154, '陕西', 'SN', 'intermediate', 'none', 34.4731, 110.0864, '华山最高峰，落雁峰'),
('五台山', 3061, '山西', 'SX', 'intermediate', 'basic', 39.0333, 113.5667, '佛教圣地，五峰耸立'),
('四姑娘山', 6250, '四川', 'SC', 'expert', 'advanced', 31.0500, 102.9833, '蜀山皇后，四川第二高峰'),
('贡嘎山', 7556, '四川', 'SC', 'expert', 'advanced', 29.5942, 101.8764, '蜀山之王，四川最高峰'),
('慕士塔格峰', 7546, '新疆', 'XJ', 'expert', 'advanced', 38.2769, 75.1136, '冰山之父，帕米尔高原雄峰'),
('玉龙雪山', 5596, '云南', 'YN', 'advanced', 'intermediate', 27.1167, 100.2333, '丽江的守护神山，终年积雪'),
('梅里雪山', 6740, '云南', 'YN', 'expert', 'advanced', 28.4333, 98.6167, '云南最高峰，神山圣地'),
('珠穆朗玛峰', 8848, '西藏', 'XZ', 'expert', 'advanced', 27.9881, 86.9250, '世界之巅，地球最高点'),
('莲花山', 1698, '广东', 'GD', 'beginner', 'none', 23.5833, 113.9333, '广东第一高峰，莲花叠翠'),
('神农顶', 3105, '湖北', 'HB', 'intermediate', 'basic', 31.4431, 110.3275, '华中屋脊，神农架最高峰'),
('长白山天池', 2744, '吉林', 'JL', 'intermediate', 'basic', 42.0069, 128.0644, '火山口湖，满族圣山'),
('嵩山', 1512, '河南', 'HA', 'beginner', 'none', 34.4847, 113.0556, '五岳中岳，少林圣地'),
('武当山', 1612, '湖北', 'HB', 'beginner', 'none', 32.4003, 111.0044, '道教圣地，武当武术发源地'),
('雁荡山', 1150, '浙江', 'ZJ', 'beginner', 'none', 28.3667, 121.0667, '东南第一山，奇峰异石')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mountain_waypoints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mountain_id UUID NOT NULL REFERENCES public.mountains(id)
    ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'viewpoint', 'supply', 'turnaround',
    'campsite', 'danger', 'transport'
  )),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  elevation INTEGER DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waypoints_mountain
  ON public.mountain_waypoints(mountain_id, type, sort_order);

ALTER TABLE public.mountain_waypoints
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY waypoints_select ON public.mountain_waypoints
  FOR SELECT USING (true);
