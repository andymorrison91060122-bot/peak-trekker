// Share flow v3 — refined editor + post-generation sheet + save success + community handoff
// Exports: ShareScreenV3 (refined editor), ShareActionSheet, ShareSavedToast, ShareCommunityCompose

// ───────── shared share-card preview (extracted so all screens can render the same poster) ─────────

const SharePoster = ({ template = 'classic', visual = 'photo', fields = { alt: true, dist: true, dur: true, date: true, loc: true }, accent = PTColors.success }) => (
  <div style={{ aspectRatio: '4/5', borderRadius: 16, overflow: 'hidden', position: 'relative', border: `1px solid ${PTColors.outline}`, background: PTColors.surface }}>
    {visual === 'photo' && <PhonePlaceholder h={420} tone="alpine" label="玉珠峰" />}
    {visual === 'map' && <ShareMapVisual />}
    {visual === 'altCard' && <ShareAltVisual />}
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,12,14,.25) 0%, rgba(10,12,14,0) 25%, rgba(10,12,14,.82))' }} />

    {template === 'classic' && (
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18 }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: '.22em', color: accent, marginBottom: 10 }}>PEAK TREKKER</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.01em', color: PTColors.fg }}>玉珠峰</div>
        {fields.alt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: accent, marginTop: 4 }}>6,178m</div>}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'rgba(245,247,248,.72)', flexWrap: 'wrap' }}>
          {fields.date && <span>2024·10·07</span>}
          {fields.dist && <span>12.4km</span>}
          {fields.dur && <span>7h 12m</span>}
          {fields.loc && <span>青海 · 格尔木</span>}
        </div>
      </div>
    )}
    {template === 'stamp' && (
      <div style={{ position: 'absolute', left: 18, right: 18, top: 18, bottom: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: '.22em', color: PTColors.fg }}>PEAK TREKKER</div>
          {fields.date && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: 'rgba(245,247,248,.7)' }}>2024·10·07</div>}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: PTColors.fg }}>玉珠峰</div>
          {fields.alt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 44, fontWeight: 800, color: accent, lineHeight: 1, marginTop: 2 }}>6178</div>}
          {fields.alt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: '.3em', color: 'rgba(245,247,248,.72)', marginTop: 2 }}>METERS · ALTITUDE</div>}
          <div style={{ marginTop: 10, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'rgba(245,247,248,.72)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {fields.dist && <span>12.4km</span>}{fields.dur && <span>· 7h12</span>}{fields.loc && <span>· 青海</span>}
          </div>
        </div>
      </div>
    )}
    {template === 'minimal' && (
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18 }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'rgba(245,247,248,.7)', marginBottom: 6 }}>{fields.date && '2024·10·07'}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: PTColors.fg }}>玉珠峰</div>
          {fields.alt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: accent, fontWeight: 600 }}>6,178m</div>}
        </div>
      </div>
    )}
  </div>
);

const ShareMapVisual = () => (
  <div style={{ height: '100%', width: '100%', background: '#1a2028', position: 'relative', overflow: 'hidden' }}>
    <svg width="100%" height="100%" viewBox="0 0 300 380" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
      {[...Array(10)].map((_, i) => (
        <ellipse key={i} cx="150" cy="200" rx={30 + i * 22} ry={20 + i * 14} stroke="rgba(141,149,155,.22)" strokeWidth="1" fill="none"/>
      ))}
      <path d="M40 320 Q90 240 150 200 T260 90" stroke={PTColors.success} strokeWidth="3" fill="none" strokeLinecap="round"/>
      <circle cx="40" cy="320" r="6" fill={PTColors.fg}/>
      <circle cx="150" cy="200" r="7" fill={PTColors.success}/>
    </svg>
  </div>
);
const ShareAltVisual = () => (
  <div style={{ height: '100%', width: '100%', background: 'linear-gradient(180deg,#1a2028 0%,#0e1215 100%)', position: 'relative' }}>
    <svg width="100%" height="100%" viewBox="0 0 300 380" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
      <path d="M0 280 L50 250 L100 220 L150 160 L170 120 L210 180 L260 230 L300 260 L300 380 L0 380 Z" fill={PTColors.success} opacity="0.22"/>
      <path d="M0 280 L50 250 L100 220 L150 160 L170 120 L210 180 L260 230 L300 260" stroke={PTColors.success} strokeWidth="2" fill="none"/>
      <circle cx="170" cy="120" r="5" fill={PTColors.success}/>
    </svg>
  </div>
);

// ───────── 1. Share Editor V3 — refined ─────────
// Same atomic structure as v2 (template / 主画面 / 显示字段) but tighter rhythm,
// segmented controls with iconography, and a generate CTA that opens an action sheet.

const ShareScreenV3 = ({ onBack, onGenerate }) => {
  const [template, setTemplate] = React.useState('classic');
  const [visual, setVisual] = React.useState('photo');
  const [fields, setFields] = React.useState({ alt: true, dist: true, dur: true, date: true, loc: true });
  const [sheet, setSheet] = React.useState(false);
  const toggle = (k) => setFields(f => ({ ...f, [k]: !f[k] }));

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 110 }}>
      <StatusBar />
      <TopBar title="生成分享" onBack={onBack} right={
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: PTColors.fg2, letterSpacing: '.08em' }}>4 : 5</div>
      } />

      {/* Preview */}
      <div style={{ padding: '8px 20px 0' }}>
        <SharePoster template={template} visual={visual} fields={fields} />
        {/* tiny meta below the preview */}
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: PTColors.fg2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: PTColors.success }} />
            实时预览
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>1080 × 1350</span>
        </div>
      </div>

      {/* Template segmented */}
      <div style={{ padding: '18px 20px 0' }}>
        <ShareLabel hint="决定文字与排版结构">模板</ShareLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { id: 'classic', label: '经典', preview: <TplClassic/> },
            { id: 'stamp',   label: '海拔卡', preview: <TplStamp/> },
            { id: 'minimal', label: '极简', preview: <TplMinimal/> },
          ].map(t => (
            <button key={t.id} onClick={() => setTemplate(t.id)} style={{
              background: PTColors.surface, borderRadius: 12, cursor: 'pointer',
              border: template === t.id ? `1.5px solid ${PTColors.primary}` : `1px solid ${PTColors.outline}`,
              padding: 8, fontFamily: 'inherit', display: 'grid', gap: 6, color: PTColors.fg,
            }}>
              <div style={{ aspectRatio: '4/5', borderRadius: 8, background: '#0f1316', border: `1px solid ${PTColors.outline}`, position: 'relative', overflow: 'hidden' }}>{t.preview}</div>
              <div style={{ fontSize: 11, fontWeight: template === t.id ? 700 : 500, color: template === t.id ? PTColors.fg : PTColors.fg2, textAlign: 'center' }}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main visual */}
      <div style={{ padding: '18px 20px 0' }}>
        <ShareLabel hint="背景画面用什么">主画面</ShareLabel>
        <div style={{ display: 'flex', gap: 8, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, padding: 4 }}>
          {[
            { id: 'photo', label: '照片', icon: <SegIconPhoto/> },
            { id: 'map', label: '路线', icon: <SegIconMap/> },
            { id: 'altCard', label: '海拔', icon: <SegIconAlt/> },
          ].map(v => (
            <button key={v.id} onClick={() => setVisual(v.id)} style={{
              flex: 1, height: 40, borderRadius: 8, cursor: 'pointer',
              background: visual === v.id ? 'rgba(34,197,94,.12)' : 'transparent',
              border: visual === v.id ? '1px solid rgba(34,197,94,.32)' : '1px solid transparent',
              color: visual === v.id ? PTColors.fg : PTColors.fg2, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>{v.icon}{v.label}</button>
          ))}
        </div>
      </div>

      {/* Fields — chip toggles, denser than v2's switch list */}
      <div style={{ padding: '18px 20px 0' }}>
        <ShareLabel hint="想让谁看到什么">显示字段</ShareLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { k: 'alt', label: '海拔 6,178m' },
            { k: 'dist', label: '距离 12.4km' },
            { k: 'dur', label: '时长 7h 12m' },
            { k: 'date', label: '日期 2024·10·07' },
            { k: 'loc', label: '地点 青海·格尔木' },
          ].map(f => (
            <button key={f.k} onClick={() => toggle(f.k)} style={{
              padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              background: fields[f.k] ? 'rgba(34,197,94,.12)' : PTColors.surface,
              border: fields[f.k] ? '1px solid rgba(34,197,94,.32)' : `1px solid ${PTColors.outline}`,
              color: fields[f.k] ? PTColors.fg : PTColors.fg2,
              fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <ChipDot on={fields[f.k]} /> {f.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: PTColors.fg2, lineHeight: 1.6 }}>保持轻量 — 一张分享卡只讲清一件事就够。</div>
      </div>

      <CTAFooterV3>
        <PrimaryButton full onClick={() => (onGenerate ? onGenerate() : setSheet(true))}>生成分享</PrimaryButton>
      </CTAFooterV3>

      {sheet && <ShareActionSheet template={template} visual={visual} fields={fields} onClose={() => setSheet(false)} onBackToEdit={() => setSheet(false)} />}
    </div>
  );
};

const CTAFooterV3 = ({ children }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(18,20,22,1) 30%)' }}>
    {children}
  </div>
);

const ShareLabel = ({ children, hint }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>{children}</div>
    {hint && <div style={{ fontSize: 11, color: PTColors.fg2, opacity: .7 }}>{hint}</div>}
  </div>
);

const ChipDot = ({ on }) => (
  <span style={{ width: 12, height: 12, borderRadius: 999, border: on ? `4px solid ${PTColors.success}` : `1.5px solid ${PTColors.outline}`, background: on ? '#0A0C0E' : 'transparent', display: 'inline-block', boxSizing: 'border-box' }} />
);

// Tiny template thumbnails
const TplClassic = () => (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#2a3138 0%,#1a2028 100%)' }}>
    <div style={{ position: 'absolute', left: 6, right: 6, bottom: 8 }}>
      <div style={{ width: 28, height: 2, background: PTColors.success, marginBottom: 3 }} />
      <div style={{ width: 32, height: 5, background: PTColors.fg, borderRadius: 1 }} />
      <div style={{ width: 22, height: 4, background: PTColors.success, marginTop: 2, borderRadius: 1 }} />
    </div>
  </div>
);
const TplStamp = () => (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#1f2329 0%,#0e1215 100%)', padding: 6 }}>
    <div style={{ width: 18, height: 2, background: PTColors.fg2, marginBottom: 14 }} />
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 800, color: PTColors.success, lineHeight: 1 }}>6178</div>
    <div style={{ width: 18, height: 1.5, background: PTColors.fg2, marginTop: 4 }} />
  </div>
);
const TplMinimal = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#15191c' }}>
    <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8 }}>
      <div style={{ width: 24, height: 4, background: PTColors.fg, borderRadius: 1, marginBottom: 2 }} />
      <div style={{ width: 14, height: 3, background: PTColors.success, borderRadius: 1 }} />
    </div>
  </div>
);

const SegIconPhoto = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="9" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M21 18l-5-5-9 7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>);
const SegIconMap = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9 4v16M15 6v16" stroke="currentColor" strokeWidth="1.6"/></svg>);
const SegIconAlt = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 18l5-6 4 4 5-8 4 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>);

// ───────── 2. Share Action Sheet (post-generate) ─────────
// Bottom sheet that overlays the editor. Compact preview thumbnail + action list.

const ShareActionSheet = ({ template = 'classic', visual = 'photo', fields, onClose, onBackToEdit, onSave, onSystem, onCommunity, onCopy }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
    {/* scrim */}
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }} />
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      background: '#15191c', borderTop: `1px solid ${PTColors.outline}`,
      borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '10px 16px 28px',
      animation: 'sheetUp .24s cubic-bezier(.2,.8,.2,1)',
    }}>
      <div style={{ width: 36, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.14)', margin: '4px auto 14px' }} />

      {/* Generated header */}
      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, alignItems: 'center', padding: '0 4px 14px' }}>
        <div style={{ width: 64, aspectRatio: '4/5', borderRadius: 10, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, background: PTColors.surface, position: 'relative' }}>
          <div style={{ transform: 'scale(.18)', transformOrigin: 'top left', width: 'calc(100%/.18)', height: 'calc(100%/.18)' }}>
            <SharePoster template={template} visual={visual} fields={fields} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: PTColors.fg }}>分享卡已生成</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4, lineHeight: 1.6 }}>
            玉珠峰 · 6,178m<br/>选一种方式带出去
          </div>
        </div>
      </div>

      {/* Primary actions — community is the differentiator, lifted */}
      <button onClick={onCommunity} style={{
        width: '100%', textAlign: 'left', padding: '14px', cursor: 'pointer', fontFamily: 'inherit',
        background: 'linear-gradient(180deg, rgba(34,197,94,.12), rgba(34,197,94,.04))',
        border: '1px solid rgba(34,197,94,.32)', borderRadius: 14,
        display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center', marginBottom: 8,
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(34,197,94,.18)', border: '1px solid rgba(34,197,94,.32)', display: 'grid', placeItems: 'center' }}>
          <CommunityIconV3 />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>发布到山友圈</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>给真正懂这座山的人看</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></svg>
      </button>

      {/* Secondary actions — saved-style 2x2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <SheetActionTile icon={<SaveIconV3/>} label="保存图片" sub="到相册" onClick={onSave} />
        <SheetActionTile icon={<SystemShareIconV3/>} label="系统分享" sub="微信 · 朋友圈 · 其他" onClick={onSystem} />
        <SheetActionTile icon={<LinkIconV3/>} label="复制链接" sub="活动详情页" onClick={onCopy} />
        <SheetActionTile icon={<EditIconV3/>} label="返回编辑" sub="再调一调" onClick={onBackToEdit} />
      </div>

      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.02)', border: `1px solid ${PTColors.outline}`, fontSize: 11, color: PTColors.fg2, lineHeight: 1.6 }}>
        分享出去的链接只展示你勾选的字段 · GPS 原始轨迹不会被公开
      </div>
    </div>

    <style>{`@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
  </div>
);

const SheetActionTile = ({ icon, label, sub, onClick }) => (
  <button onClick={onClick} style={{
    textAlign: 'left', padding: '12px', cursor: 'pointer', fontFamily: 'inherit',
    background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12,
  }}>
    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>{icon}</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg, marginTop: 10 }}>{label}</div>
    <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{sub}</div>
  </button>
);

const CommunityIconV3 = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="2.4" stroke={PTColors.success} strokeWidth="1.8"/><circle cx="15" cy="9" r="2.4" stroke={PTColors.success} strokeWidth="1.8"/><path d="M5 18c.6-2.4 2.4-3.6 4-3.6s3.4 1.2 4 3.6M11 18c.6-2.4 2.4-3.6 4-3.6s3.4 1.2 4 3.6" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round"/></svg>);
const SaveIconV3 = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 4v12M7 11l5 5 5-5M5 20h14" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const SystemShareIconV3 = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="2.5" stroke={PTColors.fg} strokeWidth="1.8"/><circle cx="18" cy="6" r="2.5" stroke={PTColors.fg} strokeWidth="1.8"/><circle cx="18" cy="18" r="2.5" stroke={PTColors.fg} strokeWidth="1.8"/><path d="M8 11l8-4M8 13l8 4" stroke={PTColors.fg} strokeWidth="1.8"/></svg>);
const LinkIconV3 = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10 14a4 4 0 0 1 0-6l3-3a4 4 0 1 1 6 6l-1.5 1.5M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 1 1-6-6l1.5-1.5" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/></svg>);
const EditIconV3 = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 19l4-1 11-11-3-3L5 15z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/></svg>);

// Pre-baked frame: Editor + sheet open (for the canvas)
const ShareEditorWithSheet = ({ onBack }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative' }}>
    <ShareScreenV3 onBack={onBack} onGenerate={() => {}} />
    <ShareActionSheet template="classic" visual="photo" fields={{ alt: true, dist: true, dur: true, date: true, loc: true }} />
  </div>
);

// ───────── 3. Save / Share Success ─────────
// Two flavors: a quiet toast over the sheet, and a calm full-screen confirmation.

const ShareSavedToast = ({ onBack }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative' }}>
    <ShareScreenV3 onBack={onBack} onGenerate={() => {}} />
    {/* Inline toast */}
    <div style={{
      position: 'absolute', left: '50%', bottom: 96, transform: 'translateX(-50%)',
      background: 'rgba(20,24,28,.92)', backdropFilter: 'blur(14px)',
      border: '1px solid rgba(34,197,94,.32)', borderRadius: 999,
      padding: '10px 16px 10px 12px', display: 'flex', alignItems: 'center', gap: 10,
      animation: 'toastIn .26s cubic-bezier(.2,.8,.2,1)', zIndex: 60,
      boxShadow: '0 10px 30px rgba(0,0,0,.45)',
    }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(34,197,94,.18)', border: '1px solid rgba(34,197,94,.32)', display: 'grid', placeItems: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10" stroke={PTColors.success} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>已保存到相册</span>
      <span style={{ fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>1080×1350</span>
    </div>
    <style>{`@keyframes toastIn { from { opacity:0; transform: translate(-50%, 12px); } to { opacity:1; transform: translate(-50%, 0); } }`}</style>
  </div>
);

const ShareSuccess = ({ onBack, onView, onAnother, kind = 'community' }) => {
  const copy = {
    save: { title: '保存好了', sub: '分享卡已存到相册 · 想发哪儿都行', primary: '看看下一座', secondary: '再做一张' },
    community: { title: '已发布到山友圈', sub: '走过同一座山的人会先看到', primary: '查看动态', secondary: '再做一张' },
    system: { title: '已发送', sub: '系统分享面板已为你打开', primary: '完成', secondary: '再做一张' },
  }[kind];

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 32 }}>
      <StatusBar />
      <div style={{ padding: '40px 24px 8px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.32)', display: 'grid', placeItems: 'center', margin: '0 auto', position: 'relative' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10" stroke={PTColors.success} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {/* faint expanding ring */}
          <span style={{ position: 'absolute', inset: -8, borderRadius: 999, border: '1px solid rgba(34,197,94,.18)' }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 18, lineHeight: 1.3 }}>{copy.title}</div>
        <div style={{ fontSize: 13, color: PTColors.fg2, marginTop: 8, lineHeight: 1.65 }}>{copy.sub}</div>
      </div>

      {/* Mini receipt */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ width: 132, margin: '0 auto', aspectRatio: '4/5', borderRadius: 12, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, background: PTColors.surface, position: 'relative' }}>
          <div style={{ transform: 'scale(.36)', transformOrigin: 'top left', width: 'calc(100%/.36)', height: 'calc(100%/.36)' }}>
            <SharePoster template="classic" visual="photo" fields={{ alt: true, dist: true, dur: true, date: true, loc: true }} />
          </div>
        </div>
        <div style={{ marginTop: 10, textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em' }}>
          PEAK TREKKER · {kind === 'community' ? 'POSTED' : kind === 'save' ? 'SAVED' : 'SHARED'} · 9:42 AM
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 26px' }}>
        <PrimaryButton full onClick={onView}>{copy.primary}</PrimaryButton>
        <button onClick={onAnother} style={{ marginTop: 10, width: '100%', height: 44, background: 'none', border: 'none', color: PTColors.fg2, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {copy.secondary}
        </button>
      </div>
    </div>
  );
};

// ───────── 4. Community handoff — prefilled compose ─────────

const ShareCommunityCompose = ({ onBack, onPost }) => {
  const [text, setText] = React.useState('凌晨从大本营出发，6:18 站到山顶。\n风很大，但视野完全打开了。');
  const [linkActivity, setLinkActivity] = React.useState(true);
  const [tagPeople, setTagPeople] = React.useState(false);
  const tags = ['#玉珠峰', '#青海格尔木', '#5000米以上'];

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 110 }}>
      <StatusBar />
      <TopBar
        title="发布到山友圈"
        onBack={onBack}
        right={<button onClick={onPost} style={{ background: 'none', border: 'none', color: PTColors.success, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>发布</button>}
      />

      {/* Author */}
      <div style={{ padding: '6px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 999, background: 'linear-gradient(135deg,#22c55e,#0e7d3a)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: '#08120D' }}>L</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>Lin · 山友</div>
          <div style={{ fontSize: 11, color: PTColors.fg2 }}>仅山友圈可见 · 24h 内可编辑</div>
        </div>
      </div>

      {/* Text body */}
      <div style={{ padding: '14px 20px 0' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          style={{
            width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none',
            color: PTColors.fg, fontFamily: 'inherit', fontSize: 15, lineHeight: 1.6,
          }}
        />
        {/* tag row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {tags.map(t => (
            <span key={t} style={{ fontSize: 12, color: PTColors.success, fontWeight: 600 }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Attached share card preview */}
      <div style={{ padding: '14px 20px 0' }}>
        <ShareLabel hint="自动随帖一起发出">附带分享卡</ShareLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 12, alignItems: 'stretch', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: 12 }}>
          <div style={{ width: 88, aspectRatio: '4/5', borderRadius: 10, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, position: 'relative', background: PTColors.bg }}>
            <div style={{ transform: 'scale(.235)', transformOrigin: 'top left', width: 'calc(100%/.235)', height: 'calc(100%/.235)' }}>
              <SharePoster template="classic" visual="photo" fields={{ alt: true, dist: true, dur: true, date: true, loc: true }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>玉珠峰</div>
              <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4 }}>2024·10·07 · 7h 12m</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700, color: PTColors.success }}>6,178m</span>
                <span style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em' }}>ALT</span>
              </div>
            </div>
            <button style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: PTColors.fg2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>更换样式 →</button>
          </div>
        </div>
      </div>

      {/* Options */}
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, overflow: 'hidden' }}>
          <ComposeRow icon={<RouteRowIcon/>} label="关联活动详情" sub="点开分享卡可跳转" on={linkActivity} onChange={() => setLinkActivity(v => !v)} />
          <ComposeRow icon={<TagPeopleIcon/>} label="@同行山友" sub="目前同行 0 人" on={tagPeople} onChange={() => setTagPeople(v => !v)} last />
        </div>
      </div>

      <CTAFooterV3>
        <PrimaryButton full onClick={onPost}>发布到山友圈</PrimaryButton>
      </CTAFooterV3>
    </div>
  );
};

const ComposeRow = ({ icon, label, sub, on, onChange, last }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 44px', gap: 12, alignItems: 'center', padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>{icon}</div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>{label}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{sub}</div>
    </div>
    <button onClick={onChange} style={{
      width: 40, height: 22, borderRadius: 999, position: 'relative', cursor: 'pointer',
      background: on ? PTColors.primary : 'rgba(255,255,255,.12)', border: 'none', transition: 'background .15s',
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 999, background: '#fff', transition: 'left .15s' }} />
    </button>
  </div>
);

const RouteRowIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 19c4 0 4-12 8-12s4 12 8 12" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/><circle cx="5" cy="19" r="1.6" fill={PTColors.fg}/><circle cx="21" cy="19" r="1.6" fill={PTColors.success}/></svg>);
const TagPeopleIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="2.4" stroke={PTColors.fg} strokeWidth="1.8"/><circle cx="16" cy="10" r="2" stroke={PTColors.fg2} strokeWidth="1.8"/><path d="M4 18c.5-2.4 2.5-3.6 5-3.6s4.5 1.2 5 3.6M14 18c.4-1.8 1.8-2.8 3.5-2.8s3.1 1 3.5 2.8" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/></svg>);

// Posted-success variant for community
const ShareCommunityPosted = ({ onView, onAnother }) => (
  <ShareSuccess onView={onView} onAnother={onAnother} kind="community" />
);
const ShareSavedSuccess = ({ onView, onAnother }) => (
  <ShareSuccess onView={onView} onAnother={onAnother} kind="save" />
);

Object.assign(window, {
  ShareScreenV3, ShareActionSheet, ShareEditorWithSheet,
  ShareSavedToast, ShareSuccess, ShareSavedSuccess, ShareCommunityPosted,
  ShareCommunityCompose,
});
