// Import flow — 7 screens.
// Exports: ImportEntry, ImportUploadEmpty, ImportUploadSelected, ImportUploadParsing, ImportUploadError,
//          ImportPreview, ImportMatch, ImportNoMatch, ImportSuccess, ImportFAQ

// ───────── shared atoms ─────────

const FlowHeader = ({ step, total = 4, title, onBack }) => (
  <div style={{ padding: '4px 16px 14px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, color: PTColors.fg, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: PTColors.fg2, letterSpacing: '.1em' }}>{String(step).padStart(2,'0')} / {String(total).padStart(2,'0')}</div>
      <div style={{ width: 36 }} />
    </div>
    {title && <div style={{ fontSize: 22, fontWeight: 700, marginTop: 18, lineHeight: 1.25 }}>{title}</div>}
  </div>
);

const FileIcon = ({ color = PTColors.fg, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M14 3v5h5" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
);

const CTAFooter = ({ children }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 16px 22px', background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,1) 30%)' }}>
    {children}
  </div>
);

// ───────── 1. Import Entry ─────────

const ImportEntry = ({ onBack, onUpload, onHelp }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 110 }}>
    <StatusBar />
    <FlowHeader step={1} title={<>把这次结果<br/>带回来</>} onBack={onBack} />

    <div style={{ padding: '4px 20px 0', fontSize: 13, color: PTColors.fg2, lineHeight: 1.7 }}>
      从手表、其他 App 或健康记录中导出的轨迹，都可以导入到 Peak Trekker，作为这次山行的依据。
    </div>

    {/* Format card */}
    <div style={{ padding: '22px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase' }}>支持格式</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {['GPX', 'KML', 'FIT', 'TCX'].map(f => (
            <div key={f} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: PTColors.fg }}>{f}</div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 10, lineHeight: 1.6 }}>
          可从 Garmin Connect、佳明 / 高驰 / 苹果健康、两步路、Strava 等导出
        </div>
      </div>
    </div>

    {/* What happens next */}
    <div style={{ padding: '14px 20px 0', fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase' }}>导入后会做的事</div>
    <div style={{ padding: '8px 16px 0', display: 'grid', gap: 8 }}>
      {[
        ['01', '解析轨迹', '提取距离、时长、海拔与时间'],
        ['02', '匹配山峰', '尝试关联到已收录山峰'],
        ['03', '存入档案', '成为你的一次山行记录'],
      ].map(([n, t, s]) => (
        <div key={n} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12, alignItems: 'center', padding: '10px 12px', border: `1px solid ${PTColors.outline}`, borderRadius: 12 }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: PTColors.fg2 }}>{n}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>{t}</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{s}</div>
          </div>
        </div>
      ))}
    </div>

    <CTAFooter>
      <PrimaryButton full onClick={onUpload}>上传轨迹文件</PrimaryButton>
      <button onClick={onHelp} style={{ marginTop: 10, width: '100%', height: 44, background: 'none', border: 'none', color: PTColors.fg2, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>查看导入说明</button>
    </CTAFooter>
  </div>
);

// ───────── 2. Import Upload (4 states) ─────────

const UploadFrame = ({ onBack, children, footer, step = 2 }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 110 }}>
    <StatusBar />
    <FlowHeader step={step} title="上传轨迹文件" onBack={onBack} />
    <div style={{ padding: '8px 16px 0' }}>{children}</div>
    {footer && <CTAFooter>{footer}</CTAFooter>}
  </div>
);

const UploadDropZone = ({ tone = 'idle' }) => {
  const colors = {
    idle: { bd: PTColors.outline, bg: 'rgba(255,255,255,.02)', fg: PTColors.fg2 },
    error: { bd: 'rgba(239,80,80,.4)', bg: 'rgba(239,80,80,.05)', fg: '#EF5050' },
  }[tone];
  return (
    <div style={{
      border: `1.5px dashed ${colors.bd}`, borderRadius: 16, padding: '32px 16px',
      background: colors.bg, textAlign: 'center',
    }}>
      <div style={{ width: 56, height: 56, margin: '0 auto', borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}` }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M12 16V4M7 9l5-5 5 5" stroke={colors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke={colors.fg} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg, marginTop: 14 }}>选择轨迹文件</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 6, lineHeight: 1.6 }}>从相册、文件、第三方 App 中选择<br/>GPX · KML · FIT · TCX</div>
    </div>
  );
};

const ImportUploadEmpty = ({ onBack, onPick }) => (
  <UploadFrame onBack={onBack} footer={<PrimaryButton full onClick={onPick}>从「文件」中选择</PrimaryButton>}>
    <UploadDropZone />
    <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
      <SourceRow icon={<HealthIcon />} label="从「健康」导入" sub="iOS · 自动读取最近的徒步" />
      <SourceRow icon={<CloudIcon />} label="从云端 / 第三方 App" sub="Garmin · 高驰 · 两步路 · Strava" />
    </div>
  </UploadFrame>
);

const SourceRow = ({ icon, label, sub }) => (
  <button style={{
    display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center',
    padding: '12px 14px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
    borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
  }}>
    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>{icon}</div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>{label}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{sub}</div>
    </div>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);
const HealthIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" stroke="#EF5050" strokeWidth="1.8" strokeLinejoin="round"/></svg>);
const CloudIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1A4 4 0 0 0 7 18z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/></svg>);

const ImportUploadSelected = ({ onBack, onContinue, onRemove }) => (
  <UploadFrame onBack={onBack} footer={<PrimaryButton full onClick={onContinue}>开始解析</PrimaryButton>}>
    <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.22)', display: 'grid', placeItems: 'center' }}>
          <FileIcon color={PTColors.success} />
        </div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>haba_2025_10_02.gpx</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3, fontFamily: "'IBM Plex Mono',monospace" }}>2.4 MB · GPX</div>
        </div>
        <button onClick={onRemove} style={{ width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`, color: PTColors.fg2, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${PTColors.outline}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: 999, background: PTColors.success }} />
        <div style={{ fontSize: 11, color: PTColors.fg2 }}>文件可读 · 等待解析</div>
      </div>
    </div>
    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.02)', border: `1px solid ${PTColors.outline}`, fontSize: 11, color: PTColors.fg2, lineHeight: 1.6 }}>
      解析仅在你的设备上完成 · 文件不会被上传
    </div>
  </UploadFrame>
);

const ImportUploadParsing = ({ onBack }) => {
  const [pct, setPct] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setPct(p => p >= 64 ? 64 : p + 4), 220);
    return () => clearInterval(t);
  }, []);
  return (
    <UploadFrame onBack={onBack}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.22)', display: 'grid', placeItems: 'center' }}>
            <FileIcon color={PTColors.success} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>haba_2025_10_02.gpx</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>正在解析…</div>
          </div>
        </div>
        <div style={{ marginTop: 16, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: PTColors.success, transition: 'width .2s ease' }} />
        </div>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>
          <span>{pct}%</span><span>读取轨迹点 · 1,284 / 2,008</span>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
        {[['读取文件', true], ['提取轨迹点', true], ['计算距离与爬升', false], ['匹配山峰', false]].map(([t, done], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'center', padding: '10px 12px', border: `1px solid ${PTColors.outline}`, borderRadius: 10, background: PTColors.surface }}>
            {done
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill={PTColors.success}/><path d="M8 12.5l3 3 5-6" stroke="#0A0C0E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <div style={{ width: 16, height: 16, borderRadius: 999, border: `1.5px solid ${PTColors.outline}`, margin: '0 1px' }} />
            }
            <div style={{ fontSize: 12, color: done ? PTColors.fg : PTColors.fg2 }}>{t}</div>
          </div>
        ))}
      </div>
    </UploadFrame>
  );
};

const ImportUploadError = ({ onBack, onRetry, onPickAnother }) => (
  <UploadFrame onBack={onBack} footer={<>
    <PrimaryButton full onClick={onPickAnother}>选择其他文件</PrimaryButton>
    <button onClick={onRetry} style={{ marginTop: 10, width: '100%', height: 44, background: 'none', border: 'none', color: PTColors.fg2, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>重试解析</button>
  </>}>
    <div style={{ background: 'rgba(239,80,80,.05)', border: '1px solid rgba(239,80,80,.28)', borderRadius: 14, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(239,80,80,.1)', border: '1px solid rgba(239,80,80,.28)', display: 'grid', placeItems: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 17h.01" stroke="#EF5050" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#EF5050" strokeWidth="1.8"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>无法解析这个文件</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>文件格式可能不被支持，或内容已损坏</div>
        </div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(239,80,80,.18)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>route_export.zip</div>
        <div style={{ fontSize: 10, color: '#EF5050', fontWeight: 700, letterSpacing: '.05em' }}>UNSUPPORTED</div>
      </div>
    </div>

    <div style={{ marginTop: 14, padding: '14px', borderRadius: 12, border: `1px solid ${PTColors.outline}`, background: PTColors.surface }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg }}>常见问题</div>
      <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px', fontSize: 11, color: PTColors.fg2, lineHeight: 1.8 }}>
        <li>压缩包请先解压再选择</li>
        <li>仅支持 GPX / KML / FIT / TCX 格式</li>
        <li>文件需包含至少一条带时间与位置的轨迹</li>
      </ul>
    </div>
  </UploadFrame>
);

// ───────── 3. Parsing Result / Preview ─────────

const RoutePreviewSVG = () => (
  <svg viewBox="0 0 320 140" style={{ width: '100%', height: 140, display: 'block' }}>
    <defs>
      <linearGradient id="elevg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="rgba(34,197,94,.18)"/>
        <stop offset="100%" stopColor="rgba(34,197,94,0)"/>
      </linearGradient>
    </defs>
    {/* faint reference grid */}
    <g stroke="rgba(255,255,255,.04)" strokeWidth="1">
      <line x1="0" y1="35" x2="320" y2="35"/>
      <line x1="0" y1="70" x2="320" y2="70"/>
      <line x1="0" y1="105" x2="320" y2="105"/>
    </g>
    {/* elevation profile fill */}
    <path d="M0 120 L20 105 L48 92 L78 78 L110 64 L140 50 L168 36 L188 28 L210 38 L240 56 L268 78 L296 96 L320 110 L320 140 L0 140Z" fill="url(#elevg)"/>
    {/* line */}
    <path d="M0 120 L20 105 L48 92 L78 78 L110 64 L140 50 L168 36 L188 28 L210 38 L240 56 L268 78 L296 96 L320 110" stroke="#22C55E" strokeWidth="1.6" fill="none"/>
    {/* summit marker */}
    <circle cx="188" cy="28" r="3.5" fill="#22C55E"/>
    <circle cx="188" cy="28" r="7" fill="none" stroke="rgba(34,197,94,.4)" strokeWidth="1"/>
    <text x="188" y="18" textAnchor="middle" fontFamily="'IBM Plex Mono',monospace" fontSize="9" fill="#22C55E">5,396m</text>
  </svg>
);

const ImportPreview = ({ onBack, onContinue }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 110 }}>
    <StatusBar />
    <FlowHeader step={3} title="解析完成" onBack={onBack} />

    <div style={{ padding: '0 16px' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>轨迹概览</div>
          <Chip tone="success">● 解析成功</Chip>
        </div>
        <RoutePreviewSVG />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 16px 12px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: PTColors.fg2 }}>
          <span>3,180m</span><span>距离 9.8km</span><span>5,396m</span>
        </div>
      </div>
    </div>

    <div style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <StatTile label="距离" value="9.8 km" />
      <StatTile label="时长" value="7h 42m" />
      <StatTile label="累计爬升" value="2,216 m" accent />
      <StatTile label="最高点" value="5,396 m" accent />
    </div>

    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase' }}>起止时间</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 14px 1fr', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: PTColors.fg2 }}>出发</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, marginTop: 2 }}>10/02 04:18</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></svg>
          <div>
            <div style={{ fontSize: 10, color: PTColors.fg2 }}>结束</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, marginTop: 2 }}>10/02 12:00</div>
          </div>
        </div>
      </div>
    </div>

    <CTAFooter>
      <PrimaryButton full onClick={onContinue}>继续</PrimaryButton>
      <button style={{ marginTop: 10, width: '100%', height: 44, background: 'none', border: 'none', color: PTColors.fg2, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>查看完整轨迹</button>
    </CTAFooter>
  </div>
);

// ───────── 4. Mountain Match ─────────

const MatchRow = ({ name, region, alt, confidence, selected, best, onClick }) => (
  <button onClick={onClick} style={{
    width: '100%', textAlign: 'left', padding: '14px', cursor: 'pointer', fontFamily: 'inherit',
    background: selected ? 'rgba(34,197,94,.08)' : PTColors.surface,
    border: selected ? '1px solid rgba(34,197,94,.4)' : `1px solid ${PTColors.outline}`,
    borderRadius: 14,
    display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 12, alignItems: 'center',
  }}>
    <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: '#1a1f24', display: 'grid', placeItems: 'center' }}>
      <PhonePlaceholder h={44} tone="alpine" />
    </div>
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>{name}</div>
        {best && <div style={{ fontSize: 9, fontWeight: 700, color: PTColors.success, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.26)', letterSpacing: '.05em' }}>最匹配</div>}
      </div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>{region} · {alt.toLocaleString()}m</div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, color: confidence >= 80 ? PTColors.success : PTColors.fg }}>{confidence}%</div>
      <div style={{ fontSize: 9, color: PTColors.fg2, marginTop: 2, letterSpacing: '.05em' }}>相似度</div>
    </div>
  </button>
);

const ImportMatch = ({ onBack, onConfirm, onManual }) => {
  const [sel, setSel] = React.useState('hbx');
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 110 }}>
      <StatusBar />
      <FlowHeader step={4} title={<>看起来是<br/>这座山</>} onBack={onBack} />

      <div style={{ padding: '0 20px 14px', fontSize: 13, color: PTColors.fg2, lineHeight: 1.7 }}>
        根据轨迹的位置与最高点，系统找到了 2 个候选。请确认是哪一座。
      </div>

      <div style={{ padding: '0 16px', display: 'grid', gap: 10 }}>
        <MatchRow name="哈巴雪山" region="云南 · 香格里拉" alt={5396} confidence={94} best selected={sel==='hbx'} onClick={() => setSel('hbx')} />
        <MatchRow name="玉龙雪山" region="云南 · 丽江" alt={5596} confidence={42} selected={sel==='ylx'} onClick={() => setSel('ylx')} />
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <button onClick={onManual} style={{
          width: '100%', height: 48, background: 'rgba(255,255,255,.02)', border: `1px dashed ${PTColors.outline}`,
          borderRadius: 12, color: PTColors.fg2, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6" stroke={PTColors.fg2} strokeWidth="1.8"/><path d="M20 20l-4-4" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/></svg>
          都不是，自己找
        </button>
      </div>

      <CTAFooter>
        <PrimaryButton full onClick={onConfirm}>确认是这一座</PrimaryButton>
      </CTAFooter>
    </div>
  );
};

// ───────── 5. No Match ─────────

const ImportNoMatch = ({ onBack, onStash, onSearch, onLater }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 24 }}>
    <StatusBar />
    <FlowHeader step={4} title="还没找到对应的山" onBack={onBack} />

    <div style={{ padding: '0 20px 18px', fontSize: 13, color: PTColors.fg2, lineHeight: 1.7 }}>
      你的轨迹完整保存好了。<br/>
      只是暂时没匹配到收录的山峰 — 这没关系，可以稍后再处理。
    </div>

    {/* Quiet illustration: lone ridge */}
    <div style={{ padding: '0 28px 4px', textAlign: 'center' }}>
      <svg width="180" height="64" viewBox="0 0 180 64" style={{ display: 'block', margin: '0 auto' }}>
        <path d="M0 56 L36 30 L60 42 L92 14 L120 36 L148 24 L180 44" stroke={PTColors.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="92" cy="14" r="3" fill={PTColors.fg2}/>
        <circle cx="92" cy="14" r="7" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="1"/>
      </svg>
    </div>

    <div style={{ padding: '20px 16px 0', display: 'grid', gap: 10 }}>
      <NoMatchOption
        green
        icon={<StashIcon2 />}
        title="作为未收录山行保存"
        sub="进入档案 · 之后可以补充关联"
        onClick={onStash}
      />
      <NoMatchOption
        icon={<SearchIcon2 />}
        title="手动搜索关联山峰"
        sub="你比系统更清楚自己去了哪"
        onClick={onSearch}
      />
      <NoMatchOption
        icon={<ClockIcon2 />}
        title="稍后再处理"
        sub="保留为待整理 · 不会丢失"
        onClick={onLater}
      />
    </div>
  </div>
);

const NoMatchOption = ({ icon, title, sub, onClick, green }) => (
  <button onClick={onClick} style={{
    width: '100%', textAlign: 'left', padding: '14px', cursor: 'pointer', fontFamily: 'inherit',
    background: green ? 'linear-gradient(180deg, rgba(34,197,94,.08), rgba(34,197,94,.02))' : PTColors.surface,
    border: green ? '1px solid rgba(34,197,94,.26)' : `1px solid ${PTColors.outline}`,
    borderRadius: 14,
    display: 'grid', gridTemplateColumns: '38px 1fr auto', gap: 12, alignItems: 'center',
  }}>
    <div style={{ width: 38, height: 38, borderRadius: 10, background: green ? 'rgba(34,197,94,.14)' : 'rgba(255,255,255,.04)', border: green ? '1px solid rgba(34,197,94,.28)' : `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>{icon}</div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>{title}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>{sub}</div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);
const StashIcon2 = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" stroke={PTColors.success} strokeWidth="1.8" strokeLinejoin="round"/><path d="M9 4h6l1 3H8z" stroke={PTColors.success} strokeWidth="1.8" strokeLinejoin="round"/></svg>);
const SearchIcon2 = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6" stroke={PTColors.fg} strokeWidth="1.8"/><path d="M20 20l-4-4" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/></svg>);
const ClockIcon2 = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={PTColors.fg} strokeWidth="1.8"/><path d="M12 7v5l3 2" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round"/></svg>);

// ───────── 6. Import Success ─────────

const ImportSuccess = ({ onShare, onView, onAddPhoto, onWriteNote }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 24 }}>
    <StatusBar />
    <div style={{ padding: '40px 24px 8px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.32)', display: 'grid', placeItems: 'center', margin: '0 auto' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10" stroke={PTColors.success} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 18, lineHeight: 1.3 }}>已带回档案</div>
      <div style={{ fontSize: 13, color: PTColors.fg2, marginTop: 8, lineHeight: 1.65 }}>哈巴雪山 · 2025/10/02<br/>这次山行已成为你档案里的第 7 条记录</div>
    </div>

    {/* Mini result card */}
    <div style={{ padding: '24px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>哈巴雪山</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>云南 · 香格里拉</div>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 700, color: PTColors.success }}>5,396m</div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${PTColors.outline}`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Mini label="距离" value="9.8 km" />
          <Mini label="时长" value="7h 42m" />
          <Mini label="爬升" value="2,216 m" />
        </div>
      </div>
    </div>

    {/* Next-step actions */}
    <div style={{ padding: '20px 20px 0', fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase' }}>接下来</div>
    <div style={{ padding: '8px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <NextAction icon={<CamIcon />} label="补照片" sub="登顶 / 路上" onClick={onAddPhoto} />
      <NextAction icon={<PenIcon />} label="写一句话" sub="留下这次的感受" onClick={onWriteNote} />
      <NextAction primary icon={<ShareIcon />} label="生成分享" sub="海拔卡 / 朋友圈" onClick={onShare} />
      <NextAction icon={<EyeIcon />} label="查看活动" sub="进入完整记录" onClick={onView} />
    </div>
  </div>
);

const Mini = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, color: PTColors.fg2 }}>{label}</div>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, marginTop: 2 }}>{value}</div>
  </div>
);
const NextAction = ({ icon, label, sub, onClick, primary }) => (
  <button onClick={onClick} style={{
    textAlign: 'left', padding: '14px', cursor: 'pointer', fontFamily: 'inherit',
    background: primary ? 'rgba(34,197,94,.08)' : PTColors.surface,
    border: primary ? '1px solid rgba(34,197,94,.28)' : `1px solid ${PTColors.outline}`,
    borderRadius: 14,
  }}>
    <div style={{ width: 32, height: 32, borderRadius: 10, background: primary ? 'rgba(34,197,94,.14)' : 'rgba(255,255,255,.04)', border: primary ? '1px solid rgba(34,197,94,.28)' : `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>{icon}</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg, marginTop: 10 }}>{label}</div>
    <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>{sub}</div>
  </button>
);
const CamIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke={PTColors.fg} strokeWidth="1.8"/><circle cx="12" cy="13" r="3" stroke={PTColors.fg} strokeWidth="1.8"/></svg>);
const PenIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 19l4-1 11-11-3-3L5 15z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/></svg>);
const ShareIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="2.5" stroke={PTColors.success} strokeWidth="1.8"/><circle cx="18" cy="6" r="2.5" stroke={PTColors.success} strokeWidth="1.8"/><circle cx="18" cy="18" r="2.5" stroke={PTColors.success} strokeWidth="1.8"/><path d="M8 11l8-4M8 13l8 4" stroke={PTColors.success} strokeWidth="1.8"/></svg>);
const EyeIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke={PTColors.fg} strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke={PTColors.fg} strokeWidth="1.8"/></svg>);

// ───────── 7. Import FAQ ─────────

const FAQSection = ({ title, children }) => (
  <div style={{ marginTop: 22 }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>{title}</div>
    <div style={{ marginTop: 10, fontSize: 12, color: PTColors.fg2, lineHeight: 1.75 }}>{children}</div>
  </div>
);

const FAQStep = ({ n, title, body, illustration = 'phone' }) => (
  <div style={{ marginTop: 12, padding: '12px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: PTColors.success }}>{String(n).padStart(2,'0')}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>{title}</div>
    </div>
    <div style={{ marginTop: 6, fontSize: 11, color: PTColors.fg2, lineHeight: 1.7 }}>{body}</div>
    <div style={{ marginTop: 10, height: 110, borderRadius: 8, background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.02) 0 8px, rgba(255,255,255,.04) 8px 16px)', border: `1px dashed ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>
      <div style={{ fontSize: 10, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.1em' }}>截图占位 · STEP {n}</div>
    </div>
  </div>
);

const ImportFAQ = ({ onBack }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 32 }}>
    <StatusBar />
    <TopBar title="导入说明" onBack={onBack} />

    <div style={{ padding: '8px 20px 0' }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>把已经走过的<br/>那一次带回来</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 10, lineHeight: 1.7 }}>
        只要你之前用手表或 App 记录过轨迹，就可以导入到 Peak Trekker — 不需要重新走一遍。
      </div>

      <FAQSection title="我可以从哪里导出轨迹">
        Peak Trekker 接受大多数运动设备和 App 导出的轨迹文件，包括但不限于：
        <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px' }}>
          <li>Garmin Connect · 佳明 / 高驰 / Suunto 手表</li>
          <li>苹果「健康」App · 户外步行 / 徒步</li>
          <li>两步路户外助手 · 六只脚 · 行者</li>
          <li>Strava · Komoot · AllTrails</li>
        </ul>
      </FAQSection>

      <FAQStep n={1} title="从设备 / App 导出轨迹" body="在原 App 中找到这次活动 → 选择「分享」或「导出 GPX」→ 保存到「文件」或邮件给自己。" />
      <FAQStep n={2} title="在 Peak Trekker 选择文件" body="进入「把这次结果带回来」→ 点「上传轨迹文件」→ 选择刚刚保存的文件。" />
      <FAQStep n={3} title="确认匹配的山峰" body="系统会根据轨迹的位置与最高点推荐候选 — 选对了就完成了。" />

      <FAQSection title="支持哪些文件格式">
        当前支持 <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: PTColors.fg }}>GPX · KML · FIT · TCX</span> 四种格式。
        <div style={{ marginTop: 8 }}>压缩包 (.zip) 请先解压，再选择里面的轨迹文件。</div>
      </FAQSection>

      <FAQSection title="导入后会发生什么">
        <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
          <li>系统在你的设备上解析文件 — 不会上传到服务器</li>
          <li>提取距离、时长、累计爬升、最高点和起止时间</li>
          <li>尝试匹配到收录山峰 — 没匹配到也不影响保存</li>
          <li>记录进入档案后，你可以补照片、写感受、生成分享</li>
        </ul>
      </FAQSection>

      <FAQSection title="匹配不到山峰怎么办">
        Peak Trekker 收录的山有限，匹配不到很正常。你可以：
        <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px' }}>
          <li>「作为未收录山行保存」 — 记录会进入档案，标记为待认领</li>
          <li>「手动搜索关联山峰」 — 输入山名或拼音直接关联</li>
          <li>「稍后再处理」 — 保留为待整理状态，不会丢失</li>
        </ul>
        <div style={{ marginTop: 8 }}>未来 Peak Trekker 收录这座山之后，系统会主动提示你认领。</div>
      </FAQSection>

      <div style={{ marginTop: 28, padding: '14px', background: 'rgba(255,255,255,.02)', border: `1px solid ${PTColors.outline}`, borderRadius: 12 }}>
        <div style={{ fontSize: 11, color: PTColors.fg2, lineHeight: 1.7 }}>
          仍有问题？发邮件至 <span style={{ color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace" }}>help@peak-trekker.app</span>，附上文件类型与原 App 名称，我们会尽快回复。
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, {
  ImportEntry, ImportUploadEmpty, ImportUploadSelected, ImportUploadParsing, ImportUploadError,
  ImportPreview, ImportMatch, ImportNoMatch, ImportSuccess, ImportFAQ,
});
