// Mountain Detail — decision page, not brochure.

const MountainDetailScreen = ({ mountain, onBack, onRecord }) => {
  const m = mountain || { name: '玉珠峰', region: '青海 · 格尔木', alt: 6178, dist: 12.4, dur: '6h', level: '中级及以上', line: '进阶线', tone: 'sky' };

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%' }}>
      <div style={{ position: 'relative' }}>
        <PhonePlaceholder h={320} tone={m.tone} label={m.name + ' · PEAK'} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.35) 0%, rgba(12,14,16,0) 40%, rgba(12,14,16,.92))' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <StatusBar />
          <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between' }}>
            <IconButton round onClick={onBack}><PTIcons.back /></IconButton>
            <div style={{ display: 'flex', gap: 8 }}>
              <IconButton round><PTIcons.share /></IconButton>
              <IconButton round><PTIcons.more /></IconButton>
            </div>
          </div>
        </div>

        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <Chip tone="active">{m.level}</Chip>
            <Chip>{m.line}</Chip>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.01em' }}>{m.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13, color: 'rgba(245,247,248,.75)' }}>
            <PTIcons.pin /><span>{m.region}</span>
          </div>
        </div>
      </div>

      {/* Key stats — elevation always first */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <StatTile label="海拔 m" value={m.alt.toLocaleString()} accent />
          <StatTile label="距离 km" value={m.dist} />
          <StatTile label="爬升 m" value="1,240" />
          <StatTile label="时长" value={m.dur} />
        </div>
      </div>

      {/* Decision: 值不值得去 */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.06em', padding: '0 4px 10px' }}>这座山适不适合你</div>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
          <Row ok label="你的等级达到要求" sub="你当前为 中级 · 本山需要 中级 及以上" />
          <Row ok label="季节窗口适合" sub="10–11 月 为 玉珠峰 的推荐窗口" />
          <Row warn label="天气参考仅供决策" sub="不承诺实时路况 · 出发前请复核" />
        </div>
      </div>

      {/* Risk & route */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.06em', padding: '0 4px 10px' }}>关键点位与风险</div>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '4px 0' }}>
          <Waypoint alt={4280} name="大本营" desc="宿营点 · 有水源" />
          <Waypoint alt={5100} name="C1 高营地" desc="岩坡切入 · 注意落石" warn />
          <Waypoint alt={5800} name="冰雪过渡" desc="需结组 · 有裂缝风险" warn />
          <Waypoint alt={6178} name="山顶" desc="留证窗口 10 分钟" success last />
        </div>
      </div>

      {/* Fixed bottom CTA */}
      <div style={{ height: 120 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 26px', background: 'linear-gradient(180deg, rgba(18,20,22,0), rgba(18,20,22,.96) 28%)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10 }}>
          <SecondaryButton>查看路线</SecondaryButton>
          <PrimaryButton full onClick={onRecord}>开始记录</PrimaryButton>
        </div>
      </div>
    </div>
  );
};

const Row = ({ ok, warn, label, sub }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
    <div style={{ marginTop: 2 }}>{ok ? PTIcons.check() : warn ? <PTIcons.warn /> : PTIcons.check(PTColors.fg2)}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: PTColors.fg }}>{label}</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
    </div>
  </div>
);

const Waypoint = ({ alt, name, desc, warn, success, last }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '72px 18px 1fr', alignItems: 'flex-start', padding: '10px 14px', gap: 10 }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 14, color: success ? PTColors.success : PTColors.fg, paddingTop: 1 }}>{alt.toLocaleString()}m</div>
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: success ? PTColors.success : warn ? PTColors.warn : PTColors.fg2, border: '2px solid ' + PTColors.bg, zIndex: 1 }} />
      {!last && <div style={{ position: 'absolute', top: 12, width: 1.5, height: 28, background: PTColors.outline }} />}
    </div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 3 }}>{desc}</div>
    </div>
  </div>
);

window.MountainDetailScreen = MountainDetailScreen;
