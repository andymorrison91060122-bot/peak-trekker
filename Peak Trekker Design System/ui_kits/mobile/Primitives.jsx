// Peak Trekker mobile — shared tokens + primitives
// Exposes: PTColors, PTIcons, Chip, StatTile, PrimaryButton, SecondaryButton, IconButton, AltitudeBar, StatusBar, TabBar, TopBar, PhonePlaceholder

const PTColors = {
  bg: '#121416',
  surface: '#23272C',
  elevated: '#282D33',
  outline: '#2F353B',
  fg: '#F5F7F8',
  fg2: '#8D959B',
  primary: '#22C55E',
  success: '#6EE7A1',
  warn: '#F59E0B',
  error: '#EF4444',
};

// Inline SVG icons — 1.8 stroke, two-tone, 20-24px
const Icon = ({ d, size = 22, stroke = PTColors.fg, fill = 'none', children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} {...p}>{children || <path d={d} stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}</svg>
);

const PTIcons = {
  mountain: (p={}) => <Icon size={p.size||22}><path d="M4 17L9.8 8.2a1 1 0 0 1 1.7 0L20 17" stroke={p.active?PTColors.success:PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 17h10" stroke={p.active?PTColors.primary:PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
  archive: (p={}) => <Icon size={p.size||22}><path d="M5.5 5.5h11A1.5 1.5 0 0 1 18 7v11.5l-3-1.6-3 1.6-3-1.6-3 1.6V7a1.5 1.5 0 0 1 1.5-1.5z" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8" strokeLinejoin="round"/><path d="M9 10.5h6M9 13.5h4" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.6" strokeLinecap="round"/></Icon>,
  prep: (p={}) => <Icon size={p.size||22}><path d="M7 19V7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5V19" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8"/><path d="M9 6.5C9 5.1 10.1 4 11.5 4h1C13.9 4 15 5.1 15 6.5M9.5 11.5h5" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
  record: (p={}) => <Icon size={p.size||22}><path d="M11 5h2M12 5v11M8.5 20h7" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/><path d="M8 8.5c1.5.5 3 1.7 4 3.5 1.2-1.8 2.5-3 4-3.5" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
  community: (p={}) => <Icon size={p.size||22}><circle cx="9" cy="9" r="2" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8"/><circle cx="15" cy="9" r="2" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8"/><path d="M6 16.5c0-1.6 1.4-3 3-3s3 1.4 3 3M12 16.5c0-1.6 1.4-3 3-3s3 1.4 3 3" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
  me: (p={}) => <Icon size={p.size||22}><circle cx="12" cy="8.5" r="3" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8"/><path d="M6.5 18c1.6-2.4 3.7-3.6 5.5-3.6S15.9 15.6 17.5 18" stroke={p.active?PTColors.fg:PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
  back: () => <Icon size={22}><path d="M15 6l-6 6 6 6" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>,
  share: () => <Icon size={20}><path d="M12 4v12M7 9l5-5 5 5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>,
  more: () => <Icon size={20}><circle cx="5" cy="12" r="1.6" fill={PTColors.fg}/><circle cx="12" cy="12" r="1.6" fill={PTColors.fg}/><circle cx="19" cy="12" r="1.6" fill={PTColors.fg}/></Icon>,
  search: () => <Icon size={18}><circle cx="11" cy="11" r="6.5" stroke={PTColors.fg} strokeWidth="1.8"/><path d="M16 16l4 4" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
  filter: () => <Icon size={18}><path d="M4 6h16M7 12h10M10 18h4" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
  pin: () => <Icon size={16}><path d="M12 2C7.6 2 4 5.6 4 10c0 5.4 8 12 8 12s8-6.6 8-12c0-4.4-3.6-8-8-8z" stroke={PTColors.fg2} strokeWidth="1.8"/><circle cx="12" cy="10" r="3" stroke={PTColors.fg} strokeWidth="1.8"/></Icon>,
  check: (c=PTColors.success) => <Icon size={18}><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.8"/><path d="M8 12l3 3 5-6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>,
  warn: () => <Icon size={18}><path d="M12 3l10 18H2z" stroke={PTColors.warn} strokeWidth="1.8" strokeLinejoin="round"/><path d="M12 10v5M12 18v.5" stroke={PTColors.warn} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
  camera: () => <Icon size={22}><path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke={PTColors.fg} strokeWidth="1.8"/><circle cx="12" cy="13" r="3.2" stroke={PTColors.fg} strokeWidth="1.8"/></Icon>,
  gps: () => <Icon size={18}><circle cx="12" cy="12" r="3" stroke={PTColors.primary} strokeWidth="1.8"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke={PTColors.primary} strokeWidth="1.8" strokeLinecap="round"/></Icon>,
};

const Chip = ({ children, active, tone }) => {
  const toneColors = {
    success: { bg: 'rgba(110,231,161,.12)', fg: PTColors.success, bd: 'rgba(110,231,161,.26)' },
    warn: { bg: 'rgba(245,158,11,.14)', fg: PTColors.warn, bd: 'rgba(245,158,11,.28)' },
    error: { bg: 'rgba(239,68,68,.14)', fg: PTColors.error, bd: 'rgba(239,68,68,.28)' },
    active: { bg: 'rgba(34,197,94,.14)', fg: PTColors.success, bd: 'rgba(34,197,94,.26)' },
  };
  const t = toneColors[tone] || (active ? toneColors.active : null);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
      borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      background: t?.bg || 'rgba(255,255,255,.04)',
      color: t?.fg || PTColors.fg2,
      border: t ? `1px solid ${t.bd}` : '1px solid transparent',
    }}>{children}</span>
  );
};

const StatTile = ({ label, value, accent }) => (
  <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.04)', borderRadius: 10, padding: '10px 10px' }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700, color: accent ? PTColors.success : PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 3 }}>{label}</div>
  </div>
);

const PrimaryButton = ({ children, onClick, full, disabled }) => (
  <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
    height: 46, padding: '0 22px', width: full ? '100%' : undefined,
    background: PTColors.primary, color: '#08120D', border: 'none',
    borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  }}>{children}</button>
);

const SecondaryButton = ({ children, onClick, full }) => (
  <button onClick={onClick} style={{
    height: 46, padding: '0 18px', width: full ? '100%' : undefined,
    background: PTColors.elevated, color: PTColors.fg, border: `1px solid ${PTColors.outline}`,
    borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  }}>{children}</button>
);

const IconButton = ({ children, onClick, round }) => (
  <button onClick={onClick} style={{
    width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: round ? 999 : 10, border: `1px solid ${PTColors.outline}`, background: 'rgba(18,20,22,.7)',
    backdropFilter: 'blur(12px)', color: PTColors.fg, cursor: 'pointer',
  }}>{children}</button>
);

const AltitudeBar = ({ value, max = 8848, label, mono }) => {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        {label && <span style={{ fontSize: 12, color: PTColors.fg2 }}>{label}</span>}
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: PTColors.success, fontVariantNumeric: 'tabular-nums' }}>{(mono || value.toLocaleString())}m</span>
      </div>
      <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg,#16a34a 0%,#6ee7a1 100%)' }} />
      </div>
    </div>
  );
};

const StatusBar = () => (
  <div style={{
    height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', fontSize: 14, fontWeight: 600, color: PTColors.fg,
    fontFamily: "'IBM Plex Mono',monospace", fontVariantNumeric: 'tabular-nums',
  }}>
    <span>9:41</span>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <svg width="16" height="10" viewBox="0 0 16 10"><path d="M1 9h2V6H1zM5 9h2V4H5zM9 9h2V2H9zM13 9h2V0h-2z" fill={PTColors.fg}/></svg>
      <svg width="24" height="11" viewBox="0 0 24 11"><rect x="1" y="1" width="20" height="9" rx="2" stroke={PTColors.fg} fill="none"/><rect x="3" y="3" width="16" height="5" fill={PTColors.fg}/><rect x="22" y="4" width="1.5" height="3" fill={PTColors.fg}/></svg>
    </div>
  </div>
);

const TabBar = ({ active = 'explore', onChange }) => {
  const tabs = [
    { id: 'explore', label: '探索', Icon: PTIcons.mountain },
    { id: 'archive', label: '山行', Icon: PTIcons.archive },
    { id: 'record', label: '出发', Icon: PTIcons.record },
    { id: 'community', label: '山友圈', Icon: PTIcons.community },
    { id: 'me', label: '我的', Icon: PTIcons.me },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      background: 'rgba(18,20,22,.92)', backdropFilter: 'blur(18px)',
      borderTop: `1px solid ${PTColors.outline}`, padding: '8px 0 22px',
      display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button key={t.id} onClick={() => onChange && onChange(t.id)} style={{
            flex: 1, background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            color: isActive ? PTColors.fg : PTColors.fg2,
          }}>
            <div style={{
              width: 32, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center',
              background: isActive ? 'rgba(34,197,94,.12)' : 'transparent',
              border: isActive ? '1px solid rgba(34,197,94,.22)' : '1px solid transparent',
            }}>
              <t.Icon active={isActive} />
            </div>
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const TopBar = ({ title, right, onBack, transparent }) => (
  <div style={{
    height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 12px',
    background: transparent ? 'transparent' : 'rgba(18,20,22,.88)',
    backdropFilter: transparent ? 'none' : 'blur(16px)',
    borderBottom: transparent ? 'none' : `1px solid rgba(255,255,255,.05)`,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
      {onBack && <IconButton round onClick={onBack}><PTIcons.back /></IconButton>}
    </div>
    <div style={{ fontSize: 15, fontWeight: 600, color: PTColors.fg }}>{title}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80, justifyContent: 'flex-end' }}>{right}</div>
  </div>
);

// Realistic photo-placeholder — muted neutral tones, subtle ridge silhouettes,
// film-grain noise. Not a glowing illustration. Simulates a real photo until one is attached.
const PhonePlaceholder = ({ label, h = 200, tone = 'slate' }) => {
  const palettes = {
    slate: { sky: '#3a4148', mid: '#2a3036', near: '#1a1f24', far: '#4c545c' },
    dusk:  { sky: '#504036', mid: '#342a24', near: '#1e1815', far: '#6b564a' },
    alpine:{ sky: '#4a5560', mid: '#2f3841', near: '#1b2128', far: '#5e6b78' },
    dawn:  { sky: '#464040', mid: '#2a2525', near: '#1a1717', far: '#5c5656' },
  };
  const p = palettes[tone] || palettes.slate;
  const gradId = 'pp-' + tone;
  return (
    <div style={{ height: h, position: 'relative', overflow: 'hidden', background: p.near }}>
      <svg width="100%" height="100%" viewBox="0 0 375 200" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.sky}/>
            <stop offset="55%" stopColor={p.mid}/>
            <stop offset="100%" stopColor={p.near}/>
          </linearGradient>
          <filter id={gradId+'n'}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>
            <feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .08 0"/>
          </filter>
        </defs>
        <rect width="375" height="200" fill={`url(#${gradId})`}/>
        {/* Far ridge */}
        <path d="M0 120 L50 96 L95 108 L140 78 L195 96 L245 82 L295 104 L345 88 L375 102 L375 200 L0 200 Z" fill={p.far} opacity="0.55"/>
        {/* Mid ridge */}
        <path d="M0 150 L60 122 L110 138 L165 112 L215 130 L270 116 L325 134 L375 124 L375 200 L0 200 Z" fill={p.mid} opacity="0.85"/>
        {/* Near silhouette */}
        <path d="M0 178 L75 152 L130 166 L195 140 L245 162 L305 148 L375 168 L375 200 L0 200 Z" fill={p.near}/>
        {/* Film grain */}
        <rect width="375" height="200" filter={`url(#${gradId}n)`} opacity="0.5"/>
      </svg>
      {/* Photo vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.35) 100%)', pointerEvents: 'none' }} />
      {label && <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 9, fontWeight: 500, color: 'rgba(245,247,248,.32)', letterSpacing: '.08em', fontFamily: "'IBM Plex Mono',monospace" }}>IMG · {label}</div>}
    </div>
  );
};

Object.assign(window, { PTColors, PTIcons, Chip, StatTile, PrimaryButton, SecondaryButton, IconButton, AltitudeBar, StatusBar, TabBar, TopBar, PhonePlaceholder });
