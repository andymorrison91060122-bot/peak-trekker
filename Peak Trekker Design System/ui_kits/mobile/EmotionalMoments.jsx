// Peak Trekker — Emotional Moments
// Refined Trek copy, Summit Confirmation ceremony, Late-proof flow,
// Memory-oriented Activity Detail, Hall of Memories archive.
//
// Tone rules (read me before editing):
//   • Calm, grounded, quietly proud. Never cheerleading.
//   • Numbers stay mono and exact — emotion comes from typography, pacing, whitespace.
//   • One verb max per primary CTA. No "amazing / 太棒了 / 恭喜你".
//   • Use long form lines for reflection ("此刻 · 山顶"), short labels for action.
//   • Greens are confident, not festive. No confetti. No glow rings beyond 1 ambient pulse.

// ────────────────────────────────────────────────────────────
//  Atoms specific to this file
// ────────────────────────────────────────────────────────────

const EMSection = ({ children, right, top }) => (
  <div style={{ padding: top ? '20px 20px 10px' : '18px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>{children}</div>
    {right && <div style={{ fontSize: 11, color: PTColors.fg2 }}>{right}</div>}
  </div>
);

// Quiet quote — used for reflection lines on Summit + Memory pages
const QuietQuote = ({ children, attribution }) => (
  <div style={{ padding: '14px 16px' }}>
    <div style={{ fontSize: 14, color: 'rgba(245,247,248,.86)', lineHeight: 1.85, fontStyle: 'normal', letterSpacing: '.005em' }}>
      <span style={{ color: PTColors.fg2, marginRight: 6 }}>「</span>
      {children}
      <span style={{ color: PTColors.fg2, marginLeft: 6 }}>」</span>
    </div>
    {attribution && <div style={{ marginTop: 8, fontSize: 11, color: PTColors.fg2, letterSpacing: '.04em' }}>{attribution}</div>}
  </div>
);

// Subtle line divider with a tiny mountain glyph — used to mark a moment
const RidgeDivider = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 20px' }}>
    <div style={{ flex: 1, height: 1, background: PTColors.outline }}/>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: PTColors.fg2, fontSize: 10, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 7L4 2l2 2.5L9 1" stroke={PTColors.fg2} strokeWidth="1"/></svg>
      {label}
    </div>
    <div style={{ flex: 1, height: 1, background: PTColors.outline }}/>
  </div>
);

// Stat strip used on memory views — wider than StatTile, paired with a soft label
const MemoryStat = ({ label, value, accent }) => (
  <div style={{ padding: '14px 12px', textAlign: 'left' }}>
    <div style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 700, color: accent ? PTColors.success : PTColors.fg, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>{value}</div>
  </div>
);

// Verified ribbon — small, never large
const VerifiedTag = ({ tone = 'success', children }) => {
  const colors = tone === 'success'
    ? { bg: 'rgba(34,197,94,.1)', bd: 'rgba(34,197,94,.28)', fg: PTColors.success }
    : tone === 'warn'
    ? { bg: 'rgba(245,158,11,.1)', bd: 'rgba(245,158,11,.28)', fg: PTColors.warn }
    : { bg: 'rgba(255,255,255,.04)', bd: PTColors.outline, fg: PTColors.fg2 };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: colors.bg, border: `1px solid ${colors.bd}`, color: colors.fg, fontSize: 11, fontWeight: 700, letterSpacing: '.04em' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10" stroke={colors.fg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {children}
    </span>
  );
};

// ────────────────────────────────────────────────────────────
//  1. TREK — refined emotional micro-moments
// ────────────────────────────────────────────────────────────

// Refined Pre-Start. Tone: ready, not pumped.
const TrekPreStartV2 = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between' }}>
      <IconButton round><PTIcons.back/></IconButton>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: PTColors.surface, border: `1px solid ${PTColors.outline}` }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: PTColors.fg2 }}/>
        <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg, letterSpacing: '.06em' }}>待出发</span>
      </div>
      <IconButton round><PTIcons.more/></IconButton>
    </div>

    <div style={{ padding: '24px 24px 4px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>04:38 · 出发前</div>
      <div style={{ marginTop: 14, fontSize: 28, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.02em', lineHeight: 1.2 }}>
        山在这里。<br/>
        <span style={{ color: PTColors.fg2, fontWeight: 700 }}>你也在了。</span>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: PTColors.fg2, lineHeight: 1.65, maxWidth: 280 }}>
        准备好之后再出发 · 这次山行只属于你和这座山。
      </div>
    </div>

    <div style={{ padding: '18px 16px 0' }}>
      <MountainContext />
    </div>

    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '4px 4px' }}>
        <PreflightItem ok label="GPS 信号清晰" sub="水平精度 ±4m" />
        <PreflightItem ok label="离线地图已就绪" sub="玉珠峰区域 · 48MB" />
        <PreflightItem ok label="电量 82%" sub="开启省电模式可记录 11h" last />
      </div>
    </div>

    <div style={{ padding: '20px 16px 26px' }}>
      <PrimaryButton full>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}><circle cx="12" cy="12" r="5" fill="#08120D"/></svg>
        从这里开始
      </PrimaryButton>
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: PTColors.fg2, lineHeight: 1.6 }}>
        Peak Trekker 不会催促你。<br/>路上请把这部手机放回口袋。
      </div>
    </div>
  </div>
);

const PreflightItem = ({ ok, warn, label, sub, last }) => (
  <div style={{ display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'flex-start', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <div style={{ marginTop: 2 }}>
      {ok ? <PTIcons.check/> : warn ? <PTIcons.warn/> : <PTIcons.check c={PTColors.fg2}/>}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>{label}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
    </div>
  </div>
);

// Refined GPS Weak. Tone: reassuring, not alarming.
const TrekGPSWeakV2 = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <IconButton round><PTIcons.back/></IconButton>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(245,158,11,.14)', border: '1px solid rgba(245,158,11,.32)' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: PTColors.warn, animation: 'ptpulse 1.4s ease-out infinite' }}/>
        <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.warn, letterSpacing: '.06em' }}>信号微弱</span>
      </div>
      <IconButton round><PTIcons.more/></IconButton>
    </div>
    <style>{`@keyframes ptpulse { 0%{box-shadow:0 0 0 0 rgba(245,158,11,.55)} 100%{box-shadow:0 0 0 9px rgba(245,158,11,0)} }`}</style>

    {/* Hero — softer */}
    <div style={{ padding: '24px 20px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, letterSpacing: '.22em', color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>当前海拔 · 估算</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, fontSize: 56, lineHeight: 1, color: PTColors.warn, letterSpacing: '-.02em' }}>5,240</div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, color: PTColors.fg2, fontWeight: 600, paddingBottom: 4 }}>m</div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: PTColors.fg2 }}>来自气压计 · 等回到开阔处会自动校准</div>
    </div>

    {/* Reassurance card */}
    <div style={{ padding: '20px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(245,158,11,.12)', display: 'grid', placeItems: 'center' }}>
            <PTIcons.warn/>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>暂时拿不到稳定信号</div>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(245,247,248,.78)', lineHeight: 1.7 }}>
          没关系。气压计还在工作，海拔会继续记录。<br/>
          走出岩壁或谷地之后，轨迹会自动续上。
        </div>
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: `1px solid ${PTColors.outline}`, fontSize: 12, color: PTColors.fg2, lineHeight: 1.55 }}>
          <span style={{ color: PTColors.fg, fontWeight: 600 }}>信号丢失了 4 分钟 · </span>
          这段会标记为「估算」，不会影响登顶留证。
        </div>
      </div>
    </div>

    <div style={{ padding: '20px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>正在尝试</div>
        <RetryDot label="重新搜星" desc="约 30 秒一次" />
        <RetryDot label="使用气压计估算海拔" desc="精度 ±15m" />
        <RetryDot label="保留你已经走过的所有点" desc="不会丢" last />
      </div>
    </div>

    <div style={{ padding: '20px 16px 26px' }}>
      <PrimaryButton full>继续记录</PrimaryButton>
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: PTColors.fg2 }}>专注路上 · 信号会回来的</div>
    </div>
  </div>
);

const RetryDot = ({ label, desc, last }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 10, padding: '8px 0', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <div style={{ paddingTop: 5 }}>
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: PTColors.warn, animation: 'ptpulse 1.4s ease-out infinite' }}/>
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>{label}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{desc}</div>
    </div>
  </div>
);

// Refined Near-Summit. Quiet anticipation, not hype.
const TrekNearSummitV2 = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', overflow: 'hidden' }}>
    {/* faint top ridgelight */}
    <div style={{ position: 'absolute', top: -60, left: '-10%', right: '-10%', height: 220, background: 'radial-gradient(ellipse at center, rgba(110,231,161,.12), transparent 70%)', pointerEvents: 'none' }}/>
    <StatusBar />
    <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
      <IconButton round><PTIcons.back/></IconButton>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.28)' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: PTColors.success, animation: 'ptpulse2 1.6s ease-out infinite' }}/>
        <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.success, letterSpacing: '.06em' }}>临近峰顶</span>
      </div>
      <IconButton round><PTIcons.more/></IconButton>
    </div>
    <style>{`@keyframes ptpulse2 { 0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)} 100%{box-shadow:0 0 0 10px rgba(34,197,94,0)} }`}</style>

    <div style={{ padding: '24px 24px 4px', position: 'relative' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>距离峰顶</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, fontSize: 60, lineHeight: 1, color: PTColors.success, letterSpacing: '-.02em' }}>38</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, color: PTColors.fg2, fontWeight: 600 }}>m</span>
      </div>
      <div style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: PTColors.fg, letterSpacing: '-.005em', lineHeight: 1.5 }}>
        慢一点 · 看一眼脚下
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: PTColors.fg2, lineHeight: 1.7, maxWidth: 280 }}>
        山顶在前方。这一段更要稳。<br/>
        到了之后，留 10 分钟给自己。
      </div>
    </div>

    <div style={{ padding: '24px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em' }}>当前海拔</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700, color: PTColors.fg, marginTop: 4 }}>6,140m</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em' }}>已用时</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700, color: PTColors.fg, marginTop: 4 }}>6h 48m</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em' }}>留证准备</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: PTColors.success }}/>
              <span style={{ fontSize: 12, fontWeight: 700, color: PTColors.success }}>就绪</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>
          <PTIcons.camera/>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>到达峰顶时</div>
          <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 4, lineHeight: 1.6 }}>系统会请你拍一张登顶照作为留证 · 一张就够。</div>
        </div>
      </div>
    </div>

    <div style={{ padding: '24px 16px 26px' }}>
      <PrimaryButton full>继续</PrimaryButton>
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────
//  2. SUMMIT CONFIRMATION — the ceremonial moment
// ────────────────────────────────────────────────────────────
//  This is the single most important screen in the app. It marks "you arrived".
//  Hierarchy:
//    1. Tiny ALT marker
//    2. Mountain name (large, restrained)
//    3. Summit altitude — hero number
//    4. Summit time + 4-stat strip
//    5. One quiet line
//    6. Three actions, weighted differently

const SummitConfirmationV2 = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', overflow: 'hidden' }}>
    {/* Ambient summit glow — single static gradient, NOT animated celebration */}
    <div style={{ position: 'absolute', top: -120, left: '-30%', right: '-30%', height: 380, background: 'radial-gradient(ellipse at center top, rgba(110,231,161,.18), transparent 65%)', pointerEvents: 'none' }}/>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(110,231,161,.5), transparent)' }}/>

    <StatusBar />
    <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
      <IconButton round><PTIcons.back/></IconButton>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(34,197,94,.14)', border: '1px solid rgba(34,197,94,.34)' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10" stroke={PTColors.success} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.success, letterSpacing: '.06em' }}>登顶完成</span>
      </div>
      <IconButton round><PTIcons.more/></IconButton>
    </div>

    {/* Hero block */}
    <div style={{ padding: '40px 24px 0', textAlign: 'center', position: 'relative' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.32em', fontFamily: "'IBM Plex Mono',monospace" }}>ALT · SUMMIT</div>

      <div style={{ marginTop: 18, fontSize: 22, fontWeight: 700, color: 'rgba(245,247,248,.92)', letterSpacing: '-.005em' }}>玉珠峰</div>
      <div style={{ marginTop: 4, fontSize: 12, color: PTColors.fg2, letterSpacing: '.04em' }}>青海 · 格尔木 · 进阶线</div>

      {/* The big number */}
      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 88, fontWeight: 800, lineHeight: 1, color: PTColors.success, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 40px rgba(110,231,161,.18)' }}>6,178</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, color: PTColors.fg2, fontWeight: 600, paddingBottom: 8 }}>m</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: PTColors.success, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>13:24 · 留证已确认</div>

      <div style={{ marginTop: 28 }}>
        <RidgeDivider label="此刻 · 山顶" />
      </div>

      {/* The quiet line */}
      <div style={{ marginTop: 22, fontSize: 17, color: PTColors.fg, letterSpacing: '-.005em', lineHeight: 1.6, fontWeight: 600 }}>
        到了。
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: PTColors.fg2, lineHeight: 1.75, padding: '0 8px' }}>
        留 10 分钟给这里 · <br/>下山的路慢慢走。
      </div>
    </div>

    {/* Stat strip */}
    <div style={{ padding: '32px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: '总用时', value: '7h 12m' },
          { label: '距离', value: '12.4km' },
          { label: '爬升', value: '1,898m' },
          { label: '出发海拔', value: '4,280m' },
        ].map((s, i, arr) => (
          <div key={i} style={{ padding: '12px 8px', textAlign: 'center', borderRight: i === arr.length - 1 ? 'none' : `1px solid ${PTColors.outline}` }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 4, letterSpacing: '.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Actions */}
    <div style={{ padding: '24px 16px 26px' }}>
      <PrimaryButton full>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}><path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke="#08120D" strokeWidth="2"/><circle cx="12" cy="13" r="3.2" stroke="#08120D" strokeWidth="2"/></svg>
        留下峰顶记录
      </PrimaryButton>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <SecondaryButton full>保存这次登顶</SecondaryButton>
        <SecondaryButton full>稍后整理</SecondaryButton>
      </div>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: PTColors.fg2, lineHeight: 1.65 }}>
        峰顶留证窗口仍有 8 分钟 · 不急。<br/>
        下山途中也可以补充照片与一段话。
      </div>
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────
//  3. LATE PROOF / 补签 / 留证 — respectful, not bureaucratic
// ────────────────────────────────────────────────────────────

// 3a. Entry — explains *why* we ask and what we do with it
const LateProofIntro = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="补登记 · 哈巴雪山" />

    <div style={{ padding: '20px 24px 8px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>2024-09-22 · 登顶日</div>
      <div style={{ marginTop: 12, fontSize: 24, fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.3 }}>把这次山行记进来</div>
      <div style={{ marginTop: 12, fontSize: 13, color: PTColors.fg2, lineHeight: 1.7, maxWidth: 290 }}>
        当时没有用 Peak Trekker 记录也没关系。<br/>
        提交一张登顶照与几行说明 · 我们会以「补登记」的形式收录到你的山行档案里。
      </div>
    </div>

    <EMSection>留证可以是这些</EMSection>
    <div style={{ padding: '0 16px' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
        <ProofTypeRow icon="photo" label="登顶照片" desc="一张就够 · 含可识别的峰顶标志最好" />
        <ProofTypeRow icon="track" label="第三方轨迹文件" desc="GPX / KML · 来自其他记录工具" />
        <ProofTypeRow icon="note" label="一段亲历说明" desc="时间、路线、同行者 · 由你自己讲" last />
      </div>
    </div>

    <EMSection>关于真实性</EMSection>
    <div style={{ padding: '0 16px 0' }}>
      <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,.02)', border: `1px solid ${PTColors.outline}`, borderRadius: 14 }}>
        <div style={{ fontSize: 12, color: 'rgba(245,247,248,.78)', lineHeight: 1.7 }}>
          补登记会清晰地标记为<span style={{ color: PTColors.fg, fontWeight: 600 }}>「用户自报」</span>。<br/>
          我们不会判定真伪 · 但会让你和山友看到这是在事后补充的记录。
        </div>
      </div>
    </div>

    <div style={{ height: 110 }}/>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 26px', background: 'linear-gradient(180deg, transparent, rgba(18,20,22,.96) 35%)' }}>
      <PrimaryButton full>开始补登记</PrimaryButton>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: PTColors.fg2 }}>大约需要 2 分钟</div>
    </div>
  </div>
);

const ProofTypeRow = ({ icon, label, desc, last }) => {
  const icons = {
    photo: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke={PTColors.fg} strokeWidth="1.6"/><circle cx="12" cy="13" r="3" stroke={PTColors.fg} strokeWidth="1.6"/></svg>,
    track: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 18l5-12 4 7 7-5" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    note: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5z" stroke={PTColors.fg} strokeWidth="1.6"/><path d="M8 8h8M8 12h8M8 16h5" stroke={PTColors.fg} strokeWidth="1.6" strokeLinecap="round"/></svg>,
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 18px', gap: 12, alignItems: 'center', padding: '14px 14px', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>{icons[icon]}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>{label}</div>
        <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3, lineHeight: 1.55 }}>{desc}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></svg>
    </div>
  );
};

// 3b. Upload state
const LateProofUpload = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="补登记 · 哈巴雪山" right="2 / 3" />

    <div style={{ padding: '20px 24px 0' }}>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.005em' }}>放一张你登顶时的照片</div>
      <div style={{ marginTop: 6, fontSize: 12, color: PTColors.fg2, lineHeight: 1.6 }}>有山顶标志或合影都好 · 单张即可，不需多张</div>
    </div>

    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, position: 'relative' }}>
        <PhonePlaceholder h={220} tone="dawn" label="登顶照 · 5,396m" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,.65))' }}/>
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg }}>IMG_2381.jpg</div>
            <div style={{ fontSize: 11, color: 'rgba(245,247,248,.65)', marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>2.4 MB · 拍摄于 2024-09-22 11:48</div>
          </div>
          <button style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(12,14,16,.7)', backdropFilter: 'blur(8px)', border: `1px solid ${PTColors.outline}`, color: PTColors.fg, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>更换</button>
        </div>
      </div>
    </div>

    {/* EXIF feedback — calm, factual */}
    <EMSection>从这张照片读到了</EMSection>
    <div style={{ padding: '0 16px' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '4px 4px' }}>
        <ExifRow ok label="拍摄时间" value="2024-09-22 · 11:48" />
        <ExifRow ok label="GPS 位置" value="哈巴雪山 5,396m 范围内" />
        <ExifRow warn label="设备型号" value="iPhone · 元数据完整" last />
      </div>
    </div>

    <div style={{ padding: '20px 16px 0' }}>
      <textarea placeholder="想说点什么吗？路线、同行者、当天的状态… 一两行就好。" style={{
        width: '100%', minHeight: 96, padding: '12px 14px', borderRadius: 12,
        background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
        color: PTColors.fg, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7, resize: 'none', outline: 'none',
      }} defaultValue="九月最后一周从大本营出发，凌晨四点起步。冰川风口风很大，到山顶时云开了一会儿，能看见梅里。"/>
    </div>

    <div style={{ height: 110 }}/>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 26px', background: 'linear-gradient(180deg, transparent, rgba(18,20,22,.96) 35%)' }}>
      <PrimaryButton full>提交补登记</PrimaryButton>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: PTColors.fg2 }}>提交后会标记为「用户自报 · 待生效」</div>
    </div>
  </div>
);

const ExifRow = ({ ok, warn, label, value, last }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 10, alignItems: 'center', padding: '11px 12px', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <div>{ok ? <PTIcons.check/> : warn ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={PTColors.fg2} strokeWidth="1.6"/><path d="M12 8v5M12 16.5v.5" stroke={PTColors.fg2} strokeWidth="1.6" strokeLinecap="round"/></svg> : null}</div>
    <div style={{ fontSize: 12, color: PTColors.fg2 }}>{label}</div>
    <div style={{ fontSize: 12, fontWeight: 600, color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace" }}>{value}</div>
  </div>
);

// 3c. Pending review
const LateProofPending = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="补登记 · 哈巴雪山" />

    <div style={{ padding: '40px 24px 0', textAlign: 'center' }}>
      <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(255,255,255,.03)', border: `1px solid ${PTColors.outline}`, margin: '0 auto', display: 'grid', placeItems: 'center', position: 'relative' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={PTColors.fg2} strokeWidth="1.5"/>
          <path d="M12 7v5l3 2" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1px solid rgba(141,149,155,.18)`, animation: 'ringpulse 2.4s ease-out infinite' }}/>
        <style>{`@keyframes ringpulse { 0%{opacity:.6;transform:scale(1)} 100%{opacity:0;transform:scale(1.3)} }`}</style>
      </div>
      <div style={{ marginTop: 22, fontSize: 22, fontWeight: 700, letterSpacing: '-.015em' }}>已收到，正在整理</div>
      <div style={{ marginTop: 10, fontSize: 13, color: PTColors.fg2, lineHeight: 1.7, maxWidth: 280, margin: '10px auto 0' }}>
        这次补登记会以「用户自报」的形式收录。<br/>
        通常 24 小时内会出现在你的山行档案里。
      </div>
    </div>

    <EMSection>这一次提交</EMSection>
    <div style={{ padding: '0 16px' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden' }}><PhonePlaceholder h={56} tone="dawn"/></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>哈巴雪山 · 5,396m</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>2024-09-22 · 11:48 登顶</div>
          </div>
          <VerifiedTag tone="warn">用户自报</VerifiedTag>
        </div>
        <div style={{ borderTop: `1px solid ${PTColors.outline}`, marginTop: 14, paddingTop: 12, fontSize: 12, color: 'rgba(245,247,248,.72)', lineHeight: 1.7 }}>
          九月最后一周从大本营出发，凌晨四点起步。冰川风口风很大，到山顶时云开了一会儿，能看见梅里。
        </div>
      </div>
    </div>

    <EMSection>之后会发生什么</EMSection>
    <div style={{ padding: '0 16px 26px' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '4px 4px' }}>
        <TimelineRow done label="提交已收到" sub="刚刚 · 你这边已完成" />
        <TimelineRow active label="进入档案整理" sub="约 24 小时内 · 自动处理" />
        <TimelineRow label="出现在你的山行档案" sub="标记为「用户自报」" last />
      </div>
    </div>
  </div>
);

const TimelineRow = ({ done, active, label, sub, last }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 12, padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}`, alignItems: 'flex-start' }}>
    <div style={{ paddingTop: 4, position: 'relative' }}>
      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: done ? PTColors.success : active ? PTColors.fg : 'transparent', border: done || active ? 'none' : `1.5px solid ${PTColors.fg2}` }}/>
      {!last && <span style={{ position: 'absolute', left: 4.5, top: 18, width: 1, height: 28, background: PTColors.outline }}/>}
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: done || active ? PTColors.fg : PTColors.fg2 }}>{label}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>{sub}</div>
    </div>
  </div>
);

// 3d. Submitted success
const LateProofSubmitted = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="补登记 · 哈巴雪山" />

    <div style={{ padding: '52px 24px 0', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.32)', margin: '0 auto', display: 'grid', placeItems: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10" stroke={PTColors.success} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <div style={{ marginTop: 22, fontSize: 22, fontWeight: 700, letterSpacing: '-.015em' }}>已收录到你的档案</div>
      <div style={{ marginTop: 10, fontSize: 13, color: PTColors.fg2, lineHeight: 1.7, maxWidth: 280, margin: '10px auto 0' }}>
        2024 年的第 3 次登顶 · 已加入你的山行档案。
      </div>
    </div>

    <div style={{ padding: '32px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ position: 'relative', height: 130 }}>
          <PhonePlaceholder h={130} tone="dawn" label="哈巴雪山 · 5,396m" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.78))' }}/>
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.005em' }}>哈巴雪山</div>
                <div style={{ fontSize: 11, color: 'rgba(245,247,248,.7)', fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>2024-09-22 · 5,396m</div>
              </div>
              <VerifiedTag tone="warn">用户自报</VerifiedTag>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style={{ padding: '20px 16px 26px' }}>
      <PrimaryButton full>查看这次记录</PrimaryButton>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <SecondaryButton full>再补一次</SecondaryButton>
        <SecondaryButton full>回到档案</SecondaryButton>
      </div>
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────
//  4. ACTIVITY DETAIL — memory archive version
// ────────────────────────────────────────────────────────────

const MemoryActivityDetail = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    {/* Hero — soft cinematic image, overlay date in mono */}
    <div style={{ position: 'relative' }}>
      <PhonePlaceholder h={280} tone="dawn" label="玉珠峰 · 山顶云海" />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.55) 0%, rgba(12,14,16,.0) 30%, rgba(12,14,16,.92) 100%)' }}/>
      <StatusBar />
      <div style={{ position: 'absolute', top: 30, left: 0, right: 0, padding: '0 12px', display: 'flex', justifyContent: 'space-between' }}>
        <IconButton round><PTIcons.back/></IconButton>
        <div style={{ display: 'flex', gap: 8 }}>
          <IconButton round><PTIcons.share/></IconButton>
          <IconButton round><PTIcons.more/></IconButton>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 24, right: 24, bottom: 22 }}>
        <div style={{ fontSize: 11, color: 'rgba(245,247,248,.7)', letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>2024-10-07 · 周一</div>
        <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.02em', lineHeight: 1.2 }}>玉珠峰</div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(245,247,248,.7)' }}>青海 · 格尔木 · 进阶线</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <VerifiedTag tone="success">登顶留证 · 完整</VerifiedTag>
        </div>
      </div>
    </div>

    {/* Reflection — sets the page tone */}
    <div style={{ padding: '24px 8px 0' }}>
      <QuietQuote attribution="— 写于 10-07 · 山顶">
        凌晨三点出营 · 风比预想大。<br/>
        过 C1 之后冰壳渐厚 · 节奏被迫放慢。<br/>
        登顶那一刻只剩一句话可说 · 再来一次也值得。
      </QuietQuote>
    </div>

    {/* Stat strip — wider, label-first */}
    <div style={{ padding: '20px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {[
          { label: '最高海拔', value: '6,178 m' },
          { label: '总用时', value: '7h 12m' },
          { label: '总距离', value: '12.4 km' },
          { label: '累计爬升', value: '1,898 m' },
        ].map((s, i, arr) => (
          <div key={i} style={{ borderRight: i % 2 === 0 ? `1px solid ${PTColors.outline}` : 'none', borderBottom: i < arr.length - 2 ? `1px solid ${PTColors.outline}` : 'none' }}>
            <MemoryStat {...s}/>
          </div>
        ))}
      </div>
    </div>

    {/* Route memory — solid trace, named waypoints with timestamps */}
    <EMSection right="走过的路线">轨迹记忆</EMSection>
    <div style={{ padding: '0 16px' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
        <svg width="100%" height="160" viewBox="0 0 343 160" preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="memTrace" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#22C55E"/>
              <stop offset="100%" stopColor="#6EE7A1"/>
            </linearGradient>
            <radialGradient id="memBg" cx="58%" cy="38%" r="60%">
              <stop offset="0%" stopColor="#22272d"/>
              <stop offset="100%" stopColor="#15191c"/>
            </radialGradient>
          </defs>
          <rect width="343" height="160" fill="url(#memBg)"/>
          {[...Array(6)].map((_, i) => (
            <ellipse key={i} cx="200" cy="68" rx={28 + i * 22} ry={14 + i * 11} stroke={`rgba(141,149,155,${0.28 - i * 0.03})`} strokeWidth="1" fill="none"/>
          ))}
          <path d="M28 138 Q70 124 100 116 T160 96 T196 70 L200 64 L208 70 Q220 90 240 110 T300 142"
            stroke="url(#memTrace)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="28" cy="138" r="5" fill={PTColors.fg}/>
          <circle cx="300" cy="142" r="5" fill={PTColors.fg2}/>
          <path d="M192 60 L200 44 L208 60 Z" fill={PTColors.success}/>
        </svg>
        <div style={{ padding: '0' }}>
          {[
            { time: '04:22', alt: '4,280m', name: '大本营 · 出发', dot: 'fg' },
            { time: '08:48', alt: '5,100m', name: 'C1 高营地 · 短歇', dot: 'fg2' },
            { time: '11:36', alt: '5,800m', name: '冰雪过渡带 · 结组', dot: 'warn' },
            { time: '13:24', alt: '6,178m', name: '山顶 · 留证', dot: 'success' },
          ].map((p, i, arr) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 18px 1fr', gap: 10, padding: '10px 14px', alignItems: 'center', borderTop: i === 0 ? `1px solid ${PTColors.outline}` : 'none', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${PTColors.outline}` }}>
              <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: PTColors.fg2, fontWeight: 600 }}>{p.time}</div>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: p.dot === 'success' ? PTColors.success : p.dot === 'warn' ? PTColors.warn : p.dot === 'fg2' ? PTColors.fg2 : PTColors.fg }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>{p.name}</span>
                <span style={{ fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>{p.alt}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Curated photos — 3 only */}
    <EMSection right="3 张 · 你选的">这次的照片</EMSection>
    <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
      <div style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', aspectRatio: '1 / 1.1', border: `1px solid ${PTColors.outline}` }}>
        <PhonePlaceholder h={220} tone="dawn" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,.55))' }}/>
        <div style={{ position: 'absolute', left: 12, bottom: 10, fontSize: 10, fontWeight: 700, color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.05em' }}>13:24 · 山顶</div>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 8 }}>
        {['08:48 · C1', '06:12 · 出发后'].map((label, i) => (
          <div key={i} style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', border: `1px solid ${PTColors.outline}` }}>
            <PhonePlaceholder h={106} tone={i === 0 ? 'slate' : 'alpine'} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,.55))' }}/>
            <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 10, fontWeight: 700, color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Companions */}
    <EMSection>同行者</EMSection>
    <div style={{ padding: '0 16px' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex' }}>
          {['#3a4a52', '#5a4438', '#403a4a'].map((c, i) => (
            <div key={i} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: `2px solid ${PTColors.bg}`, marginLeft: i === 0 ? 0 : -8 }}/>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>3 位山友 · 一同登顶</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>陈思远 · 林一帆 · @amber.li</div>
        </div>
        <SecondaryButton>查看</SecondaryButton>
      </div>
    </div>

    {/* Actions */}
    <div style={{ padding: '24px 16px 26px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SecondaryButton full>生成分享</SecondaryButton>
        <PrimaryButton full>发布到山友圈</PrimaryButton>
      </div>
      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: PTColors.fg2, lineHeight: 1.6 }}>
        这是属于你的山行 · 不发布也是好选择
      </div>
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────
//  5. ARCHIVE — Hall of Memories
// ────────────────────────────────────────────────────────────

const MemoryArchive = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="我的山行" right="筛选" />

    {/* Hero summary — quiet, tells the user who they are as a hiker */}
    <div style={{ padding: '12px 24px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>截至 2025-04 · 共 14 次登顶</div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 56, fontWeight: 800, lineHeight: 1, color: PTColors.fg, letterSpacing: '-.03em' }}>14</span>
        <span style={{ fontSize: 14, color: PTColors.fg2, paddingBottom: 6 }}>座山顶 · 在档案里</span>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 14, fontSize: 12, color: PTColors.fg2 }}>
        <span><span style={{ color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>6,178m</span> · 最高</span>
        <span style={{ color: PTColors.outline }}>|</span>
        <span><span style={{ color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>3</span> 个省份</span>
        <span style={{ color: PTColors.outline }}>|</span>
        <span><span style={{ color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>9</span> 张留证</span>
      </div>
    </div>

    <RidgeDivider label="2025"/>

    {/* Year header */}
    <div style={{ padding: '6px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.02em' }}>2025</div>
      <div style={{ fontSize: 11, color: PTColors.fg2 }}>2 次登顶 · 至今</div>
    </div>

    {/* Memory cards */}
    <div style={{ padding: '14px 16px 0', display: 'grid', gap: 10 }}>
      <MemoryCard
        date="03-14"
        name="四姑娘山 · 大峰"
        region="四川 · 阿坝"
        alt="5,025m"
        photo="dawn"
        verified="success"
        line="云开了一会儿 · 拍到了二峰主脊"
      />
      <MemoryCard
        date="01-22"
        name="哈巴雪山"
        region="云南 · 香格里拉"
        alt="5,396m"
        photo="dusk"
        verified="success"
        line="冬攀线 · 上山慢，下山快"
      />
    </div>

    <RidgeDivider label="2024"/>
    <div style={{ padding: '6px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.02em' }}>2024</div>
      <div style={{ fontSize: 11, color: PTColors.fg2 }}>5 次登顶</div>
    </div>

    <div style={{ padding: '14px 16px 0', display: 'grid', gap: 10 }}>
      <MemoryCard
        date="10-07"
        name="玉珠峰"
        region="青海 · 格尔木"
        alt="6,178m"
        photo="alpine"
        verified="success"
        line="第一座 6 字头 · 凌晨三点出营"
        big
      />
      <MemoryCard
        date="09-22"
        name="哈巴雪山"
        region="云南 · 香格里拉"
        alt="5,396m"
        photo="slate"
        verified="warn"
        verifiedLabel="用户自报"
        line="补登记 · 当时还没用 Peak Trekker"
      />
      <MemoryCard
        date="07-18"
        name="四姑娘山 · 二峰"
        region="四川 · 阿坝"
        alt="5,276m"
        photo="dawn"
        verified="success"
        line="碎石路硌脚 · 顶上有阳光"
      />
    </div>

    {/* DNF row — quiet, not shameful */}
    <RidgeDivider label="未完成 · 也是经历"/>
    <div style={{ padding: '14px 16px 26px', display: 'grid', gap: 10 }}>
      <MemoryCard
        date="2023-10-29"
        name="贡嘎"
        region="四川 · 甘孜"
        alt="—"
        photo="slate"
        verified="muted"
        verifiedLabel="折返"
        line="C1 之后风太大 · 在窗外等了一整夜"
        muted
      />
    </div>
  </div>
);

const MemoryCard = ({ date, name, region, alt, photo, verified, verifiedLabel, line, big, muted }) => {
  const altDisplay = alt === '—' ? null : alt;
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, background: PTColors.surface, opacity: muted ? 0.78 : 1 }}>
      <div style={{ position: 'relative', height: big ? 180 : 130 }}>
        <PhonePlaceholder h={big ? 180 : 130} tone={photo} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.35) 0%, rgba(12,14,16,.0) 30%, rgba(12,14,16,.85) 100%)' }}/>
        <div style={{ position: 'absolute', top: 10, left: 12, fontSize: 10, fontWeight: 700, color: 'rgba(245,247,248,.85)', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.12em', padding: '4px 8px', background: 'rgba(12,14,16,.55)', backdropFilter: 'blur(6px)', borderRadius: 6 }}>{date}</div>
        {verified && (
          <div style={{ position: 'absolute', top: 10, right: 12 }}>
            <VerifiedTag tone={verified}>{verifiedLabel || (verified === 'success' ? '留证完整' : verified === 'warn' ? '用户自报' : '折返')}</VerifiedTag>
          </div>
        )}
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: big ? 20 : 16, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.005em', lineHeight: 1.2 }}>{name}</div>
            <div style={{ fontSize: 11, color: 'rgba(245,247,248,.7)', marginTop: 3 }}>{region}</div>
          </div>
          {altDisplay && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: big ? 22 : 18, fontWeight: 800, color: muted ? PTColors.fg2 : PTColors.fg, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums' }}>{altDisplay}</div>
            </div>
          )}
        </div>
      </div>
      {line && (
        <div style={{ padding: '12px 14px', fontSize: 12, color: 'rgba(245,247,248,.78)', lineHeight: 1.65, borderTop: `1px solid ${PTColors.outline}` }}>
          {line}
        </div>
      )}
    </div>
  );
};

Object.assign(window, {
  TrekPreStartV2, TrekGPSWeakV2, TrekNearSummitV2,
  SummitConfirmationV2,
  LateProofIntro, LateProofUpload, LateProofPending, LateProofSubmitted,
  MemoryActivityDetail,
  MemoryArchive,
});
