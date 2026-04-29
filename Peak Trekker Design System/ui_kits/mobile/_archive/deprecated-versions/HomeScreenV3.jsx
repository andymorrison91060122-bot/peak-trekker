// Home v3 — 意图分流, with import path elevated to a real first-class entry.
// Differences vs v2:
//   - Section copy hints two valid starting points: 找一座山 / 把结果带回来
//   - Intent 02 ("把这次结果带回来") visually upgraded with sub-options (补签 · 留证 · 导入轨迹)
//   - Intent ordering kept stable so muscle-memory survives.

const HomeScreenV3 = ({ onTab, onGoExplore, onImport, onArchive }) => {
  const locked = { name: '玉珠峰', alt: 6178, region: '青海', countdown: '3 天后出发' };

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 90 }}>
      <StatusBar />
      <div style={{ padding: '6px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: PTColors.fg2 }}>今天</div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>从一座山开始，<br/>或把一次结果带回来。</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 999, background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center', color: PTColors.fg, fontSize: 13, fontWeight: 600 }}>陈</div>
      </div>

      {locked && (
        <div style={{ padding: '0 16px 4px' }}>
          <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ position: 'relative' }}>
              <PhonePlaceholder h={140} tone="alpine" label={locked.name} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.25) 0%, rgba(12,14,16,.0) 40%, rgba(12,14,16,.85))' }} />
              <div style={{ position: 'absolute', top: 10, left: 10 }}><Chip tone="active">● 已锁定目标</Chip></div>
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: PTColors.fg }}>{locked.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(245,247,248,.72)', marginTop: 3 }}>{locked.region} · {locked.countdown}</div>
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 700, color: PTColors.success }}>{locked.alt.toLocaleString()}m</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'center' }}>
              <SecondaryButton>详情</SecondaryButton>
              <PrimaryButton full>出发前复核</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '14px 20px 6px', fontSize: 12, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>接下来</div>

      <div style={{ padding: '0 16px', display: 'grid', gap: 10 }}>
        <IntentRowV3
          onClick={onGoExplore}
          n="01"
          title="去找下一座山"
          sub="基于你的等级与所在区域推荐"
          icon={<PTIcons.mountain active />}
        />

        {/* 02 — Bring back a result. Visually upgraded. */}
        <button onClick={onImport} style={{
          textAlign: 'left', padding: 0, border: `1px solid ${PTColors.outline}`,
          background: PTColors.surface, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 14px 12px', display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.1)', border: `1px solid rgba(34,197,94,.22)` }}>
              <ImportIcon />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 600, color: PTColors.fg2 }}>02</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: PTColors.fg }}>把这次结果带回来</div>
              </div>
              <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 3 }}>已经走过了 · 让它进入档案</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid ${PTColors.outline}` }}>
            <SubChoice icon={<TrackIcon />} label="导入轨迹" sub="GPX · FIT · 健康" />
            <SubChoice icon={<ProofIcon />} label="登顶留证" sub="补一张登顶照" border />
            <SubChoice icon={<ManualIcon />} label="手动补签" sub="只声明结果" />
          </div>
        </button>

        <IntentRowV3
          onClick={onArchive}
          n="03"
          title="我的 7 次山行"
          sub="哈巴雪山 · 四姑娘大峰 · 雪宝顶"
          icon={<PTIcons.me />}
        />
      </div>

      <TabBar active="explore" onChange={onTab} />
    </div>
  );
};

const IntentRowV3 = ({ n, title, sub, icon, onClick }) => (
  <button onClick={onClick} style={{
    textAlign: 'left', padding: '14px 14px', border: `1px solid ${PTColors.outline}`,
    background: PTColors.surface, borderRadius: 14, cursor: 'pointer',
    display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 12, alignItems: 'center', fontFamily: 'inherit',
  }}>
    <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}` }}>{icon}</div>
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 600, color: PTColors.fg2 }}>{n}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: PTColors.fg }}>{title}</div>
      </div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 3 }}>{sub}</div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);

const SubChoice = ({ icon, label, sub, border }) => (
  <div style={{ padding: '12px 8px', textAlign: 'center', borderLeft: border ? `1px solid ${PTColors.outline}` : 'none', borderRight: border ? `1px solid ${PTColors.outline}` : 'none' }}>
    <div style={{ display: 'grid', placeItems: 'center', height: 22 }}>{icon}</div>
    <div style={{ fontSize: 12, fontWeight: 600, color: PTColors.fg, marginTop: 6 }}>{label}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 2, letterSpacing: '.02em' }}>{sub}</div>
  </div>
);

const ImportIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 14V4M8 8l4-4 4 4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const TrackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M4 18 Q9 12 12 14 T20 6" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <circle cx="4" cy="18" r="1.6" fill={PTColors.fg}/><circle cx="20" cy="6" r="1.6" fill={PTColors.success}/>
  </svg>
);
const ProofIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke={PTColors.fg} strokeWidth="1.8"/>
    <circle cx="12" cy="13" r="3" stroke={PTColors.fg} strokeWidth="1.8"/>
  </svg>
);
const ManualIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M4 19l4-1 11-11-3-3L5 15z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
);

window.HomeScreenV3 = HomeScreenV3;
