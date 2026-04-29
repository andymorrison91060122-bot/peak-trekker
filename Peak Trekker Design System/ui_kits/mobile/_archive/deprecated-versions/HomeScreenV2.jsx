// Home v2 — 意图分流. Three equal-weight intents, one primary CTA (锁定目标 when present).

const HomeScreenV2 = ({ onTab, onGoExplore }) => {
  const locked = { name: '玉珠峰', alt: 6178, region: '青海', countdown: '3 天后出发' };

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 90 }}>
      <StatusBar />
      {/* Header — quiet, no hero imagery here */}
      <div style={{ padding: '6px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: PTColors.fg2 }}>今天</div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>想去哪座山。</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 999, background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center', color: PTColors.fg, fontSize: 13, fontWeight: 600 }}>陈</div>
      </div>

      {/* LOCKED TARGET — if present, owns the primary CTA slot */}
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

      {/* INTENT SPLIT — three equal-weight rows */}
      <div style={{ padding: '14px 20px 6px', fontSize: 12, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>接下来</div>
      <div style={{ padding: '0 16px', display: 'grid', gap: 10 }}>
        <IntentRow
          onClick={onGoExplore}
          n="01"
          title="去找下一座山"
          sub="基于你的等级与所在区域推荐"
          icon={<PTIcons.mountain active />}
        />
        <IntentRow
          n="02"
          title="把这次结果带回来"
          sub="补签 · 留证 · 导入轨迹"
          icon={<PTIcons.camera />}
        />
        <IntentRow
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

const IntentRow = ({ n, title, sub, icon, onClick }) => (
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

window.HomeScreenV2 = HomeScreenV2;
