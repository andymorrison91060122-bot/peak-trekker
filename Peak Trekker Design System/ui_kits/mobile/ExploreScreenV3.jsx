// Explore v3 — refined default / no-selected-mountain state.
//
// Goals over v2:
//  • Import entry sits naturally at the top of the list, but reads as a real
//    product path (with a faint trace illustration), not a "tip" banner.
//  • Search bar gets an inline "import" suffix icon for power users — discoverable
//    without burying the dedicated card.
//  • Removes the redundant search icon in the top-right (search is the whole row).
//  • Filter chip set is shorter (the spec asks for difficulty, license, region —
//    not arbitrary altitude bands).
//  • Each mountain card now exposes 距离/时长 inline so the user can decide faster.

const ExploreV3_MOUNTAINS = [
  { id: 'yzf', name: '玉珠峰', region: '青海 · 格尔木', alt: 6178, dist: 12.4, dur: '6h', level: '中级及以上', levelTone: 'active', line: '进阶线', tone: 'alpine' },
  { id: 'hbx', name: '哈巴雪山', region: '云南 · 香格里拉', alt: 5396, dist: 9.8, dur: '5h', level: '初级可进', line: '入门线', tone: 'slate' },
  { id: 'sgn', name: '四姑娘大峰', region: '四川 · 阿坝', alt: 5025, dist: 8.2, dur: '4h', level: '初级可进', line: '入门线', tone: 'dusk' },
  { id: 'xbd', name: '雪宝顶', region: '四川 · 松潘', alt: 5588, dist: 11.0, dur: '6h', level: '中级及以上', levelTone: 'active', line: '进阶线', tone: 'dawn' },
];
const EXPLORE_V3_FILTERS = ['全部', '入门线', '进阶线', '中级及以上', '本省', '5000m+'];

// Import entry — given more visual weight, with a faint trace pattern that
// signals "your past trip becomes data here". Reads as a peer to the list,
// not a banner. Sits at the top of the scroll, before the filter chips, so
// it's the first decision: search a mountain, or import a result.
const ImportEntryCardV3 = ({ onClick }) => (
  <button onClick={onClick} style={{
    position: 'relative', overflow: 'hidden',
    width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
    background: 'linear-gradient(180deg, rgba(34,197,94,.08) 0%, rgba(34,197,94,.02) 80%, rgba(34,197,94,0) 100%)',
    border: `1px solid rgba(34,197,94,.26)`, borderRadius: 16,
    padding: '14px 16px', display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 14, alignItems: 'center',
  }}>
    {/* faint trace pattern in background — implies "import a track" */}
    <svg width="100%" height="100%" viewBox="0 0 320 90" preserveAspectRatio="none" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '70%', opacity: .35, pointerEvents: 'none' }}>
      <path d="M-20 75 Q 60 60 100 50 T 200 30 T 340 18" stroke={PTColors.success} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeDasharray="3 4"/>
      <circle cx="340" cy="18" r="3" fill={PTColors.success}/>
    </svg>
    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.16)', border: `1px solid rgba(34,197,94,.3)`, position: 'relative' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 14V4M8 8l4-4 4 4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>已经走过了？把结果带回来</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4 }}>导入 GPX / FIT · 系统会匹配到一座山</div>
    </div>
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 999, background: 'rgba(34,197,94,.16)', border: `1px solid rgba(34,197,94,.32)` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.success }}>导入</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  </button>
);

const ExploreScreenV3 = ({ onPickMountain, onTab, onBack, onImport }) => {
  const [filter, setFilter] = React.useState('全部');
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 96 }}>
      <StatusBar />
      <TopBar title="探索" onBack={onBack} right={null} />

      {/* Search row, with inline import suffix as a power-user shortcut. */}
      <div style={{ padding: '4px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12 }}>
          <PTIcons.search />
          <input placeholder="搜山名、地区、海拔" style={{ flex: 1, background: 'none', border: 'none', color: PTColors.fg, outline: 'none', fontSize: 14, fontFamily: 'inherit' }} />
          <div style={{ width: 1, height: 18, background: PTColors.outline }} />
          <button onClick={onImport} aria-label="导入轨迹" title="导入轨迹" style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: PTColors.success, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 14V4M8 8l4-4 4 4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            导入
          </button>
        </div>
      </div>

      {/* Parallel import entry — given full weight, sits BEFORE the filter row. */}
      <div style={{ padding: '0 16px 14px' }}>
        <ImportEntryCardV3 onClick={onImport} />
      </div>

      <div style={{ padding: '0 20px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>本省 · 4 座推荐</div>
        <button style={{ background: 'none', border: 'none', color: PTColors.fg2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <PTIcons.filter /> 筛选
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 16px 10px', scrollbarWidth: 'none' }}>
        {EXPLORE_V3_FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 12px', borderRadius: 999, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', flex: '0 0 auto',
            background: f === filter ? 'rgba(34,197,94,.14)' : 'rgba(255,255,255,.04)',
            color: f === filter ? PTColors.success : PTColors.fg2,
            border: f === filter ? `1px solid rgba(34,197,94,.26)` : '1px solid transparent',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '4px 16px 0', display: 'grid', gap: 12 }}>
        {ExploreV3_MOUNTAINS.map(m => (
          <button key={m.id} onClick={() => onPickMountain && onPickMountain(m)} style={{ textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
            <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ position: 'relative' }}>
                <PhonePlaceholder h={150} tone={m.tone} label={m.name} />
                <div style={{ position: 'absolute', top: 10, left: 10 }}><Chip tone={m.levelTone}>{m.level}</Chip></div>
                <div style={{ position: 'absolute', top: 10, right: 10, padding: '5px 10px', borderRadius: 999, background: 'rgba(12,14,16,.78)', backdropFilter: 'blur(8px)', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 13, color: PTColors.success }}>{m.alt.toLocaleString()}m</div>
              </div>
              <div style={{ padding: '10px 14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{m.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: PTColors.fg2 }}>{m.line}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: PTColors.fg2 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PTIcons.pin /> {m.region}</span>
                  <span style={{ width: 3, height: 3, background: PTColors.outline, borderRadius: 999 }} />
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{m.dist}km</span>
                  <span style={{ width: 3, height: 3, background: PTColors.outline, borderRadius: 999 }} />
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{m.dur}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <TabBar active="explore" onChange={onTab} />
    </div>
  );
};

// Refined not-found: keeps the calm tone, but reorders so the THREE actions
// the brief asked for read as a clean stack. Adds a faint "你搜的是" header so
// the empty state doesn't feel like a dead end.
const ExploreNotFoundV2 = ({ onBack, onTab, onImport, onRetry, onStash, query = '尕朵觉沃' }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 96 }}>
    <StatusBar />
    <TopBar title="探索" onBack={onBack} right={null} />

    <div style={{ padding: '4px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12 }}>
        <PTIcons.search />
        <span style={{ flex: 1, fontSize: 14, color: PTColors.fg }}>{query}</span>
        <button style={{ background: 'none', border: 'none', color: PTColors.fg2, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>清除</button>
      </div>
    </div>

    {/* Calm 'no results' marker */}
    <div style={{ padding: '24px 28px 4px', textAlign: 'center' }}>
      <svg width="140" height="68" viewBox="0 0 140 68" style={{ display: 'block', margin: '0 auto' }}>
        <defs>
          <linearGradient id="enf-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={PTColors.outline} stopOpacity="0"/>
            <stop offset="40%" stopColor={PTColors.outline} stopOpacity="1"/>
            <stop offset="60%" stopColor={PTColors.outline} stopOpacity="1"/>
            <stop offset="100%" stopColor={PTColors.outline} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d="M0 56 L24 30 L40 42 L62 14 L82 36 L100 24 L140 50" stroke="url(#enf-fade)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="62" cy="14" r="3" fill={PTColors.fg2}/>
        <line x1="58" y1="10" x2="66" y2="18" stroke={PTColors.bg} strokeWidth="3"/>
        <line x1="58" y1="18" x2="66" y2="10" stroke={PTColors.fg2} strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="66" y1="18" x2="58" y2="10" stroke={PTColors.fg2} strokeWidth="1.5" strokeLinecap="round" opacity="0"/>
      </svg>
      <div style={{ fontSize: 17, fontWeight: 700, color: PTColors.fg, marginTop: 18 }}>没找到这座山</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 8, lineHeight: 1.7, maxWidth: 280, margin: '8px auto 0' }}>
        Peak Trekker 收录的山有限。<br/>
        如果你已经走过它，可以直接把结果带回来。
      </div>
    </div>

    {/* Primary recovery: import — strongest visual weight */}
    <div style={{ padding: '24px 16px 0' }}>
      <button onClick={onImport} style={{
        position: 'relative', overflow: 'hidden',
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: 'linear-gradient(180deg, rgba(34,197,94,.12) 0%, rgba(34,197,94,.02) 100%)',
        border: `1px solid rgba(34,197,94,.32)`, borderRadius: 14,
        padding: '14px 16px', display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 14, alignItems: 'center',
      }}>
        <svg width="100%" height="100%" viewBox="0 0 320 90" preserveAspectRatio="none" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '60%', opacity: .3, pointerEvents: 'none' }}>
          <path d="M-20 75 Q 60 60 100 50 T 200 30 T 340 18" stroke={PTColors.success} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeDasharray="3 4"/>
          <circle cx="340" cy="18" r="3" fill={PTColors.success}/>
        </svg>
        <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.18)', border: `1px solid rgba(34,197,94,.34)`, position: 'relative' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 14V4M8 8l4-4 4 4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>导入轨迹记录</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4 }}>GPX / FIT / 健康 App · 系统会尝试匹配最近的山</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: 'relative' }}><path d="M9 6l6 6-6 6" stroke={PTColors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>

    {/* Secondary tier — same shape, neutral surface */}
    <div style={{ padding: '10px 16px 0', display: 'grid', gap: 10 }}>
      <NotFoundRowV2 icon={<PTIcons.search />} title="继续搜索" sub="试试拼音、英文名或所在区域" onClick={onRetry} />
      <NotFoundRowV2 icon={<StashIconV2 />} title="暂存为未收录山行" sub="先手动声明结果 · 上线后我们尝试帮你认领" onClick={onStash} />
    </div>

    {/* Quiet aside */}
    <div style={{ padding: '24px 28px 0', fontSize: 11, color: PTColors.fg2, lineHeight: 1.7, textAlign: 'center' }}>
      也可以 <span style={{ color: PTColors.fg, textDecoration: 'underline', textUnderlineOffset: 2 }}>提交一座山的资料</span>，由志愿者审核后纳入收录。
    </div>

    <TabBar active="explore" onChange={onTab} />
  </div>
);

const NotFoundRowV2 = ({ icon, title, sub, onClick }) => (
  <button onClick={onClick} style={{
    textAlign: 'left', padding: '14px 14px', border: `1px solid ${PTColors.outline}`,
    background: PTColors.surface, borderRadius: 14, cursor: 'pointer',
    display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center', fontFamily: 'inherit',
  }}>
    <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}` }}>{icon}</div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>{title}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4 }}>{sub}</div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);

const StashIconV2 = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M9 4h6l1 3H8z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M10 12h4" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

Object.assign(window, { ExploreScreenV3, ExploreNotFoundV2 });
