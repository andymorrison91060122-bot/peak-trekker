// Mountain Detail v2 — production decision page.
// Hierarchy: summit-status chip → mountain name → region → 4-stat row → 这座山适不适合你 → 关键点位 → weather (light) → bottom CTA (one primary).

const MountainDetailScreenV2 = ({ mountain, onBack, onRecord }) => {
  const m = mountain || {
    name: '玉珠峰', region: '青海 · 格尔木', alt: 6178,
    dist: 12.4, climb: 1240, dur: '6h', level: '中级及以上', line: '进阶线', tone: 'alpine',
    season: '10–11 月 推荐', license: '中级',
  };

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%' }}>
      {/* HERO — realistic photo placeholder, no cinematic glow */}
      <div style={{ position: 'relative' }}>
        <PhonePlaceholder h={300} tone={m.tone} label={m.name} />
        {/* Scrim: minimal — just enough to read the chips + title */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.55) 0%, rgba(12,14,16,.0) 40%, rgba(12,14,16,.88) 100%)' }} />
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

        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <Chip tone="active">{m.level}</Chip>
            <Chip>{m.line}</Chip>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.01em', lineHeight: 1.15 }}>{m.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'rgba(245,247,248,.72)' }}>
            <PTIcons.pin /><span>{m.region}</span>
          </div>
        </div>
      </div>

      {/* 4-STAT ROW — elevation first, bold, structured */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <StatTile label="海拔 m" value={m.alt.toLocaleString()} accent />
          <StatTile label="距离 km" value={m.dist} />
          <StatTile label="爬升 m" value={m.climb.toLocaleString()} />
          <StatTile label="时长" value={m.dur} />
        </div>
      </div>

      {/* DECISION BLOCK */}
      <SectionHeader>这座山适不适合你</SectionHeader>
      <div style={{ padding: '0 16px' }}>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
          <DecisionRow ok label="你的等级达到要求" sub={`你当前 中级 · 本山需要 ${m.license} 及以上`} />
          <DecisionRow ok label="季节窗口适合" sub={`${m.season} · 当前在窗口内`} />
          <DecisionRow warn label="天气参考仅供决策" sub="不承诺实时路况 · 出发前请自行复核" last />
        </div>
      </div>

      {/* WAYPOINTS */}
      <SectionHeader>关键点位与风险</SectionHeader>
      <div style={{ padding: '0 16px' }}>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '6px 0' }}>
          <Waypoint alt={4280} name="大本营" desc="宿营点 · 有水源" />
          <Waypoint alt={5100} name="C1 高营地" desc="岩坡切入 · 注意落石" warn />
          <Waypoint alt={5800} name="冰雪过渡带" desc="需结组 · 有裂缝风险" warn />
          <Waypoint alt={m.alt} name="山顶" desc="留证窗口 10 分钟" success last />
        </div>
      </div>

      {/* WEATHER — light decision support only */}
      <SectionHeader right="更新于 1 小时内">天气参考</SectionHeader>
      <div style={{ padding: '0 16px' }}>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
            {[
              { d: '周五', icon: '☁', t: '-4°', ok: true },
              { d: '周六', icon: '☀', t: '-2°', ok: true },
              { d: '周日', icon: '❄', t: '-9°', ok: false },
              { d: '周一', icon: '❄', t: '-11°', ok: false },
              { d: '周二', icon: '☀', t: '-3°', ok: true },
            ].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '4px 2px' }}>
                <div style={{ fontSize: 10, color: PTColors.fg2 }}>{d.d}</div>
                <div style={{ fontSize: 16, margin: '4px 0', color: d.ok ? PTColors.fg : PTColors.warn, opacity: .85 }}>{d.icon}</div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600 }}>{d.t}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 10, lineHeight: 1.5 }}>仅作决策参考 · Peak Trekker 不是专业天气产品</div>
        </div>
      </div>

      {/* Spacer for fixed CTA */}
      <div style={{ height: 120 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 26px', background: 'linear-gradient(180deg, rgba(18,20,22,0), rgba(18,20,22,.96) 30%)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10 }}>
          <SecondaryButton>查看路线</SecondaryButton>
          <PrimaryButton full onClick={onRecord}>开始记录</PrimaryButton>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ children, right }) => (
  <div style={{ padding: '18px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>{children}</div>
    {right && <div style={{ fontSize: 11, color: PTColors.fg2 }}>{right}</div>}
  </div>
);

const DecisionRow = ({ ok, warn, label, sub, last }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <div style={{ marginTop: 2 }}>{ok ? PTIcons.check() : warn ? <PTIcons.warn /> : PTIcons.check(PTColors.fg2)}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: PTColors.fg }}>{label}</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
    </div>
  </div>
);

const Waypoint = ({ alt, name, desc, warn, success, last }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '68px 16px 1fr', alignItems: 'flex-start', padding: '10px 14px', gap: 10 }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 13, color: success ? PTColors.success : PTColors.fg, paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>{alt.toLocaleString()}m</div>
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: success ? PTColors.success : warn ? PTColors.warn : PTColors.fg2, zIndex: 1 }} />
      {!last && <div style={{ position: 'absolute', top: 14, width: 1.5, height: 30, background: PTColors.outline }} />}
    </div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 3 }}>{desc}</div>
    </div>
  </div>
);

window.MountainDetailScreenV2 = MountainDetailScreenV2;
