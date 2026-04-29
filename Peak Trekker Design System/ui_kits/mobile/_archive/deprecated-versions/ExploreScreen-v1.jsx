// Explore — find a mountain. Vertical list of Mountain cards with filters.

const MOUNTAINS = [
  { id: 'yzf', name: '玉珠峰', region: '青海 · 格尔木', alt: 6178, dist: 12.4, dur: '6h', level: '中级及以上', levelTone: 'active', line: '进阶线', tone: 'sky' },
  { id: 'hbx', name: '哈巴雪山', region: '云南 · 香格里拉', alt: 5396, dist: 9.8, dur: '5h', level: '初级可进', line: '入门线', tone: 'cool' },
  { id: 'sgn', name: '四姑娘大峰', region: '四川 · 阿坝', alt: 5025, dist: 8.2, dur: '4h', level: '初级可进', line: '入门线', tone: 'warm' },
  { id: 'xbd', name: '雪宝顶', region: '四川 · 松潘', alt: 5588, dist: 11.0, dur: '6h', level: '中级及以上', levelTone: 'active', line: '进阶线', tone: 'cool' },
];

const FILTERS = ['全部', '入门线', '进阶线', '高级线', '<5000m', '5000–6000m', '>6000m'];

const ExploreScreen = ({ onPickMountain, onTab, onBack }) => {
  const [filter, setFilter] = React.useState('全部');
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 90 }}>
      <StatusBar />
      <TopBar title="探索" onBack={onBack} right={<IconButton round><PTIcons.search /></IconButton>} />

      {/* Search field */}
      <div style={{ padding: '4px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 14px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12 }}>
          <PTIcons.search />
          <input placeholder="搜山名、地区、海拔" style={{ flex: 1, background: 'none', border: 'none', color: PTColors.fg, outline: 'none', fontSize: 14, fontFamily: 'inherit' }} />
          <PTIcons.filter />
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px 8px', scrollbarWidth: 'none' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 12px', borderRadius: 999, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', flex: '0 0 auto',
            background: f === filter ? 'rgba(34,197,94,.14)' : 'rgba(255,255,255,.04)',
            color: f === filter ? PTColors.success : PTColors.fg2,
            border: f === filter ? `1px solid rgba(34,197,94,.26)` : '1px solid transparent',
          }}>{f}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ padding: '6px 16px', display: 'grid', gap: 12 }}>
        {MOUNTAINS.map(m => (
          <button key={m.id} onClick={() => onPickMountain && onPickMountain(m)} style={{ textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
            <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ position: 'relative' }}>
                <PhonePlaceholder h={150} tone={m.tone} label={m.name} />
                <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
                  <Chip tone={m.levelTone}>{m.level}</Chip>
                </div>
                <div style={{ position: 'absolute', top: 10, right: 10, padding: '5px 9px', borderRadius: 999, background: 'rgba(12,14,16,.75)', backdropFilter: 'blur(8px)', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 13, color: PTColors.success }}>
                  {m.alt.toLocaleString()}m
                </div>
              </div>
              <div style={{ padding: '10px 14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{m.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: PTColors.fg2 }}>{m.line}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: PTColors.fg2 }}>
                  <PTIcons.pin /><span>{m.region}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                  <div><div style={{ fontSize: 10, color: PTColors.fg2 }}>距离</div><div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, marginTop: 2 }}>{m.dist}km</div></div>
                  <div><div style={{ fontSize: 10, color: PTColors.fg2 }}>时长</div><div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, marginTop: 2 }}>{m.dur}</div></div>
                  <div><div style={{ fontSize: 10, color: PTColors.fg2 }}>难度</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{m.line.replace('线','')}</div></div>
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

window.ExploreScreen = ExploreScreen;
window.MOUNTAINS = MOUNTAINS;
