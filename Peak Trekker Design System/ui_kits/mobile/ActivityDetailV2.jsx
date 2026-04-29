// Activity Detail v2 — private mountain-trip archive. Facts + a small amount of memory.
// Two states exported: full | fallback (no user photo, empty note)

// ---- Shared pieces ----

const ActivityHero = ({ tone = 'alpine', label, fallback, summit = true, name = '玉珠峰', date = '2024 · 10 · 07', region = '青海 · 格尔木' }) => (
  <div style={{ position: 'relative' }}>
    <PhonePlaceholder h={320} tone={tone} label={label} />
    {fallback && (
      <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 10px', borderRadius: 999, background: 'rgba(12,14,16,.72)', backdropFilter: 'blur(8px)', border: `1px solid ${PTColors.outline}`, fontSize: 10, fontWeight: 600, color: PTColors.fg2, letterSpacing: '.06em' }}>默认封面</div>
    )}
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.55) 0%, rgba(12,14,16,0) 35%, rgba(12,14,16,.95) 100%)' }} />
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 18 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {summit
          ? <Chip tone="success">● 已登顶</Chip>
          : <Chip tone="warn">● 未登顶</Chip>}
        <Chip>一次山行</Chip>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: PTColors.fg, letterSpacing: '-.01em', lineHeight: 1.15 }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 12, color: 'rgba(245,247,248,.75)', fontFamily: "'IBM Plex Mono',monospace" }}>
        <span>{date}</span>
        <span style={{ opacity: .4 }}>·</span>
        <span>{region}</span>
      </div>
    </div>
  </div>
);

const ActivityTopBar = ({ onBack }) => (
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}>
    <StatusBar />
    <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between' }}>
      <IconButton round onClick={onBack}><PTIcons.back /></IconButton>
      <div style={{ display: 'flex', gap: 8 }}>
        <IconButton round><PTIcons.share /></IconButton>
        <IconButton round><PTIcons.more /></IconButton>
      </div>
    </div>
  </div>
);

const SummitReached = ({ alt = 6178, time = '13:24' }) => (
  <div style={{ padding: '16px 16px 0' }}>
    <div style={{
      background: 'linear-gradient(180deg, rgba(110,231,161,.08) 0%, rgba(110,231,161,0) 100%)',
      border: `1px solid rgba(110,231,161,.28)`, borderRadius: 14, padding: '14px 16px',
      display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.success, letterSpacing: '.1em', textTransform: 'uppercase' }}>登顶海拔</div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 36, fontWeight: 800, color: PTColors.success, marginTop: 4, lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{alt.toLocaleString()}<span style={{ fontSize: 16, marginLeft: 4, color: PTColors.fg2, fontWeight: 600 }}>m</span></div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em' }}>登顶时间</div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: PTColors.fg, marginTop: 4 }}>{time}</div>
      </div>
    </div>
  </div>
);

const KeyDataRow = ({ dist = '12.4', climb = '1,240', dur = '7h 12m' }) => (
  <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
    <KeyDataCell label="距离 km" value={dist} />
    <KeyDataCell label="爬升 m" value={climb} />
    <KeyDataCell label="用时" value={dur} />
  </div>
);

const KeyDataCell = ({ label, value }) => (
  <div style={{ padding: '12px 10px', background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, textAlign: 'center' }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700, color: PTColors.fg, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 4, letterSpacing: '.04em' }}>{label}</div>
  </div>
);

const RouteSnapshot = ({ data = [4280, 4480, 4720, 5100, 5360, 5580, 5800, 6020, 6178, 6050, 5500, 4900, 4280] }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 300;
    const y = 90 - ((v - min) / (max - min)) * 70;
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,100 ${points} 300,100`;
  const summitIdx = data.indexOf(max);
  const summitX = (summitIdx / (data.length - 1)) * 300;
  const summitY = 90 - ((max - min) / (max - min)) * 70;
  return (
    <div style={{ padding: '18px 16px 0' }}>
      <SectionHead right={`${min.toLocaleString()}m → ${max.toLocaleString()}m`}>轨迹 · 海拔剖面</SectionHead>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
        <svg width="100%" height="110" viewBox="0 0 300 110" preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="actfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PTColors.success} stopOpacity="0.28"/>
              <stop offset="100%" stopColor={PTColors.success} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[20, 40, 60, 80].map(y => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke={PTColors.outline} strokeWidth="0.5"/>)}
          <polygon points={areaPoints} fill="url(#actfill)"/>
          <polyline points={points} stroke={PTColors.success} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1={summitX} x2={summitX} y1={summitY} y2="100" stroke={PTColors.success} strokeWidth="0.8" strokeDasharray="2 3" opacity="0.5"/>
          <circle cx={summitX} cy={summitY} r="4" fill={PTColors.success}/>
          <circle cx={summitX} cy={summitY} r="8" fill="none" stroke={PTColors.success} strokeOpacity="0.3" strokeWidth="1.5"/>
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px 12px', fontSize: 10, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.05em' }}>
          <span>大本营</span><span style={{ color: PTColors.success }}>山顶 · {max.toLocaleString()}m</span><span>回营</span>
        </div>
      </div>
    </div>
  );
};

const PhotoStrip = ({ fallback }) => {
  if (fallback) {
    return (
      <div style={{ padding: '18px 16px 0' }}>
        <SectionHead>照片</SectionHead>
        <div style={{ background: PTColors.surface, border: `1px dashed ${PTColors.outline}`, borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.03)', border: `1px solid ${PTColors.outline}`, margin: '0 auto 10px', display: 'grid', placeItems: 'center' }}>
            <PTIcons.camera />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>这次山行没有照片</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4, lineHeight: 1.5 }}>可以补传登顶照或途中照，用于生成分享与留证</div>
          <div style={{ marginTop: 12 }}>
            <button style={{ padding: '8px 14px', background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, borderRadius: 10, color: PTColors.fg, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>补传照片</button>
          </div>
        </div>
      </div>
    );
  }
  const shots = [
    { tone: 'alpine', label: '起点' },
    { tone: 'slate', label: 'C1' },
    { tone: 'dawn', label: '山顶' },
    { tone: 'dusk', label: '回营' },
  ];
  return (
    <div style={{ padding: '18px 0 0' }}>
      <div style={{ padding: '0 16px' }}><SectionHead right="4 张">照片</SectionHead></div>
      <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        {shots.map((s, i) => (
          <div key={i} style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${PTColors.outline}` }}>
            <PhonePlaceholder h={160} tone={s.tone} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,.55))' }}/>
            <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 10, fontWeight: 600, color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MemoryNote = ({ empty }) => (
  <div style={{ padding: '18px 16px 0' }}>
    <SectionHead>手记</SectionHead>
    {empty ? (
      <button style={{ width: '100%', textAlign: 'left', background: PTColors.surface, border: `1px dashed ${PTColors.outline}`, borderRadius: 14, padding: '16px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>写一段给自己的话</div>
        <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4, lineHeight: 1.55 }}>一两句就够 · 只有你能看到，除非主动发布到山友圈</div>
      </button>
    ) : (
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ fontSize: 14, color: PTColors.fg, lineHeight: 1.7 }}>
          凌晨三点出营，风比预想大。过 C1 之后冰壳渐厚，节奏被迫放慢。登顶那一刻只剩一句话可说——再来一次也值得。
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em', fontFamily: "'IBM Plex Mono',monospace" }}>仅自己可见</div>
          <button style={{ background: 'none', border: 'none', color: PTColors.fg2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>编辑</button>
        </div>
      </div>
    )}
  </div>
);

const ProofStrip = ({ status = 'confirmed' }) => {
  const cfg = {
    confirmed: { label: '留证已确认', sub: '轨迹 · 海拔 · 登顶点位均完整', tone: 'success' },
    partial:   { label: '留证不完整', sub: 'GPS 有中断 · 可补充说明后仍记为完成', tone: 'warn' },
    none:      { label: '仅手动补签', sub: '无自动记录 · 仅凭用户声明', tone: 'warn' },
  }[status];
  const palette = cfg.tone === 'success'
    ? { bg: 'rgba(110,231,161,.08)', bd: 'rgba(110,231,161,.28)', fg: PTColors.success, icon: PTIcons.check() }
    : { bg: 'rgba(245,158,11,.08)', bd: 'rgba(245,158,11,.28)', fg: PTColors.warn, icon: <PTIcons.warn/> };
  return (
    <div style={{ padding: '18px 16px 0' }}>
      <div style={{ background: palette.bg, border: `1px solid ${palette.bd}`, borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div>{palette.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: palette.fg }}>{cfg.label}</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{cfg.sub}</div>
        </div>
      </div>
    </div>
  );
};

const BackToRecords = ({ onOpen }) => (
  <div style={{ padding: '18px 16px 0' }}>
    <button onClick={onOpen} style={{ width: '100%', background: 'none', border: `1px solid ${PTColors.outline}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: PTColors.elevated, display: 'grid', placeItems: 'center' }}>
        <PTIcons.me />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>返回我的山行档案</div>
        <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>共 7 次山行 · 最新一次是这一次</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  </div>
);

const SectionHead = ({ children, right }) => (
  <div style={{ padding: '0 4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase' }}>{children}</div>
    {right && <div style={{ fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>{right}</div>}
  </div>
);

// ---- Screens ----

const ActivityDetailV2 = ({ onBack, onShare, onOpenRecords }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 110 }}>
    <ActivityTopBar onBack={onBack} />
    <ActivityHero tone="alpine" label="玉珠峰·登顶" summit name="玉珠峰" date="2024 · 10 · 07" region="青海 · 格尔木" />
    <SummitReached alt={6178} time="13:24" />
    <KeyDataRow dist="12.4" climb="1,240" dur="7h 12m" />
    <RouteSnapshot />
    <PhotoStrip />
    <MemoryNote />
    <ProofStrip status="confirmed" />
    <BackToRecords onOpen={onOpenRecords} />
    <ActivityBottomBar onShare={onShare} />
  </div>
);

const ActivityDetailV2Fallback = ({ onBack, onShare, onOpenRecords }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 110 }}>
    <ActivityTopBar onBack={onBack} />
    <ActivityHero tone="slate" fallback label="默认封面" summit={false} name="哈巴雪山" date="2024 · 06 · 18" region="云南 · 香格里拉" />
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>最高海拔</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 30, fontWeight: 800, color: PTColors.fg, marginTop: 4, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>4,980<span style={{ fontSize: 14, marginLeft: 4, color: PTColors.fg2, fontWeight: 600 }}>m</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em' }}>未登顶</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, color: PTColors.warn, marginTop: 4 }}>C2 折返</div>
          </div>
        </div>
      </div>
    </div>
    <KeyDataRow dist="9.8" climb="1,040" dur="9h 28m" />
    <RouteSnapshot data={[3200, 3420, 3680, 3980, 4280, 4560, 4820, 4980, 4760, 4400, 3900, 3400, 3200]} />
    <PhotoStrip fallback />
    <MemoryNote empty />
    <ProofStrip status="partial" />
    <BackToRecords onOpen={onOpenRecords} />
    <ActivityBottomBar onShare={onShare} />
  </div>
);

const ActivityBottomBar = ({ onShare }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 26px', background: 'linear-gradient(180deg, rgba(18,20,22,0), rgba(18,20,22,.96) 30%)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10 }}>
      <SecondaryButton>发布到山友圈</SecondaryButton>
      <PrimaryButton full onClick={onShare}>分享这次山行</PrimaryButton>
    </div>
  </div>
);

Object.assign(window, { ActivityDetailV2, ActivityDetailV2Fallback });
