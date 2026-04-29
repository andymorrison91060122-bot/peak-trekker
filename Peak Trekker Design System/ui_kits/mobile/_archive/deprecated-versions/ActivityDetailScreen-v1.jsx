// Activity Detail — the asset layer. Displays a completed trip.

const ActivityDetailScreen = ({ onBack, onShare }) => {
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 100 }}>
      {/* Hero */}
      <div style={{ position: 'relative' }}>
        <PhonePlaceholder h={280} tone="warm" label="玉珠峰 · 2024.10.07" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.4) 0%, rgba(12,14,16,0) 30%, rgba(12,14,16,.9))' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <StatusBar />
          <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between' }}>
            <IconButton round onClick={onBack}><PTIcons.back /></IconButton>
            <IconButton round><PTIcons.more /></IconButton>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
          <div style={{ marginBottom: 10 }}><Chip tone="success">● 已登顶</Chip></div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.01em' }}>玉珠峰</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(245,247,248,.72)', marginTop: 4 }}>2024·10·07 · 青海 · 格尔木</div>
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ padding: '16px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <StatTile label="海拔 m" value="6,178" accent />
        <StatTile label="距离 km" value="12.4" />
        <StatTile label="爬升 m" value="1,240" />
        <StatTile label="时长" value="7h 12m" />
      </div>

      {/* Elevation profile */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.06em', padding: '0 4px 10px' }}>海拔曲线</div>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: 14 }}>
          <div style={{ position: 'relative', height: 120 }}>
            <svg width="100%" height="100%" viewBox="0 0 320 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="altg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={PTColors.success} stopOpacity=".35"/>
                  <stop offset="100%" stopColor={PTColors.success} stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0 95 L40 80 L80 74 L120 58 L160 40 L180 20 L200 48 L240 60 L280 72 L320 90 L320 120 L0 120 Z" fill="url(#altg)"/>
              <path d="M0 95 L40 80 L80 74 L120 58 L160 40 L180 20 L200 48 L240 60 L280 72 L320 90" stroke={PTColors.success} strokeWidth="2" fill="none"/>
              <circle cx="180" cy="20" r="4" fill={PTColors.success}/>
              <line x1="180" y1="20" x2="180" y2="115" stroke={PTColors.outline} strokeDasharray="3 3"/>
            </svg>
            <div style={{ position: 'absolute', left: 164, top: -4, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 11, color: PTColors.success }}>6,178m</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: PTColors.fg2 }}>
            <span>06:12 出发</span><span>13:24 登顶</span><span>19:28 回营</span>
          </div>
        </div>
      </div>

      {/* Photos */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px 10px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.06em' }}>真实照片 · 12</div>
          <span style={{ fontSize: 12, color: PTColors.fg2 }}>全部</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
          {['cool','warm','sky','cool','warm','sky'].map((t,i) => (
            <div key={i} style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: `1px solid ${PTColors.outline}` }}>
              <PhonePlaceholder h={105} tone={t} />
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.06em', padding: '0 4px 10px' }}>一次山行</div>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: PTColors.fg }}>
            凌晨四点天还黑。冰爪声有节奏地踩进暗处。临近峰顶风忽然停了，日出把冰壁打成一整片金色。留证那一刻，我只想站一会儿。
          </div>
          <div style={{ marginTop: 12, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: PTColors.fg2, letterSpacing: '.08em' }}>PEAK TREKKER · 真实记录</div>
        </div>
      </div>

      {/* Bottom CTAs: one primary */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 26px', background: 'linear-gradient(180deg, rgba(18,20,22,0), rgba(18,20,22,.96) 30%)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10 }}>
          <SecondaryButton>发布到山友圈</SecondaryButton>
          <PrimaryButton full onClick={onShare}>分享这次山行</PrimaryButton>
        </div>
      </div>
    </div>
  );
};

window.ActivityDetailScreen = ActivityDetailScreen;
