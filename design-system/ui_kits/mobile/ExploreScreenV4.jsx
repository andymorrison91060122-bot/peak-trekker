// Explore v4 — locked design system (mint #7ef0b4, 3-level type, no chrome on data).
// Three equally-weighted pathways: Import GPX · Recognize screenshot · Browse mountains.

const PT4 = {
  bg: '#0f1113', surface: '#1a1d21', line: '#2a2f34',
  fg: '#ffffff', fg2: '#9ca3af',
  mint: '#7ef0b4',
};

// Brand mark — small mountain glyph
const BrandPeak = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M3 19L9 9L13 14L17 7L21 19H3Z" stroke={PT4.mint} strokeWidth="1.6" strokeLinejoin="round"/>
  </svg>
);

const ExploreScreenV4 = () => (
  <div style={{
    width: '100%', height: '100%', background: PT4.bg, color: PT4.fg,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Noto Sans SC", system-ui, sans-serif',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }}>
    {/* Status bar spacer */}
    <div style={{ height: 44 }} />

    {/* Top bar */}
    <div style={{ padding: '10px 20px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: PT4.fg, letterSpacing: '.01em' }}>探索</div>
    </div>

    {/* Scroll body */}
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 8 }}>
      {/* Search */}
      <div style={{ padding: '10px 16px 18px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          height: 44, padding: '0 14px',
          background: PT4.surface, borderRadius: 12,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke={PT4.fg2} strokeWidth="1.7"/>
            <path d="M20 20l-3.5-3.5" stroke={PT4.fg2} strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
          <span style={{ flex: 1, fontSize: 14, color: PT4.fg2 }}>搜山名、地区、海拔</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M7 12h10M10 18h4" stroke={PT4.fg2} strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* Pathway cards — Import + Screenshot */}
      <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <PathCard
          icon={(
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke={PT4.mint} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" stroke={PT4.mint} strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          )}
          title="导入记录"
          sub="导入轨迹文件，分享你的登顶记录"
        />
        <PathCard
          icon={(
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 7V5a1 1 0 0 1 1-1h2M20 7V5a1 1 0 0 0-1-1h-2M4 17v2a1 1 0 0 0 1 1h2M20 17v2a1 1 0 0 1-1 1h-2" stroke={PT4.mint} strokeWidth="1.8" strokeLinecap="round"/>
              <rect x="8" y="9" width="8" height="6" rx="1" stroke={PT4.mint} strokeWidth="1.6"/>
            </svg>
          )}
          title="识别截图"
          sub="上传其他APP轨迹截图，分享你的登顶记录"
        />
      </div>

      {/* Transition row */}
      <div style={{
        padding: '24px 20px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 14, color: PT4.fg, fontWeight: 500 }}>
          找山出发 <span style={{ color: PT4.fg2, margin: '0 6px' }}>·</span>
          <span style={{ color: PT4.fg2, fontWeight: 400 }}>挑一座适合你的山进行登顶打卡</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M9 6l6 6-6 6" stroke={PT4.fg2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Filter chips */}
      <div style={{ padding: '0 16px 16px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, whiteSpace: 'nowrap' }}>
          {[
            { l: '全部', active: true },
            { l: '入门线' }, { l: '进阶线' }, { l: '高级线' },
            { l: '<5000m' }, { l: '5000m+' },
          ].map((c, i) => (
            <span key={i} style={{
              padding: '7px 14px', borderRadius: 999,
              background: c.active ? PT4.mint : PT4.surface,
              color: c.active ? '#0f1113' : PT4.fg2,
              fontSize: 13, fontWeight: c.active ? 600 : 500,
              flexShrink: 0,
            }}>{c.l}</span>
          ))}
        </div>
      </div>

      {/* Mountain cards */}
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <MountainCard
          tone="alpine"
          difficulty="中级及以上"
          alt="6,178"
          name="玉珠峰"
          loc="青海·格尔木"
          route="进阶线"
        />
        <MountainCard
          tone="snow"
          difficulty="初级可选"
          alt="5,396"
          name="哈巴雪山"
          loc="云南·香格里拉"
          route="入门线"
        />
      </div>
    </div>

    {/* Tab bar */}
    <TabBar />
  </div>
);

const PathCard = ({ icon, title, sub }) => (
  <div style={{
    background: PT4.surface, border: `1px solid ${PT4.line}`, borderRadius: 12,
    padding: 16, minHeight: 132,
    display: 'flex', flexDirection: 'column', gap: 12,
  }}>
    <div>{icon}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: PT4.fg, letterSpacing: '.005em' }}>{title}</div>
      <div style={{ fontSize: 12, color: PT4.fg2, lineHeight: 1.55 }}>{sub}</div>
    </div>
  </div>
);

const MountainCard = ({ tone, difficulty, alt, name, loc, route }) => {
  const grad = tone === 'alpine'
    ? 'linear-gradient(135deg, #1c2a3a 0%, #2a4055 40%, #1a2530 100%)'
    : 'linear-gradient(135deg, #1f2530 0%, #3a4a5a 35%, #1a2025 100%)';
  return (
    <div style={{
      position: 'relative', borderRadius: 12, overflow: 'hidden',
      height: 200,
      background: grad,
    }}>
      {/* Painted mountain silhouettes */}
      <svg viewBox="0 0 375 200" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id={`sky-${name}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone === 'alpine' ? '#2a4055' : '#3a4a5a'} stopOpacity="1"/>
            <stop offset="100%" stopColor="#0f1113" stopOpacity=".95"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="375" height="200" fill={`url(#sky-${name})`} />
        <path d="M0 200 L0 130 L60 90 L110 110 L160 70 L220 100 L280 60 L340 95 L375 80 L375 200 Z" fill="rgba(0,0,0,.45)"/>
        <path d="M0 200 L0 160 L40 130 L90 145 L140 115 L200 140 L260 110 L320 130 L375 120 L375 200 Z" fill="rgba(0,0,0,.65)"/>
        {/* Snow caps on far peaks */}
        <path d="M155 73 L162 79 L170 72 L176 80 L170 70 L162 76 Z" fill="#ffffff" opacity=".6"/>
        <path d="M275 63 L283 70 L292 60 L298 68 Z" fill="#ffffff" opacity=".5"/>
      </svg>

      {/* Top-left difficulty pill */}
      <div style={{
        position: 'absolute', top: 14, left: 14,
        padding: '4px 10px', borderRadius: 999,
        background: 'rgba(15,17,19,.72)', backdropFilter: 'blur(8px)',
        fontSize: 11, color: PT4.fg, fontWeight: 500,
      }}>{difficulty}</div>

      {/* Right altitude — hero data, no container */}
      <div style={{
        position: 'absolute', top: 22, right: 18, textAlign: 'right',
      }}>
        <div style={{
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          fontSize: 32, fontWeight: 800, color: PT4.mint, lineHeight: 1,
          letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums',
          textShadow: '0 2px 12px rgba(0,0,0,.4)',
        }}>{alt}<span style={{ fontSize: 14, fontWeight: 600, marginLeft: 2 }}>m</span></div>
      </div>

      {/* Bottom row */}
      <div style={{
        position: 'absolute', left: 14, right: 14, bottom: 14,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: PT4.fg, letterSpacing: '.005em' }}>{name}</div>
          <div style={{ fontSize: 12, color: PT4.fg2, marginTop: 4 }}>{loc}</div>
        </div>
        <div style={{
          padding: '5px 11px', borderRadius: 999,
          background: 'rgba(126,240,180,.14)',
          color: PT4.mint, fontSize: 11, fontWeight: 600,
          letterSpacing: '.02em',
        }}>{route}</div>
      </div>
    </div>
  );
};

const TabBar = () => {
  const tabs = [
    { l: '探索', active: true, icon: <path d="M3 19L9 9L13 14L17 7L21 19H3Z" stroke={PT4.mint} strokeWidth="1.7" strokeLinejoin="round"/> },
    { l: '山行', icon: <path d="M5 4h11l3 4v12H5V4zm11 0v4h3" stroke={PT4.fg2} strokeWidth="1.7" strokeLinejoin="round" fill="none"/> },
    { l: '出发', icon: <><circle cx="12" cy="12" r="8" stroke={PT4.fg2} strokeWidth="1.7"/><circle cx="12" cy="12" r="2.5" fill={PT4.fg2}/></> },
    { l: '山友圈', icon: <><circle cx="9" cy="10" r="3" stroke={PT4.fg2} strokeWidth="1.7"/><circle cx="16" cy="9" r="2.4" stroke={PT4.fg2} strokeWidth="1.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M14 19c0-2 2-3.5 4-3.5s3 1 3 3" stroke={PT4.fg2} strokeWidth="1.6" strokeLinecap="round"/></> },
    { l: '我的', icon: <><circle cx="12" cy="9" r="3.5" stroke={PT4.fg2} strokeWidth="1.7"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke={PT4.fg2} strokeWidth="1.7" strokeLinecap="round"/></> },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${PT4.line}`,
      background: PT4.bg,
      padding: '8px 8px 22px',
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
    }}>
      {tabs.map((t, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          padding: '4px 0',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">{t.icon}</svg>
          <span style={{
            fontSize: 11, fontWeight: t.active ? 600 : 500,
            color: t.active ? PT4.mint : PT4.fg2,
          }}>{t.l}</span>
        </div>
      ))}
    </div>
  );
};

window.ExploreScreenV4 = ExploreScreenV4;
