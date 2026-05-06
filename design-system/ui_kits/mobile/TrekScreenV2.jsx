// Trek v2 — live recording. State-dense but calm. Elevation is the hero metric.
// States exported: pre-start | live | paused | gpsWeak | noMountain | restricted | nearSummit | summitConfirmed | permissionDenied | loading

const TrekShell = ({ children, topColor, bottomColor }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative' }}>{children}</div>
);

// ---------- Shared Trek primitives ----------

// Large elevation hero — always present in recording states
const ElevationHero = ({ value = 5240, target = 6178, sub, pulse }) => (
  <div style={{ padding: '20px 20px 6px', textAlign: 'center' }}>
    <div style={{ fontSize: 11, letterSpacing: '.22em', color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>当前海拔</div>
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
      <div style={{
        fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, fontSize: 56, lineHeight: 1,
        color: PTColors.success, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums',
        textShadow: pulse ? `0 0 0 ${PTColors.success}` : 'none',
      }}>{value.toLocaleString()}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, color: PTColors.fg2, fontWeight: 600, paddingBottom: 4 }}>m</div>
    </div>
    {target && (
      <div style={{ marginTop: 10, padding: '0 20px' }}>
        <AltitudeBar value={value} max={target} />
        <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 6, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.05em' }}>
          距峰顶 {(target - value).toLocaleString()}m · 目标 {target.toLocaleString()}m
        </div>
      </div>
    )}
    {sub && <div style={{ marginTop: 8, fontSize: 12, color: PTColors.fg2 }}>{sub}</div>}
  </div>
);

// Three-metric row below elevation
const TrekMetricRow = ({ dur = '02:14', dist = '4.8', climb = '820' }) => (
  <div style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
    <TrekMetric label="已用时" value={dur} />
    <TrekMetric label="距离 km" value={dist} />
    <TrekMetric label="爬升 m" value={climb} />
  </div>
);

const TrekMetric = ({ label, value }) => (
  <div style={{ padding: '12px 10px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, textAlign: 'center' }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 4, letterSpacing: '.04em' }}>{label}</div>
  </div>
);

// Light map — reference only. Contour lines + dotted route + current dot.
const TrekMiniMap = ({ h = 160, progress = 0.48, weak, offline }) => (
  <div style={{ margin: '16px 16px 0', height: h, borderRadius: 14, border: `1px solid ${PTColors.outline}`, overflow: 'hidden', position: 'relative', background: '#1a1f24' }}>
    <svg width="100%" height="100%" viewBox="0 0 343 160" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: offline ? 0.4 : 1 }}>
      {[...Array(7)].map((_, i) => (
        <ellipse key={i} cx={180} cy={80} rx={36 + i * 28} ry={18 + i * 12} stroke="rgba(141,149,155,.22)" strokeWidth="1" fill="none"/>
      ))}
      {/* route */}
      <path d="M30 130 Q80 110 120 100 T200 80 T280 50" stroke={PTColors.outline} strokeWidth="2" strokeDasharray="3 4" fill="none"/>
      <path d={`M30 130 Q80 110 120 100 T${80 + progress * 220} ${95 - progress * 40}`} stroke={PTColors.success} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {/* current dot */}
      <circle cx={80 + progress * 220} cy={95 - progress * 40} r="7" fill={PTColors.success}/>
      <circle cx={80 + progress * 220} cy={95 - progress * 40} r="12" fill="none" stroke={PTColors.success} strokeOpacity="0.25" strokeWidth="2"/>
      {/* summit */}
      <path d="M270 48 L280 32 L290 48 Z" fill={PTColors.fg} opacity="0.7"/>
    </svg>
    {/* Overlay chip */}
    <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', gap: 6 }}>
      <span style={{
        padding: '4px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
        background: 'rgba(12,14,16,.7)', backdropFilter: 'blur(8px)', color: PTColors.fg2, letterSpacing: '.05em',
      }}>地图仅作参考</span>
    </div>
    {weak && (
      <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, background: 'rgba(245,158,11,.18)', border: '1px solid rgba(245,158,11,.32)', color: PTColors.warn, fontSize: 10, fontWeight: 700 }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: PTColors.warn }}/>GPS 弱
      </div>
    )}
  </div>
);

const MountainContext = ({ m = { name: '玉珠峰', region: '青海', alt: 6178, line: '进阶线' }, onChange }) => (
  <div style={{ padding: '0 16px' }}>
    <button onClick={onChange} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,197,94,.12)', border: `1px solid rgba(34,197,94,.22)`, display: 'grid', placeItems: 'center' }}>
        <PTIcons.mountain active />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>{m.name} <span style={{ color: PTColors.fg2, fontWeight: 500, fontSize: 12 }}>· {m.region}</span></div>
        <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>目标 {m.alt.toLocaleString()}m · {m.line}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  </div>
);

// Recording indicator — pulsing dot
const RecDot = ({ on }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 8, height: 8, borderRadius: 999, background: on ? PTColors.error : PTColors.fg2, animation: on ? 'ptpulse 1.4s ease-out infinite' : 'none' }}/>
    <style>{`@keyframes ptpulse { 0%{box-shadow:0 0 0 0 rgba(239,68,68,.55)} 100%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }`}</style>
  </span>
);

const TrekTopBar = ({ state, onBack }) => (
  <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <IconButton round onClick={onBack}><PTIcons.back /></IconButton>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: PTColors.surface, border: `1px solid ${PTColors.outline}` }}>
      <RecDot on={state === 'live' || state === 'nearSummit'} />
      <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg, letterSpacing: '.06em' }}>{state === 'live' || state === 'nearSummit' ? '记录中' : state === 'paused' ? '已暂停' : '待开始'}</span>
    </div>
    <IconButton round><PTIcons.more /></IconButton>
  </div>
);

// ---------- STATES ----------

const TrekPreStart = ({ onStart, onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="idle" onBack={onBack} />
    <div style={{ padding: '16px 20px 6px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>即将开始</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, letterSpacing: '-.01em' }}>准备一次真实山行</div>
    </div>
    <div style={{ padding: '12px 16px 0' }}>
      <MountainContext />
    </div>
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px' }}>
        <PreflightRow ok label="GPS 信号良好" sub="水平精度 ±4m" />
        <PreflightRow ok label="离线地图已缓存" sub="玉珠峰区域 · 48MB" />
        <PreflightRow ok label="电量 82%" sub="建议开启省电 · 约够 11h 记录" last />
      </div>
    </div>
    <TrekMiniMap />
    <div style={{ padding: '18px 16px 20px' }}>
      <PrimaryButton full onClick={onStart}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#08120D"/></svg>
        开始记录
      </PrimaryButton>
      <div style={{ textAlign: 'center', fontSize: 11, color: PTColors.fg2, marginTop: 10, lineHeight: 1.5 }}>开始后屏幕常亮 · 自动记录轨迹与海拔</div>
    </div>
  </TrekShell>
);

const PreflightRow = ({ ok, warn, label, sub, last }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <div style={{ marginTop: 2 }}>{ok ? PTIcons.check() : <PTIcons.warn />}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 3 }}>{sub}</div>
    </div>
  </div>
);

const TrekLive = ({ onPause, onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="live" onBack={onBack} />
    <MountainContext />
    <ElevationHero value={5240} target={6178} />
    <TrekMetricRow dur="02:14" dist="4.8" climb="820" />
    <TrekMiniMap progress={0.48} />
    <BottomActionBar>
      <SecondaryButton onClick={onPause}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="6" y="5" width="4" height="14" fill={PTColors.fg}/><rect x="14" y="5" width="4" height="14" fill={PTColors.fg}/></svg>
        暂停
      </SecondaryButton>
      <PrimaryButton full>记一笔</PrimaryButton>
    </BottomActionBar>
  </TrekShell>
);

const TrekPaused = ({ onResume, onStop, onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="paused" onBack={onBack} />
    <MountainContext />
    <ElevationHero value={5240} target={6178} sub="记录已暂停 · 数据保留" />
    <TrekMetricRow dur="02:14" dist="4.8" climb="820" />
    <TrekMiniMap progress={0.48} />
    <BottomActionBar>
      <SecondaryButton onClick={onStop}>结束并保存</SecondaryButton>
      <PrimaryButton full onClick={onResume}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 5l10 7-10 7z" fill="#08120D"/></svg>
        继续记录
      </PrimaryButton>
    </BottomActionBar>
  </TrekShell>
);

const TrekGpsWeak = ({ onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="live" onBack={onBack} />
    <div style={{ padding: '0 16px', marginTop: 4 }}>
      <InlineBanner tone="warn" title="GPS 信号弱" sub="海拔仍来自气压计 · 距离与地图会延迟更新" />
    </div>
    <MountainContext />
    <ElevationHero value={5240} target={6178} sub="气压计读数 · 水平精度 ±22m" />
    <TrekMetricRow dur="02:14" dist="—" climb="820" />
    <TrekMiniMap progress={0.48} weak />
    <BottomActionBar>
      <SecondaryButton>暂停</SecondaryButton>
      <PrimaryButton full>记一笔</PrimaryButton>
    </BottomActionBar>
  </TrekShell>
);

const TrekNoMountain = ({ onPick, onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="idle" onBack={onBack} />
    <div style={{ padding: '48px 28px 0', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.22)', margin: '0 auto', display: 'grid', placeItems: 'center' }}>
        <PTIcons.mountain active size={28} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 18 }}>还没有选择这次要去的山</div>
      <div style={{ fontSize: 13, color: PTColors.fg2, marginTop: 8, lineHeight: 1.6, maxWidth: 260, margin: '8px auto 0' }}>Peak Trekker 的记录以一座真实的山为主语。先选一座，再开始记录。</div>
      <div style={{ marginTop: 22 }}>
        <PrimaryButton onClick={onPick}>去 Explore 选山</PrimaryButton>
      </div>
      <button style={{ marginTop: 12, background: 'none', border: 'none', color: PTColors.fg2, fontSize: 12, cursor: 'pointer', padding: 10, fontFamily: 'inherit' }}>直接记为无归属 · 事后再认领</button>
    </div>
  </TrekShell>
);

const TrekRestricted = ({ onUpgrade, onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="idle" onBack={onBack} />
    <MountainContext />
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: '1px solid rgba(239,68,68,.35)', borderRadius: 14, padding: '16px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', margin: '0 auto 10px', display: 'grid', placeItems: 'center' }}>
          <PTIcons.warn />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>等级不够 · 无法开始记录</div>
        <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 8, lineHeight: 1.6 }}>玉珠峰 需要 中级 及以上登山等级。<br/>你当前为 初级。这是硬性限制，不是建议。</div>
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(255,255,255,.03)', border: `1px solid ${PTColors.outline}`, borderRadius: 10, fontSize: 12, color: PTColors.fg, textAlign: 'left' }}>
          <span style={{ fontWeight: 600 }}>下一步：</span>完成任一 5000m+ 山行（哈巴雪山 · 四姑娘大峰 · 雪宝顶）即可晋级。
        </div>
      </div>
    </div>
    <BottomActionBar>
      <SecondaryButton>换一座山</SecondaryButton>
      <PrimaryButton full onClick={onUpgrade}>查看升级路径</PrimaryButton>
    </BottomActionBar>
  </TrekShell>
);

const TrekNearSummit = ({ onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="nearSummit" onBack={onBack} />
    <div style={{ padding: '0 16px', marginTop: 4 }}>
      <InlineBanner tone="success" title="接近峰顶" sub="距顶 38m · 准备登顶留证" />
    </div>
    <MountainContext />
    <ElevationHero value={6140} target={6178} pulse />
    <TrekMetricRow dur="06:42" dist="11.8" climb="1,202" />
    <TrekMiniMap progress={0.95} />
    <BottomActionBar>
      <SecondaryButton>暂停</SecondaryButton>
      <PrimaryButton full>
        <PTIcons.camera />
        登顶留证
      </PrimaryButton>
    </BottomActionBar>
  </TrekShell>
);

const TrekSummitConfirmed = ({ onShare, onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="paused" onBack={onBack} />
    <div style={{ padding: '32px 20px 0', textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: 'rgba(110,231,161,.14)', border: '1px solid rgba(110,231,161,.3)' }}>
        {PTIcons.check()}
        <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.success, letterSpacing: '.06em' }}>已登顶</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 14 }}>玉珠峰</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 48, fontWeight: 800, color: PTColors.success, marginTop: 10, lineHeight: 1, letterSpacing: '-.02em' }}>6,178m</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: PTColors.fg2, marginTop: 6, letterSpacing: '.18em' }}>2024·10·07 · 13:24</div>
    </div>
    <div style={{ padding: '24px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      <TrekMetric label="已用时" value="07:12" />
      <TrekMetric label="距离 km" value="12.4" />
      <TrekMetric label="爬升 m" value="1,240" />
    </div>
    <div style={{ padding: '18px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '12px 14px', fontSize: 13, color: PTColors.fg, lineHeight: 1.6 }}>
        留证窗口 <span style={{ color: PTColors.success, fontWeight: 700 }}>10 分钟</span> · 继续记录回营数据，或现在结束。
      </div>
    </div>
    <BottomActionBar>
      <SecondaryButton>继续记录</SecondaryButton>
      <PrimaryButton full onClick={onShare}>结束并生成活动</PrimaryButton>
    </BottomActionBar>
  </TrekShell>
);

const TrekPermissionDenied = ({ onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="idle" onBack={onBack} />
    <div style={{ padding: '48px 28px 0', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.3)', margin: '0 auto', display: 'grid', placeItems: 'center' }}>
        <PTIcons.warn />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 18 }}>需要定位权限</div>
      <div style={{ fontSize: 13, color: PTColors.fg2, marginTop: 8, lineHeight: 1.6, maxWidth: 280, margin: '8px auto 0' }}>记录轨迹和海拔需要"始终允许"定位。仅在记录期间使用，不做后台追踪。</div>
      <div style={{ marginTop: 22 }}>
        <PrimaryButton>去系统设置开启</PrimaryButton>
      </div>
      <button style={{ marginTop: 12, background: 'none', border: 'none', color: PTColors.fg2, fontSize: 12, cursor: 'pointer', padding: 10, fontFamily: 'inherit' }}>手动补签（不自动记录）</button>
    </div>
  </TrekShell>
);

const TrekLoading = ({ onBack }) => (
  <TrekShell>
    <StatusBar />
    <TrekTopBar state="idle" onBack={onBack} />
    <div style={{ padding: '10px 16px 0' }}>
      <SkeletonRow h={60} />
    </div>
    <div style={{ padding: '20px 20px 6px', textAlign: 'center' }}>
      <SkeletonRow h={10} w={70} style={{ margin: '0 auto' }} />
      <div style={{ height: 12 }} />
      <SkeletonRow h={44} w={180} style={{ margin: '0 auto' }} />
      <div style={{ height: 12 }} />
      <SkeletonRow h={8} w={240} style={{ margin: '0 auto', borderRadius: 999 }} />
    </div>
    <div style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      <SkeletonRow h={64} /><SkeletonRow h={64} /><SkeletonRow h={64} />
    </div>
    <div style={{ padding: '16px 16px 0' }}>
      <SkeletonRow h={160} />
    </div>
  </TrekShell>
);

const SkeletonRow = ({ h = 20, w = '100%', style = {} }) => (
  <div style={{
    height: h, width: w, borderRadius: 10,
    background: 'linear-gradient(90deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.07) 50%, rgba(255,255,255,.03) 100%)',
    backgroundSize: '200% 100%', animation: 'ptshim 1.4s ease-in-out infinite', ...style,
  }}>
    <style>{`@keyframes ptshim { 0%{background-position:0% 0%} 100%{background-position:-200% 0%} }`}</style>
  </div>
);

// Shared widgets
const BottomActionBar = ({ children }) => (
  <>
    <div style={{ height: 110 }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 26px', background: 'linear-gradient(180deg, rgba(18,20,22,0), rgba(18,20,22,.96) 30%)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10 }}>{children}</div>
    </div>
  </>
);

const InlineBanner = ({ tone = 'warn', title, sub }) => {
  const palette = {
    warn: { bg: 'rgba(245,158,11,.1)', bd: 'rgba(245,158,11,.3)', fg: PTColors.warn, icon: <PTIcons.warn /> },
    success: { bg: 'rgba(110,231,161,.1)', bd: 'rgba(110,231,161,.3)', fg: PTColors.success, icon: PTIcons.check() },
    error: { bg: 'rgba(239,68,68,.1)', bd: 'rgba(239,68,68,.3)', fg: PTColors.error, icon: <PTIcons.warn /> },
  }[tone];
  return (
    <div style={{ padding: '10px 12px', background: palette.bg, border: `1px solid ${palette.bd}`, borderRadius: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ marginTop: 1 }}>{palette.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: palette.fg }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
};

Object.assign(window, {
  TrekPreStart, TrekLive, TrekPaused, TrekGpsWeak, TrekNoMountain, TrekRestricted,
  TrekNearSummit, TrekSummitConfirmed, TrekPermissionDenied, TrekLoading,
});
