// Explore v2 + not-found state.
// v2: keeps the mountain-browsing core. Adds a parallel "import a result" entry near search.
// Not-found: helpful empty state with import / retry / stash actions.

const ExploreV2_MOUNTAINS = [
  { id: 'yzf', name: '玉珠峰', region: '青海 · 格尔木', alt: 6178, dist: 12.4, dur: '6h', level: '中级及以上', levelTone: 'active', line: '进阶线', tone: 'alpine' },
  { id: 'hbx', name: '哈巴雪山', region: '云南 · 香格里拉', alt: 5396, dist: 9.8, dur: '5h', level: '初级可进', line: '入门线', tone: 'slate' },
  { id: 'sgn', name: '四姑娘大峰', region: '四川 · 阿坝', alt: 5025, dist: 8.2, dur: '4h', level: '初级可进', line: '入门线', tone: 'dusk' },
  { id: 'xbd', name: '雪宝顶', region: '四川 · 松潘', alt: 5588, dist: 11.0, dur: '6h', level: '中级及以上', levelTone: 'active', line: '进阶线', tone: 'dawn' },
];
const EXPLORE_FILTERS = ['全部', '入门线', '进阶线', '高级线', '<5000m', '5000–6000m', '>6000m'];

const ImportEntryCard = ({ onClick }) => (
  <button onClick={onClick} style={{
    width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
    background: 'linear-gradient(180deg, rgba(34,197,94,.08) 0%, rgba(34,197,94,.02) 100%)',
    border: `1px solid rgba(34,197,94,.22)`, borderRadius: 14,
    padding: '12px 14px', display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center',
  }}>
    <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.14)', border: `1px solid rgba(34,197,94,.28)` }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 14V4M8 8l4-4 4 4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>已经走过了？把结果带回来</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>导入 GPX / FIT · 系统会自动匹配山</div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);

const ExploreScreenV2 = ({ onPickMountain, onTab, onBack, onImport }) => {
  const [filter, setFilter] = React.useState('全部');
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 90 }}>
      <StatusBar />
      <TopBar title="探索" onBack={onBack} right={<IconButton round><PTIcons.search /></IconButton>} />

      <div style={{ padding: '4px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 14px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12 }}>
          <PTIcons.search />
          <input placeholder="搜山名、地区、海拔" style={{ flex: 1, background: 'none', border: 'none', color: PTColors.fg, outline: 'none', fontSize: 14, fontFamily: 'inherit' }} />
          <PTIcons.filter />
        </div>
      </div>

      {/* Parallel import entry — sits between search and list. Same hierarchy weight, distinct color. */}
      <div style={{ padding: '0 16px 10px' }}>
        <ImportEntryCard onClick={onImport} />
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px 8px', scrollbarWidth: 'none' }}>
        {EXPLORE_FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 12px', borderRadius: 999, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', flex: '0 0 auto',
            background: f === filter ? 'rgba(34,197,94,.14)' : 'rgba(255,255,255,.04)',
            color: f === filter ? PTColors.success : PTColors.fg2,
            border: f === filter ? `1px solid rgba(34,197,94,.26)` : '1px solid transparent',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 16px', display: 'grid', gap: 12 }}>
        {ExploreV2_MOUNTAINS.map(m => (
          <button key={m.id} onClick={() => onPickMountain && onPickMountain(m)} style={{ textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
            <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ position: 'relative' }}>
                <PhonePlaceholder h={150} tone={m.tone} label={m.name} />
                <div style={{ position: 'absolute', top: 10, left: 10 }}><Chip tone={m.levelTone}>{m.level}</Chip></div>
                <div style={{ position: 'absolute', top: 10, right: 10, padding: '5px 9px', borderRadius: 999, background: 'rgba(12,14,16,.75)', backdropFilter: 'blur(8px)', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 13, color: PTColors.success }}>{m.alt.toLocaleString()}m</div>
              </div>
              <div style={{ padding: '10px 14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{m.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: PTColors.fg2 }}>{m.line}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: PTColors.fg2 }}>
                  <PTIcons.pin /><span>{m.region}</span>
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

const ExploreNotFound = ({ onBack, onTab, onImport, onRetry, onStash, query = '尕朵觉沃' }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 90 }}>
    <StatusBar />
    <TopBar title="探索" onBack={onBack} right={<IconButton round><PTIcons.search /></IconButton>} />

    <div style={{ padding: '4px 16px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 14px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12 }}>
        <PTIcons.search />
        <span style={{ flex: 1, fontSize: 14, color: PTColors.fg }}>{query}</span>
        <button style={{ background: 'none', border: 'none', color: PTColors.fg2, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>清除</button>
      </div>
    </div>

    {/* Calm empty illustration — single mono ridge */}
    <div style={{ padding: '30px 28px 8px', textAlign: 'center' }}>
      <svg width="120" height="64" viewBox="0 0 120 64" style={{ display: 'block', margin: '0 auto' }}>
        <path d="M0 56 L24 30 L40 42 L62 14 L82 36 L100 24 L120 44" stroke={PTColors.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="62" cy="14" r="3" fill={PTColors.fg2}/>
        <text x="62" y="62" textAnchor="middle" fontFamily="'IBM Plex Mono',monospace" fontSize="9" fill={PTColors.fg2} letterSpacing="2">— · —</text>
      </svg>
      <div style={{ fontSize: 16, fontWeight: 700, color: PTColors.fg, marginTop: 18 }}>没找到这座山</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 8, lineHeight: 1.65, maxWidth: 280, margin: '8px auto 0' }}>
        Peak Trekker 收录的山有限。<br/>
        如果你已经走过它，可以直接把结果带回来。
      </div>
    </div>

    {/* Primary recovery: import */}
    <div style={{ padding: '22px 16px 0' }}>
      <button onClick={onImport} style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: 'linear-gradient(180deg, rgba(34,197,94,.1) 0%, rgba(34,197,94,.02) 100%)',
        border: `1px solid rgba(34,197,94,.28)`, borderRadius: 14,
        padding: '14px 16px', display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center',
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.16)', border: `1px solid rgba(34,197,94,.32)` }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 14V4M8 8l4-4 4 4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>导入轨迹记录</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>GPX / FIT / 健康 App · 系统会尝试匹配最近的山</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>

    {/* Secondary tier */}
    <div style={{ padding: '10px 16px 0', display: 'grid', gap: 10 }}>
      <NotFoundRow icon={<PTIcons.search />} title="继续搜索" sub="试试拼音、英文名或所在区域" onClick={onRetry} />
      <NotFoundRow icon={<StashIcon />} title="暂存为未收录山行" sub="先手动声明结果 · 上线后我们尝试帮你认领" onClick={onStash} />
    </div>

    {/* Quiet aside */}
    <div style={{ padding: '22px 28px 0', fontSize: 11, color: PTColors.fg2, lineHeight: 1.7, textAlign: 'center' }}>
      也可以 <span style={{ color: PTColors.fg, textDecoration: 'underline', textUnderlineOffset: 2 }}>提交一座山的资料</span>，由志愿者审核后纳入收录。
    </div>

    <TabBar active="explore" onChange={onTab} />
  </div>
);

const NotFoundRow = ({ icon, title, sub, onClick }) => (
  <button onClick={onClick} style={{
    textAlign: 'left', padding: '12px 14px', border: `1px solid ${PTColors.outline}`,
    background: PTColors.surface, borderRadius: 14, cursor: 'pointer',
    display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center', fontFamily: 'inherit',
  }}>
    <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}` }}>{icon}</div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>{title}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>{sub}</div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);

const StashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M9 4h6l1 3H8z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M10 12h4" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

Object.assign(window, { ExploreScreenV2, ExploreNotFound });
