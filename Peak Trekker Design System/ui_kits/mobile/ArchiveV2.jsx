// Archive / My Records v2 — private mountain-trip archive.
// Two states: populated | empty

const TRIPS = [
  { id: 't7', name: '玉珠峰', date: '2024·10·07', region: '青海', alt: 6178, dist: 12.4, climb: 1240, dur: '7h 12m', summit: 'summit', proof: 'confirmed', tone: 'alpine' },
  { id: 't6', name: '哈巴雪山', date: '2024·06·18', region: '云南', alt: 4980, dist: 9.8, climb: 1040, dur: '9h 28m', summit: 'partial', proof: 'partial', tone: 'slate' },
  { id: 't5', name: '四姑娘大峰', date: '2024·04·02', region: '四川', alt: 5025, dist: 11.2, climb: 1160, dur: '8h 04m', summit: 'summit', proof: 'confirmed', tone: 'dusk' },
  { id: 't4', name: '雪宝顶', date: '2023·10·11', region: '四川', alt: 5588, dist: 14.0, climb: 1420, dur: '10h 40m', summit: 'summit', proof: 'confirmed', tone: 'alpine' },
  { id: 't3', name: '那玛峰', date: '2023·08·24', region: '四川', alt: 5588, dist: 8.6, climb: 920, dur: '6h 52m', summit: 'partial', proof: 'partial', tone: 'dawn' },
  { id: 't2', name: '半脊峰', date: '2023·05·06', region: '四川', alt: 5430, dist: 10.4, climb: 1080, dur: '7h 48m', summit: 'summit', proof: 'confirmed', tone: 'slate' },
  { id: 't1', name: '二峰', date: '2022·11·19', region: '四川', alt: 5276, dist: 7.9, climb: 880, dur: '6h 20m', summit: 'summit', proof: 'manual', tone: 'dusk' },
];

// ---- Pieces ----

const ArchiveHeader = ({ onBack }) => (
  <div>
    <StatusBar />
    <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <IconButton round onClick={onBack}><PTIcons.back /></IconButton>
      <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>我的山行档案</div>
      <IconButton round><PTIcons.more /></IconButton>
    </div>
  </div>
);

const IdentityCard = () => (
  <div style={{ padding: '14px 16px 0' }}>
    <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: 999, background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, color: PTColors.fg }}>陈</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: PTColors.fg }}>陈沐之</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PTIcons.pin /><span>四川 · 成都</span></span>
            <span style={{ opacity: .3 }}>·</span>
            <Chip tone="active">中级</Chip>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, borderTop: `1px solid ${PTColors.outline}`, paddingTop: 14 }}>
        <SummaryStat label="山行" value="7" />
        <SummaryStat label="登顶" value="5" />
        <SummaryStat label="最高 m" value="6,178" accent />
      </div>
    </div>
  </div>
);

const SummaryStat = ({ label, value, accent }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 700, color: accent ? PTColors.success : PTColors.fg, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 5, letterSpacing: '.04em' }}>{label}</div>
  </div>
);

const FilterTabs = ({ active, onChange, counts }) => {
  const tabs = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'summit', label: '登顶', count: counts.summit },
    { id: 'proof', label: '已留证', count: counts.proof },
    { id: 'pending', label: '未留证', count: counts.pending },
  ];
  return (
    <div style={{ padding: '18px 16px 0' }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        {tabs.map(t => {
          const isActive = t.id === active;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{
              padding: '7px 12px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
              background: isActive ? PTColors.fg : 'transparent',
              color: isActive ? '#0A0C0E' : PTColors.fg2,
              border: isActive ? 'none' : `1px solid ${PTColors.outline}`,
              fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, opacity: .65 }}>{t.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const YearDivider = ({ year, count }) => (
  <div style={{ padding: '22px 20px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.01em' }}>{year}</div>
    <div style={{ fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>{count} 次山行</div>
  </div>
);

const TripCard = ({ t, onOpen }) => (
  <button onClick={() => onOpen && onOpen(t)} style={{ display: 'block', width: '100%', padding: 0, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
    <div style={{ position: 'relative' }}>
      <PhonePlaceholder h={140} tone={t.tone} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.35) 0%, rgba(12,14,16,0) 35%, rgba(12,14,16,.82))' }} />
      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
        {t.summit === 'summit'
          ? <Chip tone="success">● 已登顶</Chip>
          : <Chip tone="warn">● 未登顶</Chip>}
      </div>
      <div style={{ position: 'absolute', top: 10, right: 10 }}>
        {t.proof === 'confirmed' && <Chip>● 留证</Chip>}
        {t.proof === 'partial' && <Chip tone="warn">● 部分留证</Chip>}
        {t.proof === 'manual' && <Chip>● 补签</Chip>}
      </div>
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: PTColors.fg, letterSpacing: '-.005em' }}>{t.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(245,247,248,.72)', marginTop: 3, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.04em' }}>{t.date} · {t.region}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 19, fontWeight: 800, color: PTColors.success, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{t.alt.toLocaleString()}<span style={{ fontSize: 11, color: 'rgba(110,231,161,.7)', marginLeft: 2 }}>m</span></div>
        </div>
      </div>
    </div>
    <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, borderTop: `1px solid ${PTColors.outline}` }}>
      <MiniStat label="距离" value={`${t.dist}km`} />
      <MiniStat label="爬升" value={`${t.climb.toLocaleString()}m`} />
      <MiniStat label="用时" value={t.dur} />
    </div>
  </button>
);

const MiniStat = ({ label, value }) => (
  <div>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, color: PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 2 }}>{label}</div>
  </div>
);

// ---- Screens ----

const ArchiveV2 = ({ onBack, onOpenTrip }) => {
  const [active, setActive] = React.useState('all');
  const filtered = TRIPS.filter(t =>
    active === 'all' ? true :
    active === 'summit' ? t.summit === 'summit' :
    active === 'proof' ? t.proof === 'confirmed' :
    active === 'pending' ? t.proof !== 'confirmed' : true
  );
  const counts = {
    all: TRIPS.length,
    summit: TRIPS.filter(t => t.summit === 'summit').length,
    proof: TRIPS.filter(t => t.proof === 'confirmed').length,
    pending: TRIPS.filter(t => t.proof !== 'confirmed').length,
  };
  const byYear = filtered.reduce((acc, t) => {
    const y = t.date.split('·')[0].trim();
    (acc[y] = acc[y] || []).push(t);
    return acc;
  }, {});
  const years = Object.keys(byYear).sort().reverse();

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 24 }}>
      <ArchiveHeader onBack={onBack} />
      <IdentityCard />
      <FilterTabs active={active} onChange={setActive} counts={counts} />
      {years.map(y => (
        <div key={y}>
          <YearDivider year={y} count={byYear[y].length} />
          <div style={{ padding: '0 16px', display: 'grid', gap: 12 }}>
            {byYear[y].map(t => <TripCard key={t.id} t={t} onOpen={onOpenTrip} />)}
          </div>
        </div>
      ))}
      <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 10, color: PTColors.fg2, letterSpacing: '.2em', fontFamily: "'IBM Plex Mono',monospace" }}>· 档案结束 ·</div>
    </div>
  );
};

const ArchiveV2Empty = ({ onBack, onFindMountain, onBringBack }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 24 }}>
    <ArchiveHeader onBack={onBack} />
    <IdentityCardEmpty />
    <div style={{ padding: '28px 24px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 16, padding: '26px 20px', textAlign: 'center' }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: '.22em', color: PTColors.fg2, fontWeight: 600 }}>0 / 0</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: PTColors.fg, marginTop: 12, lineHeight: 1.35 }}>档案还没有一次山行</div>
        <div style={{ fontSize: 13, color: PTColors.fg2, marginTop: 8, lineHeight: 1.6 }}>去一次真实的山，回来把它放进这里。</div>
        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          <PrimaryButton full onClick={onFindMountain}>去找一座山</PrimaryButton>
          <SecondaryButton full onClick={onBringBack}>把以前的山行带回来</SecondaryButton>
        </div>
      </div>
    </div>
    <div style={{ padding: '20px 28px 0', fontSize: 11, color: PTColors.fg2, lineHeight: 1.7, textAlign: 'center' }}>
      档案只保存 <span style={{ color: PTColors.fg, fontWeight: 600 }}>自己</span> 的山行记录。<br/>
      想发到山友圈时再发 · Peak Trekker 不会替你声张。
    </div>
  </div>
);

const IdentityCardEmpty = () => (
  <div style={{ padding: '14px 16px 0' }}>
    <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 46, height: 46, borderRadius: 999, background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, color: PTColors.fg }}>陈</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: PTColors.fg }}>陈沐之</div>
        <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PTIcons.pin /><span>四川 · 成都</span></span>
          <span style={{ opacity: .3 }}>·</span>
          <Chip>新人</Chip>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { ArchiveV2, ArchiveV2Empty });
