// Peak Trekker — First-login intro
// Three screens. No tasks, no missions, no permission prompts.
// Each screen: small product preview at top, headline + copy in the middle,
// dot indicator + actions at the bottom. Skippable from any screen.
//
// Tone: calm · aspirational · trustworthy. The visuals do the selling — the copy
// only names the moment. Greens are confident, not festive.

// ────────────────────────────────────────────────────────────
//  Layout shell
// ────────────────────────────────────────────────────────────

const IntroShell = ({ index = 0, total = 3, onSkip, onNext, primaryLabel, children }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
    {/* Subtle ambient fade — single radial that varies slightly per screen */}
    <div style={{ position: 'absolute', top: -120, left: '-30%', right: '-30%', height: 380, pointerEvents: 'none',
      background: index === 0
        ? 'radial-gradient(ellipse at center top, rgba(141,149,155,.12), transparent 65%)'
        : index === 1
        ? 'radial-gradient(ellipse at center top, rgba(110,231,161,.12), transparent 65%)'
        : 'radial-gradient(ellipse at center top, rgba(245,158,11,.10), transparent 65%)',
    }}/>
    <StatusBar />

    {/* Top bar: brand mark · skip */}
    <div style={{ padding: '6px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="18" height="14" viewBox="0 0 24 18" fill="none">
          <path d="M2 16L8.5 5L12 10L15 6L22 16Z" stroke={PTColors.fg} strokeWidth="1.6" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>PEAK TREKKER</span>
      </div>
      <button onClick={onSkip} style={{ background: 'none', border: 'none', color: PTColors.fg2, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', padding: '6px 4px' }}>跳过</button>
    </div>

    {/* Content area */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px 0' }}>
      {children}
    </div>

    {/* Bottom: dots + CTA */}
    <div style={{ padding: '0 24px 30px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
        {[...Array(total)].map((_, i) => (
          <span key={i} style={{
            width: i === index ? 22 : 6, height: 6, borderRadius: 999,
            background: i === index ? PTColors.fg : PTColors.outline,
            transition: 'width .2s ease',
          }}/>
        ))}
      </div>
      <PrimaryButton full onClick={onNext}>{primaryLabel || '下一步'}</PrimaryButton>
      {index === 0 && (
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: PTColors.fg2, lineHeight: 1.6 }}>
          Peak Trekker 不会要求任何权限 · 直到你第一次准备山行时
        </div>
      )}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────
//  Product previews — small, flat, suggestive
// ────────────────────────────────────────────────────────────

// Preview 1 — Mountain card with stats. A condensed echo of MountainDetail.
const PreviewChooseMountain = () => (
  <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 0.92', margin: '0 auto', padding: '12px 8px 0' }}>
    {/* Background card stack — implies "many mountains" */}
    <div style={{ position: 'absolute', top: 32, left: 28, right: 28, height: 200, borderRadius: 14, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, opacity: 0.55, transform: 'rotate(-3deg)' }}/>
    <div style={{ position: 'absolute', top: 24, left: 18, right: 38, height: 200, borderRadius: 14, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, opacity: 0.78, transform: 'rotate(2deg)' }}/>

    {/* Foreground card */}
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, background: PTColors.surface, boxShadow: '0 18px 36px rgba(0,0,0,.4)' }}>
      <div style={{ position: 'relative', height: 130 }}>
        <PhonePlaceholder h={130} tone="alpine" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.35) 0%, rgba(12,14,16,.0) 30%, rgba(12,14,16,.85) 100%)' }}/>
        {/* Ridgeline overlay sketch */}
        <svg width="100%" height="60" viewBox="0 0 280 60" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 32, opacity: .35 }}>
          <path d="M0 50 L60 28 L90 36 L130 18 L170 26 L200 12 L240 22 L280 8 L280 60 L0 60 Z" fill="rgba(245,247,248,.08)" stroke="rgba(245,247,248,.3)" strokeWidth=".6"/>
        </svg>
        <div style={{ position: 'absolute', top: 12, left: 14 }}>
          <Chip tone="active">中级及以上</Chip>
        </div>
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.005em' }}>玉珠峰</div>
          <div style={{ fontSize: 11, color: 'rgba(245,247,248,.7)', marginTop: 3 }}>青海 · 格尔木</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: '海拔', value: '6,178' },
          { label: '距离', value: '12.4' },
          { label: '爬升', value: '1.2k' },
          { label: '时长', value: '6h' },
        ].map((s, i, arr) => (
          <div key={i} style={{ padding: '12px 6px', textAlign: 'center', borderRight: i === arr.length - 1 ? 'none' : `1px solid ${PTColors.outline}` }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, color: PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: PTColors.fg2, marginTop: 3, letterSpacing: '.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Floating chips around the card to hint at filtering */}
    <div style={{ position: 'absolute', left: 8, bottom: 10, display: 'flex', gap: 6, padding: '6px 10px', borderRadius: 999, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, boxShadow: '0 8px 16px rgba(0,0,0,.3)' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: PTColors.fg }}>初级</span>
      <span style={{ fontSize: 10, color: PTColors.fg2 }}>· </span>
      <span style={{ fontSize: 10, color: PTColors.fg2 }}>5-7月</span>
    </div>
  </div>
);

// Preview 2 — Two paths split: live recording vs import. A condensed echo of HomeV4.
const PreviewRecordOrImport = () => (
  <div style={{ position: 'relative', padding: '20px 0 0' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {/* Path A — Record */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, background: PTColors.surface, padding: '14px 12px 12px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: PTColors.success, animation: 'introdot 1.4s ease-out infinite' }}/>
          <span style={{ fontSize: 9, fontWeight: 700, color: PTColors.fg, letterSpacing: '.18em' }}>记录中</span>
        </div>
        <div style={{ fontSize: 9, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.18em' }}>当前海拔</div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 28, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.02em' }}>5,240</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: PTColors.fg2, fontWeight: 600 }}>m</span>
        </div>
        {/* mini altitude bar */}
        <div style={{ marginTop: 12, height: 4, borderRadius: 2, background: PTColors.outline, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%', borderRadius: 2, background: `linear-gradient(90deg, ${PTColors.success}, #6EE7A1)` }}/>
        </div>
        <div style={{ marginTop: 6, fontSize: 9, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>距峰顶 938m</div>
        <div style={{ marginTop: 12, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, fontSize: 10, color: PTColors.fg2, fontWeight: 600, textAlign: 'center' }}>实时记录</div>
      </div>
      <style>{`@keyframes introdot { 0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)} 100%{box-shadow:0 0 0 8px rgba(34,197,94,0)} }`}</style>

      {/* Path B — Import */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px dashed ${PTColors.outline}`, background: 'rgba(255,255,255,.02)', padding: '14px 12px 12px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 4v12M7 11l5 5 5-5M5 20h14" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span style={{ fontSize: 9, fontWeight: 700, color: PTColors.fg, letterSpacing: '.18em' }}>导入轨迹</span>
        </div>
        {/* mock GPX preview */}
        <div style={{ height: 56, borderRadius: 8, background: 'rgba(0,0,0,.18)', border: `1px solid ${PTColors.outline}`, padding: 8, position: 'relative', overflow: 'hidden' }}>
          <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
            <path d="M0 35 Q20 28 35 24 T60 16 L72 8 Q82 12 100 22" stroke={PTColors.fg2} strokeWidth="1.4" fill="none" strokeDasharray="2 2"/>
            <circle cx="72" cy="8" r="2.5" fill={PTColors.fg}/>
          </svg>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: PTColors.fg }}>2024-09-22.gpx</div>
          <div style={{ fontSize: 9, color: PTColors.fg2, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>5,396m · 7h12m</div>
        </div>
        <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(245,247,248,.04)', border: `1px solid ${PTColors.outline}`, fontSize: 10, color: PTColors.fg2, fontWeight: 600, textAlign: 'center' }}>事后补录</div>
      </div>
    </div>

    {/* Connector caption */}
    <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: PTColors.fg2, letterSpacing: '.04em' }}>
      <span style={{ padding: '4px 10px', borderRadius: 999, background: PTColors.surface, border: `1px solid ${PTColors.outline}` }}>
        两种方式都能进入你的山行档案
      </span>
    </div>
  </div>
);

// Preview 3 — Memory card composition: the share asset.
const PreviewSaveAndShare = () => (
  <div style={{ position: 'relative', padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
    {/* The shared poster mock */}
    <div style={{ width: 200, borderRadius: 14, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, boxShadow: '0 22px 44px rgba(0,0,0,.5)', background: PTColors.surface, position: 'relative', zIndex: 2 }}>
      <div style={{ position: 'relative', height: 220 }}>
        <PhonePlaceholder h={220} tone="dawn" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.35) 0%, rgba(12,14,16,0) 30%, rgba(12,14,16,.92) 100%)' }}/>
        {/* watermark mark */}
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="11" height="9" viewBox="0 0 24 18" fill="none"><path d="M2 16L8.5 5L12 10L15 6L22 16Z" stroke={PTColors.fg} strokeWidth="1.4" strokeLinejoin="round"/></svg>
          <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(245,247,248,.85)', letterSpacing: '.16em', fontFamily: "'IBM Plex Mono',monospace" }}>PEAK TREKKER</span>
        </div>
        {/* date */}
        <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 9, color: 'rgba(245,247,248,.7)', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.12em' }}>2024.10.07</div>
        {/* main title */}
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 50 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.01em', lineHeight: 1.2 }}>玉珠峰</div>
          <div style={{ fontSize: 9, color: 'rgba(245,247,248,.7)', marginTop: 3, letterSpacing: '.04em' }}>青海 · 6,178m</div>
        </div>
        {/* big alt */}
        <div style={{ position: 'absolute', left: 14, bottom: 14, display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 24, fontWeight: 800, color: PTColors.success, letterSpacing: '-.02em' }}>6,178</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: PTColors.fg2 }}>m</span>
        </div>
        <div style={{ position: 'absolute', right: 14, bottom: 14, fontSize: 9, color: 'rgba(245,247,248,.65)', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.08em' }}>13:24 · 留证已确认</div>
      </div>
      {/* small reflection footer */}
      <div style={{ padding: '12px 14px', fontSize: 10, color: 'rgba(245,247,248,.72)', lineHeight: 1.65, fontStyle: 'normal' }}>
        <span style={{ color: PTColors.fg2 }}>「</span>到了那一刻只剩一句话可说<span style={{ color: PTColors.fg2 }}>」</span>
      </div>
    </div>

    {/* Floating photo thumbnails behind */}
    <div style={{ position: 'absolute', left: 24, top: 50, width: 64, height: 90, borderRadius: 12, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, transform: 'rotate(-8deg)', opacity: 0.85, zIndex: 1 }}>
      <PhonePlaceholder h={90} tone="slate" />
    </div>
    <div style={{ position: 'absolute', right: 18, top: 30, width: 56, height: 76, borderRadius: 12, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, transform: 'rotate(7deg)', opacity: 0.75, zIndex: 1 }}>
      <PhonePlaceholder h={76} tone="dusk" />
    </div>
    <div style={{ position: 'absolute', right: 12, top: 144, padding: '6px 10px', borderRadius: 999, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, fontSize: 9, fontWeight: 600, color: PTColors.fg, letterSpacing: '.06em', boxShadow: '0 8px 16px rgba(0,0,0,.4)', zIndex: 3 }}>
      <span style={{ color: PTColors.success }}>●</span> 山友圈
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────
//  The three intro screens
// ────────────────────────────────────────────────────────────

const IntroScreen1 = ({ onSkip, onNext }) => (
  <IntroShell index={0} total={3} onSkip={onSkip} onNext={onNext}>
    <div style={{ paddingTop: 26 }}>
      <PreviewChooseMountain />
    </div>
    <div style={{ flex: 1, padding: '36px 4px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>01 · 选山</div>
      <div style={{ marginTop: 14, fontSize: 28, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.02em', lineHeight: 1.25 }}>
        先认识这座山<br/>
        <span style={{ color: PTColors.fg2, fontWeight: 700 }}>再决定走不走</span>
      </div>
      <div style={{ marginTop: 16, fontSize: 14, color: 'rgba(245,247,248,.78)', lineHeight: 1.75, maxWidth: 320 }}>
        浏览国内可登顶的山峰 · 看清海拔、距离、季节窗口与等级要求。<br/>
        在出发前，了解每一座山。
      </div>
    </div>
  </IntroShell>
);

const IntroScreen2 = ({ onSkip, onNext }) => (
  <IntroShell index={1} total={3} onSkip={onSkip} onNext={onNext}>
    <div style={{ paddingTop: 18 }}>
      <PreviewRecordOrImport />
    </div>
    <div style={{ flex: 1, padding: '40px 4px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>02 · 记录</div>
      <div style={{ marginTop: 14, fontSize: 28, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.02em', lineHeight: 1.25 }}>
        现场记录或事后导入<br/>
        <span style={{ color: PTColors.fg2, fontWeight: 700 }}>都是你的山行</span>
      </div>
      <div style={{ marginTop: 16, fontSize: 14, color: 'rgba(245,247,248,.78)', lineHeight: 1.75, maxWidth: 320 }}>
        山上轻量记录海拔与轨迹 · 不依赖复杂导航。<br/>
        没用 Peak Trekker 也没关系 · 一份 GPX 文件就能补回这次经历。
      </div>
    </div>
  </IntroShell>
);

const IntroScreen3 = ({ onSkip, onNext }) => (
  <IntroShell index={2} total={3} onSkip={onSkip} onNext={onNext} primaryLabel="开始使用">
    <div style={{ paddingTop: 22 }}>
      <PreviewSaveAndShare />
    </div>
    <div style={{ flex: 1, padding: '40px 4px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.18em', fontFamily: "'IBM Plex Mono',monospace" }}>03 · 留下</div>
      <div style={{ marginTop: 14, fontSize: 28, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.02em', lineHeight: 1.25 }}>
        让这次山行<br/>
        <span style={{ color: PTColors.fg2, fontWeight: 700 }}>留下来</span>
      </div>
      <div style={{ marginTop: 16, fontSize: 14, color: 'rgba(245,247,248,.78)', lineHeight: 1.75, maxWidth: 320 }}>
        几张照片、一段心里的话、一张可分享的留证 ·<br/>
        放进属于你的山行档案。<br/>
        发不发出去，由你决定。
      </div>
    </div>
  </IntroShell>
);

Object.assign(window, {
  IntroScreen1, IntroScreen2, IntroScreen3,
});
