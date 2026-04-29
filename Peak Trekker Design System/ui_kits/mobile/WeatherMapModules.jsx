// Weather + Map modules. Standalone, embeddable in any host screen.
// Exposes the modules + showcase frames that put them in their proper context.
//
// Modules
//   <WeatherBlock state="live|stale|unavailable" />        — Mountain Detail weather
//   <RouteSnapshotMap state="ok|stale|unavailable" />       — Mountain Detail route map
//   <ActivityRouteMap />                                   — Activity Detail completed route
//   <TrekReferenceMap progress weak offline />             — Trek lightweight reference
//
// Showcase frames (full phones)
//   MountainDetailWithModules, MountainDetailWeatherUnavailable,
//   MountainDetailWeatherStale, MountainDetailRouteUnavailable,
//   MountainDetailRouteFallback, ActivityDetailRouteOnly,
//   TrekReferenceShowcase

// ────────────────────────────────────────────────────────────
//  Shared atoms (only what's needed locally — most live in Primitives)
// ────────────────────────────────────────────────────────────

const ModSectionHeader = ({ children, right }) => (
  <div style={{ padding: '18px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>{children}</div>
    {right && <div style={{ fontSize: 11, color: PTColors.fg2 }}>{right}</div>}
  </div>
);

// Two-line "for reference only" footer — used across modules so the disclaimer reads identically.
const ReferenceFootnote = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '8px 10px', borderTop: `1px solid ${PTColors.outline}`, fontSize: 11, color: PTColors.fg2, lineHeight: 1.5 }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke={PTColors.fg2} strokeWidth="1.6"/>
      <path d="M12 8v5M12 16.5v.5" stroke={PTColors.fg2} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
    <span>{children}</span>
  </div>
);

// ────────────────────────────────────────────────────────────
//  A. WeatherBlock  — Mountain Detail
// ────────────────────────────────────────────────────────────

const WeatherIcon = ({ kind, size = 22, tone = PTColors.fg }) => {
  const s = { width: size, height: size, display: 'block' };
  if (kind === 'sun')   return <svg viewBox="0 0 24 24" fill="none" style={s}><circle cx="12" cy="12" r="4" stroke={tone} strokeWidth="1.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" stroke={tone} strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (kind === 'cloud') return <svg viewBox="0 0 24 24" fill="none" style={s}><path d="M7 17h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1A4 4 0 0 0 7 17z" stroke={tone} strokeWidth="1.6" strokeLinejoin="round"/></svg>;
  if (kind === 'snow')  return <svg viewBox="0 0 24 24" fill="none" style={s}><path d="M12 3v18M5 7l14 10M5 17l14-10" stroke={tone} strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (kind === 'wind')  return <svg viewBox="0 0 24 24" fill="none" style={s}><path d="M4 9h11a2.5 2.5 0 1 0-2.5-2.5M3 14h15a2.5 2.5 0 1 1-2.5 2.5M3 12h12" stroke={tone} strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (kind === 'rain')  return <svg viewBox="0 0 24 24" fill="none" style={s}><path d="M7 14h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1A4 4 0 0 0 7 14z" stroke={tone} strokeWidth="1.6"/><path d="M9 18l-1 2M14 18l-1 2M18 18l-1 2" stroke={tone} strokeWidth="1.6" strokeLinecap="round"/></svg>;
  return null;
};

const HourBar = ({ data }) => {
  // little bar chart of temps, axis-less
  const min = Math.min(...data.map(d => d.t));
  const max = Math.max(...data.map(d => d.t));
  const span = Math.max(1, max - min);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 4, alignItems: 'end', height: 56, padding: '0 4px' }}>
      {data.map((d, i) => {
        const h = 14 + ((d.t - min) / span) * 36;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: PTColors.fg2, fontVariantNumeric: 'tabular-nums' }}>{d.t}°</span>
            <div style={{ width: 6, height: h, borderRadius: 3, background: d.warn ? 'linear-gradient(180deg,#F59E0B,#5b3905)' : 'linear-gradient(180deg,#6EE7A1,#1d6e3f)', opacity: d.warn ? 0.9 : 0.85 }}/>
          </div>
        );
      })}
    </div>
  );
};

const KPIRow = ({ items }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length},1fr)`, gap: 8 }}>
    {items.map((it, i) => (
      <div key={i} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${PTColors.outline}`, borderRadius: 10, padding: '10px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: PTColors.fg2 }}>
          {it.icon}<span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>{it.label}</span>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, marginTop: 6, color: it.tone || PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
        {it.sub && <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 2 }}>{it.sub}</div>}
      </div>
    ))}
  </div>
);

const WeatherBlock = ({ state = 'live' }) => {
  // ── unavailable ────────────────────────────────────────
  if (state === 'unavailable') {
    return (
      <ModuleShell title="天气参考" right="数据源 · 不可用">
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, margin: '0 auto 10px', display: 'grid', placeItems: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 17h11a3.5 3.5 0 0 0 1-6.9M3 3l18 18" stroke={PTColors.fg2} strokeWidth="1.6" strokeLinecap="round"/></svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>天气暂时拿不到</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 6, lineHeight: 1.6 }}>区域气象点没有响应，<br/>出发前请通过其他渠道复核。</div>
          <div style={{ marginTop: 12 }}>
            <button style={{ padding: '8px 14px', background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, borderRadius: 10, color: PTColors.fg, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>重试</button>
          </div>
        </div>
      </ModuleShell>
    );
  }

  // ── stale ──────────────────────────────────────────────
  const stale = state === 'stale';
  const updateText = stale ? '更新于 6 小时前' : '更新于 12 分钟前';
  const headerTone = stale ? PTColors.warn : PTColors.fg2;

  const hourly = [
    { h: '04', t: -7, warn: true }, { h: '06', t: -5 }, { h: '08', t: -3 }, { h: '10', t: -1 },
    { h: '12', t: 1 }, { h: '14', t: 2 }, { h: '16', t: 1 }, { h: '18', t: -2 },
  ];

  return (
    <ModuleShell title="天气参考" right={
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: headerTone, fontSize: 11 }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: stale ? PTColors.warn : PTColors.success }}/>
        {updateText}
      </span>
    }>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 14px 4px', position: 'relative', overflow: 'hidden' }}>
        {stale && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(245,158,11,.05), transparent)' }}/>
        )}

        {/* current row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>
            <WeatherIcon kind="cloud" tone={PTColors.fg} size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>-3°</span>
              <span style={{ fontSize: 12, color: PTColors.fg2 }}>体感 -8°</span>
            </div>
            <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 2 }}>大本营 · 多云间晴 · 4280m</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.06em' }}>窗口</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: stale ? PTColors.warn : PTColors.success, marginTop: 2 }}>{stale ? '需复核' : '可出发'}</div>
          </div>
        </div>

        {/* hourly */}
        <div style={{ marginTop: 14 }}>
          <HourBar data={hourly} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hourly.length}, 1fr)`, gap: 4, marginTop: 4, padding: '0 4px' }}>
            {hourly.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: PTColors.fg2 }}>{d.h}</div>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ marginTop: 14 }}>
          <KPIRow items={[
            { label: '风', icon: <WeatherIcon kind="wind" size={12} tone={PTColors.fg2}/>, value: '6 级', sub: '阵风 7 级', tone: PTColors.warn },
            { label: '降水', icon: <WeatherIcon kind="rain" size={12} tone={PTColors.fg2}/>, value: '12%' },
            { label: '能见度', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke={PTColors.fg2} strokeWidth="1.6"/></svg>, value: '8 km' },
          ]}/>
        </div>

        {/* risk note */}
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: stale ? 'rgba(245,158,11,.08)' : 'rgba(245,158,11,.06)', border: `1px solid ${stale ? 'rgba(245,158,11,.32)' : 'rgba(245,158,11,.18)'}`, display: 'grid', gridTemplateColumns: '16px 1fr', gap: 10, alignItems: 'flex-start' }}>
          <PTIcons.warn />
          <div style={{ fontSize: 12, color: PTColors.fg, lineHeight: 1.55 }}>
            <strong style={{ fontWeight: 700 }}>{stale ? '数据已 6 小时未更新' : '阵风偏大'}</strong>
            <span style={{ color: PTColors.fg2 }}>
              {stale
                ? ' · 出发前请通过其他渠道复核当前状况。'
                : ' · 山顶段建议提早出发，避开 14:00 后窗口。'}
            </span>
          </div>
        </div>

        <ReferenceFootnote>仅作决策参考 · Peak Trekker 不是专业天气产品</ReferenceFootnote>
      </div>
    </ModuleShell>
  );
};

const ModuleShell = ({ title, right, children }) => (
  <>
    <ModSectionHeader right={right}>{title}</ModSectionHeader>
    <div style={{ padding: '0 16px' }}>{children}</div>
  </>
);

// ────────────────────────────────────────────────────────────
//  B. RouteSnapshotMap — Mountain Detail (lightweight reference map)
// ────────────────────────────────────────────────────────────
//  Static topographic-feel render: contour rings + dotted reference route +
//  named waypoints. NO compass, NO scale bar, NO interactive controls. Reads
//  as "this is roughly the route" — never as live navigation.

const TopoMap = ({ height = 180, route = 'reference', summit = true, dim = false }) => (
  <svg width="100%" height={height} viewBox="0 0 343 180" preserveAspectRatio="none" style={{ display: 'block', opacity: dim ? 0.55 : 1 }}>
    <defs>
      <radialGradient id="topoCenter" cx="62%" cy="42%" r="55%">
        <stop offset="0%" stopColor="#22272d"/>
        <stop offset="100%" stopColor="#171b1f"/>
      </radialGradient>
      <linearGradient id="routeShade" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor="#6EE7A1" stopOpacity="0.8"/>
        <stop offset="100%" stopColor="#22C55E" stopOpacity="0.95"/>
      </linearGradient>
    </defs>
    <rect width="343" height="180" fill="url(#topoCenter)"/>
    {/* contour rings — concentric ellipses around summit */}
    {[...Array(8)].map((_, i) => (
      <ellipse key={i}
        cx="212" cy="76"
        rx={26 + i * 20} ry={14 + i * 11}
        stroke={`rgba(141,149,155,${0.32 - i * 0.03})`} strokeWidth="1" fill="none"
      />
    ))}
    {/* secondary ridge */}
    <path d="M0 158 Q60 132 100 138 T180 122 T260 110 T343 98" stroke="rgba(141,149,155,.18)" strokeWidth="1" fill="none"/>
    <path d="M0 174 Q70 152 120 156 T220 140 T343 128" stroke="rgba(141,149,155,.12)" strokeWidth="1" fill="none"/>

    {/* the route */}
    {route === 'reference' && <>
      <path d="M30 156 Q70 138 100 130 T160 108 T200 88 L212 76"
        stroke="url(#routeShade)" strokeWidth="2.4" strokeDasharray="2 5"
        fill="none" strokeLinecap="round"/>
      {/* waypoints */}
      <circle cx="30" cy="156" r="5" fill={PTColors.fg}/>
      <circle cx="100" cy="130" r="4" fill="#0A0C0E" stroke={PTColors.fg2} strokeWidth="1.5"/>
      <circle cx="160" cy="108" r="4" fill="#0A0C0E" stroke={PTColors.warn} strokeWidth="1.5"/>
      {/* summit */}
      {summit && <>
        <path d="M204 80 L212 64 L220 80 Z" fill={PTColors.success}/>
        <circle cx="212" cy="76" r="11" fill="none" stroke={PTColors.success} strokeOpacity=".4" strokeWidth="1.2"/>
      </>}
    </>}
  </svg>
);

const MapWaypointStrip = ({ items }) => (
  <div style={{ display: 'flex', gap: 6, padding: '12px 14px 14px', overflowX: 'auto', scrollbarWidth: 'none' }}>
    {items.map((w, i) => (
      <div key={i} style={{ flex: '0 0 auto', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.03)', border: `1px solid ${PTColors.outline}`, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: w.tone === 'success' ? PTColors.success : w.tone === 'warn' ? PTColors.warn : PTColors.fg2 }}/>
        <span style={{ fontSize: 11, fontWeight: 600, color: PTColors.fg }}>{w.name}</span>
        <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: PTColors.fg2 }}>{w.alt}m</span>
      </div>
    ))}
  </div>
);

const RouteSnapshotMap = ({ state = 'ok', onExpand }) => {
  if (state === 'unavailable') {
    return (
      <ModuleShell title="路线参考" right="离线 · 不可用">
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, margin: '0 auto 10px', display: 'grid', placeItems: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM3 3l18 18" stroke={PTColors.fg2} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>路线参考图暂时不可用</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 6, lineHeight: 1.6 }}>地图服务没有响应 · 你仍可以查看关键点位与海拔信息。</div>
        </div>
      </ModuleShell>
    );
  }

  if (state === 'fallback') {
    return (
      <ModuleShell title="路线参考" right="仅文字版本">
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 14px 6px' }}>
          {[
            { alt: 4280, name: '大本营 → C1', desc: '碎石坡，约 3 小时', tone: 'fg' },
            { alt: 5100, name: 'C1 → 冰雪过渡', desc: '需结组，注意落石', tone: 'warn' },
            { alt: 5800, name: '过渡带 → 顶峰', desc: '裂缝多，结组前行', tone: 'warn' },
          ].map((s, i, arr) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${PTColors.outline}`, display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: s.tone === 'warn' ? PTColors.warn : PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{s.alt}m</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>{s.name}</div>
                <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
          <ReferenceFootnote>没有缓存到底图 · 仅展示路线分段说明</ReferenceFootnote>
        </div>
      </ModuleShell>
    );
  }

  // ok
  return (
    <ModuleShell title="路线参考" right={
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: PTColors.fg2, fontSize: 11 }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: PTColors.fg2 }}/>静态参考图
      </span>
    }>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          <TopoMap height={180} />
          {/* top-left chip */}
          <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', gap: 6 }}>
            <span style={{
              padding: '4px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
              background: 'rgba(12,14,16,.7)', backdropFilter: 'blur(8px)', color: PTColors.fg2, letterSpacing: '.05em',
            }}>仅参考路线</span>
          </div>
          {/* expand */}
          {onExpand && (
            <button onClick={onExpand} style={{
              position: 'absolute', right: 10, top: 10, padding: '6px 10px', borderRadius: 8,
              background: 'rgba(12,14,16,.7)', backdropFilter: 'blur(8px)',
              border: `1px solid ${PTColors.outline}`, color: PTColors.fg, fontSize: 11, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              放大
            </button>
          )}
          {/* summit label */}
          <div style={{ position: 'absolute', right: 16, top: 50, fontSize: 10, color: PTColors.success, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, letterSpacing: '.05em' }}>顶峰 6,178m</div>
        </div>
        <MapWaypointStrip items={[
          { name: '大本营', alt: 4280, tone: 'default' },
          { name: 'C1', alt: 5100, tone: 'default' },
          { name: '过渡带', alt: 5800, tone: 'warn' },
          { name: '山顶', alt: 6178, tone: 'success' },
        ]}/>
        <div style={{ padding: '0 14px 12px' }}>
          <ReferenceFootnote>仅作路线示意 · 不是导航地图，山区请以现场判断为准</ReferenceFootnote>
        </div>
      </div>
    </ModuleShell>
  );
};

// ────────────────────────────────────────────────────────────
//  C. ActivityRouteMap — Activity Detail completed-route preview
// ────────────────────────────────────────────────────────────
//  Reads as a clean review of what was actually walked. Topo + solid green
//  trace + start/summit/end markers + 3-stat strip below.

const ActivityRouteMap = ({ stats = { dist: '12.4 km', dur: '7h 12m', max: '6,178 m' }, onExpand }) => (
  <ModuleShell title="走过的路线" right="完整轨迹">
    <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ position: 'relative' }}>
        <svg width="100%" height="200" viewBox="0 0 343 200" preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <radialGradient id="actMapBg" cx="58%" cy="38%" r="60%">
              <stop offset="0%" stopColor="#22272d"/>
              <stop offset="100%" stopColor="#15191c"/>
            </radialGradient>
            <linearGradient id="actTrace" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#22C55E"/>
              <stop offset="100%" stopColor="#6EE7A1"/>
            </linearGradient>
          </defs>
          <rect width="343" height="200" fill="url(#actMapBg)"/>
          {/* contour rings */}
          {[...Array(7)].map((_, i) => (
            <ellipse key={i} cx="200" cy="86" rx={28 + i * 22} ry={16 + i * 12}
              stroke={`rgba(141,149,155,${0.28 - i * 0.025})`} strokeWidth="1" fill="none"/>
          ))}
          {/* completed trace — solid */}
          <path d="M30 168 Q70 152 100 144 T160 122 T196 90 L200 86 L208 90 Q220 110 240 132 T300 168"
            stroke="url(#actTrace)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          {/* start */}
          <circle cx="30" cy="168" r="6" fill={PTColors.fg}/>
          <text x="40" y="172" fontFamily="'IBM Plex Mono',monospace" fontSize="9" fill={PTColors.fg2}>起</text>
          {/* end */}
          <circle cx="300" cy="168" r="6" fill={PTColors.fg2}/>
          <text x="278" y="172" fontFamily="'IBM Plex Mono',monospace" fontSize="9" fill={PTColors.fg2}>回营</text>
          {/* summit */}
          <path d="M192 78 L200 60 L208 78 Z" fill={PTColors.success}/>
          <circle cx="200" cy="74" r="11" fill="none" stroke={PTColors.success} strokeOpacity=".5" strokeWidth="1.4"/>
          <text x="172" y="46" fontFamily="'IBM Plex Mono',monospace" fontSize="10" fontWeight="700" fill={PTColors.success}>山顶 · 13:24</text>
        </svg>
        <div style={{ position: 'absolute', left: 10, top: 10 }}>
          <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: 'rgba(12,14,16,.7)', backdropFilter: 'blur(8px)', color: PTColors.fg2 }}>完成轨迹</span>
        </div>
        {onExpand && (
          <button onClick={onExpand} style={{
            position: 'absolute', right: 10, top: 10, padding: '6px 10px', borderRadius: 8,
            background: 'rgba(12,14,16,.7)', backdropFilter: 'blur(8px)',
            border: `1px solid ${PTColors.outline}`, color: PTColors.fg, fontSize: 11, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            放大
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid ${PTColors.outline}` }}>
        {[
          { label: '总距离', value: stats.dist },
          { label: '用时', value: stats.dur },
          { label: '最高点', value: stats.max, accent: true },
        ].map((s, i, arr) => (
          <div key={i} style={{ padding: '12px 10px', textAlign: 'center', borderRight: i === arr.length - 1 ? 'none' : `1px solid ${PTColors.outline}` }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: s.accent ? PTColors.success : PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  </ModuleShell>
);

// ────────────────────────────────────────────────────────────
//  D. TrekReferenceMap — refined Trek lightweight reference
// ────────────────────────────────────────────────────────────
//  Smaller (140px) than the metrics stack above it. Always behind a chip
//  that says "地图仅作参考" so the user never confuses it with navigation.

const TrekReferenceMap = ({ progress = 0.48, weak, offline, height = 140 }) => (
  <div style={{ margin: '14px 16px 0' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>位置参考</div>
      <div style={{ fontSize: 11, color: PTColors.fg2 }}>海拔与进度仍是主要信息</div>
    </div>
    <div style={{ height, borderRadius: 14, border: `1px solid ${PTColors.outline}`, overflow: 'hidden', position: 'relative', background: '#171b1f' }}>
      <svg width="100%" height="100%" viewBox="0 0 343 140" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: offline ? 0.4 : 1 }}>
        {/* contour rings, lighter than the static topo */}
        {[...Array(6)].map((_, i) => (
          <ellipse key={i} cx={210} cy={64} rx={24 + i * 22} ry={14 + i * 10} stroke={`rgba(141,149,155,${0.28 - i * 0.035})`} strokeWidth="1" fill="none"/>
        ))}
        {/* faint full reference route */}
        <path d="M22 118 Q70 100 110 92 T180 76 T250 50 L260 38" stroke="rgba(141,149,155,.34)" strokeWidth="1.4" strokeDasharray="2 4" fill="none"/>
        {/* completed-so-far portion solid */}
        <path d={`M22 118 Q70 100 110 92 T${110 + progress * 150} ${92 - progress * 44}`} stroke={PTColors.success} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
        {/* current dot */}
        <circle cx={110 + progress * 150} cy={92 - progress * 44} r="6" fill={PTColors.success}/>
        <circle cx={110 + progress * 150} cy={92 - progress * 44} r="11" fill="none" stroke={PTColors.success} strokeOpacity="0.32" strokeWidth="2"/>
        {/* summit glyph */}
        <path d="M252 42 L260 26 L268 42 Z" fill={PTColors.fg} opacity="0.75"/>
      </svg>
      {/* chip */}
      <div style={{ position: 'absolute', left: 10, top: 10 }}>
        <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: 'rgba(12,14,16,.72)', backdropFilter: 'blur(8px)', color: PTColors.fg2, letterSpacing: '.05em' }}>地图仅作参考</span>
      </div>
      {/* progress mono */}
      <div style={{ position: 'absolute', right: 10, top: 10, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: PTColors.fg2, padding: '4px 8px', borderRadius: 8, background: 'rgba(12,14,16,.72)' }}>
        {Math.round(progress * 100)}% / 顶峰
      </div>
      {weak && (
        <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, background: 'rgba(245,158,11,.18)', border: '1px solid rgba(245,158,11,.32)', color: PTColors.warn, fontSize: 10, fontWeight: 700 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: PTColors.warn }}/>GPS 弱 · 位置可能延迟
        </div>
      )}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────
//  Showcase frames — embed modules in their host phones
// ────────────────────────────────────────────────────────────

const MountainDetailHostScroll = ({ children }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <div style={{ position: 'relative' }}>
      <PhonePlaceholder h={220} tone="alpine" label="玉珠峰" />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.55) 0%, rgba(12,14,16,.0) 40%, rgba(12,14,16,.88) 100%)' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <StatusBar />
        <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between' }}>
          <IconButton round><PTIcons.back /></IconButton>
          <div style={{ display: 'flex', gap: 8 }}>
            <IconButton round><PTIcons.share /></IconButton>
            <IconButton round><PTIcons.more /></IconButton>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <Chip tone="active">中级及以上</Chip>
          <Chip>进阶线</Chip>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.01em' }}>玉珠峰</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: 'rgba(245,247,248,.72)' }}>
          <PTIcons.pin /><span>青海 · 格尔木</span>
        </div>
      </div>
    </div>
    {children}
    <div style={{ height: 28 }}/>
  </div>
);

const MountainDetailWithModules = () => (
  <MountainDetailHostScroll>
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <StatTile label="海拔 m" value="6,178" accent />
        <StatTile label="距离 km" value="12.4" />
        <StatTile label="爬升 m" value="1,240" />
        <StatTile label="时长" value="6h" />
      </div>
    </div>
    <WeatherBlock state="live" />
    <RouteSnapshotMap state="ok" onExpand={() => {}} />
  </MountainDetailHostScroll>
);

const MountainDetailWeatherUnavailable = () => (
  <MountainDetailHostScroll>
    <WeatherBlock state="unavailable" />
    <RouteSnapshotMap state="ok" />
  </MountainDetailHostScroll>
);

const MountainDetailWeatherStale = () => (
  <MountainDetailHostScroll>
    <WeatherBlock state="stale" />
  </MountainDetailHostScroll>
);

const MountainDetailRouteUnavailable = () => (
  <MountainDetailHostScroll>
    <WeatherBlock state="live" />
    <RouteSnapshotMap state="unavailable" />
  </MountainDetailHostScroll>
);

const MountainDetailRouteFallback = () => (
  <MountainDetailHostScroll>
    <RouteSnapshotMap state="fallback" />
  </MountainDetailHostScroll>
);

// Activity detail — focused on the new map module
const ActivityDetailRouteOnly = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="哈巴雪山 · 2024-10-07" />
    <div style={{ padding: '12px 16px 0' }}>
      <div style={{ background: 'linear-gradient(180deg, rgba(34,197,94,.1), rgba(34,197,94,.02))', border: '1px solid rgba(34,197,94,.28)', borderRadius: 14, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(34,197,94,.18)', border: '1px solid rgba(34,197,94,.32)', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10" stroke={PTColors.success} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>登顶完成</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>13:24 抵达山顶 · 留证完整</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 800, color: PTColors.success }}>6,178m</div>
        </div>
      </div>
    </div>
    <ActivityRouteMap onExpand={() => {}} />
    <div style={{ height: 28 }}/>
  </div>
);

// Trek showcase — three states stacked vertically inside one phone, separated by tiny dividers
const TrekReferenceShowcase = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 20 }}>
    <StatusBar />
    {/* live */}
    <div style={{ padding: '6px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: PTColors.surface, border: `1px solid ${PTColors.outline}` }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: PTColors.error }}/>
        <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg, letterSpacing: '.06em' }}>记录中</span>
      </div>
      <div style={{ fontSize: 11, color: PTColors.fg2 }}>玉珠峰 · 进阶线</div>
    </div>
    <div style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      <TrekStatTile label="当前海拔 m" value="5,360" accent />
      <TrekStatTile label="距离 km" value="7.4" />
      <TrekStatTile label="用时" value="3h 42m" />
    </div>
    <TrekReferenceMap progress={0.48} />

    {/* gps weak variant — small caption */}
    <div style={{ padding: '20px 20px 6px', fontSize: 10, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.08em' }}>VARIANT · GPS 弱</div>
    <TrekReferenceMap progress={0.32} weak />

    {/* offline variant */}
    <div style={{ padding: '20px 20px 6px', fontSize: 10, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.08em' }}>VARIANT · 离线缓存</div>
    <TrekReferenceMap progress={0.18} offline />
  </div>
);

const TrekStatTile = ({ label, value, accent }) => (
  <div style={{ padding: '12px 10px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, textAlign: 'center' }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 700, color: accent ? PTColors.success : PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 4, letterSpacing: '.04em' }}>{label}</div>
  </div>
);

Object.assign(window, {
  // modules
  WeatherBlock, RouteSnapshotMap, ActivityRouteMap, TrekReferenceMap,
  // showcase frames
  MountainDetailWithModules, MountainDetailWeatherUnavailable, MountainDetailWeatherStale,
  MountainDetailRouteUnavailable, MountainDetailRouteFallback,
  ActivityDetailRouteOnly, TrekReferenceShowcase,
});
