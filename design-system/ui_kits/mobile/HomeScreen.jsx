// Home — 意图分流 (find next / bring back result / review archive)

const HomeScreen = ({ onTab, onGoExplore }) => {
  const upcoming = { name: '玉珠峰', alt: 6178, region: '青海', countdown: '3 天 · 已锁定' };
  const archive = { total: 7, peaks: ['哈巴雪山', '四姑娘大峰', '雪宝顶'] };

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 90 }}>
      <StatusBar />
      <div style={{ padding: '10px 20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: PTColors.fg2 }}>今天</div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25, marginTop: 2 }}>想去哪座山。</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 999, background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center', color: PTColors.fg, fontSize: 13, fontWeight: 600 }}>陈</div>
      </div>

      {/* Intent cards */}
      <div style={{ padding: '16px 16px 0', display: 'grid', gap: 10 }}>
        <button onClick={onGoExplore} style={{ textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: `1px solid ${PTColors.outline}` }}>
            <PhonePlaceholder h={140} tone="cool" />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.0) 35%, rgba(12,14,16,.82))' }} />
            <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: PTColors.success, letterSpacing: '.05em' }}>1 · 找下一座山</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: PTColors.fg }}>去找下一座山</div>
              <div style={{ fontSize: 12, color: 'rgba(245,247,248,.75)', marginTop: 4 }}>基于你当前等级与所在区域，推荐合适的山</div>
            </div>
          </div>
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ padding: 14, borderRadius: 14, background: PTColors.surface, border: `1px solid ${PTColors.outline}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: PTColors.fg2 }}>2 · 结果带回</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6, color: PTColors.fg }}>把这次结果{'\n'}带回来</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 8, lineHeight: 1.4 }}>补签 · 留证 · 导入轨迹</div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, background: PTColors.surface, border: `1px solid ${PTColors.outline}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: PTColors.fg2 }}>3 · 回看</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6, color: PTColors.fg }}>我的 {archive.total} 次山行</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 8, lineHeight: 1.4 }}>{archive.peaks.join(' · ')}</div>
          </div>
        </div>
      </div>

      {/* Upcoming lock */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 12, color: PTColors.fg2, padding: '0 4px 8px' }}>已锁定目标</div>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ position: 'relative' }}>
            <PhonePlaceholder h={132} tone="sky" label="玉珠峰 · YUZHU FENG" />
            <div style={{ position: 'absolute', top: 10, left: 10 }}><Chip tone="active">已锁定</Chip></div>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{upcoming.name}</div>
                <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{upcoming.region} · {upcoming.countdown}</div>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 17, fontWeight: 700, color: PTColors.success }}>{upcoming.alt.toLocaleString()}m</div>
            </div>
            <div style={{ marginTop: 10 }}>
              <AltitudeBar value={upcoming.alt} label="海拔" />
            </div>
          </div>
        </div>
      </div>

      <TabBar active="explore" onChange={onTab} />
    </div>
  );
};

window.HomeScreen = HomeScreen;
