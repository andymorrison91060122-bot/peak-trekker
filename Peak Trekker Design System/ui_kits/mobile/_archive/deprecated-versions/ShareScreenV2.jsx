// Share Editor v2 — 水印相机 style. Template + main visual + field toggles. No free editor.

const ShareScreenV2 = ({ onBack }) => {
  const [template, setTemplate] = React.useState('classic');
  const [visual, setVisual] = React.useState('photo'); // photo | map | altCard
  const [fields, setFields] = React.useState({ alt: true, dist: true, dur: true, date: true, loc: true });
  const toggle = (k) => setFields(f => ({ ...f, [k]: !f[k] }));

  return (
    <div style={{ background: '#0A0C0E', minHeight: '100%', paddingBottom: 96 }}>
      <StatusBar />
      <TopBar title="生成分享" onBack={onBack} right={
        <button style={{ background: 'none', border: 'none', color: PTColors.success, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>保存</button>
      } />

      {/* PREVIEW — always 4:5 */}
      <div style={{ padding: '10px 20px 0' }}>
        <div style={{ aspectRatio: '4/5', borderRadius: 16, overflow: 'hidden', position: 'relative', border: `1px solid ${PTColors.outline}`, background: PTColors.surface }}>
          {visual === 'photo' && <PhonePlaceholder h={420} tone="alpine" label="玉珠峰" />}
          {visual === 'map' && <MapVisual />}
          {visual === 'altCard' && <AltitudeCardVisual />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,12,14,.25) 0%, rgba(10,12,14,0) 25%, rgba(10,12,14,.82))' }} />

          {template === 'classic' && (
            <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: '.22em', color: PTColors.success, marginBottom: 10 }}>PEAK TREKKER</div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.01em', color: PTColors.fg }}>玉珠峰</div>
              {fields.alt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: PTColors.success, marginTop: 4 }}>6,178m</div>}
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
                {fields.alt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 44, fontWeight: 800, color: PTColors.success, lineHeight: 1, marginTop: 2 }}>6178</div>}
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
                {fields.alt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: PTColors.success, fontWeight: 600 }}>6,178m</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TEMPLATE SWITCHER */}
      <div style={{ padding: '14px 20px 0' }}>
        <FieldLabel>模板</FieldLabel>
        <div style={{ display: 'flex', gap: 10 }}>
          {[{ id: 'classic', label: '经典' }, { id: 'stamp', label: '海拔卡' }, { id: 'minimal', label: '极简' }].map(t => (
            <button key={t.id} onClick={() => setTemplate(t.id)} style={{
              flex: 1, height: 52, background: PTColors.surface, borderRadius: 10, cursor: 'pointer',
              border: template === t.id ? `1.5px solid ${PTColors.primary}` : `1px solid ${PTColors.outline}`,
              color: template === t.id ? PTColors.fg : PTColors.fg2, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* MAIN VISUAL */}
      <div style={{ padding: '14px 20px 0' }}>
        <FieldLabel>主画面</FieldLabel>
        <div style={{ display: 'flex', gap: 10 }}>
          {[{ id: 'photo', label: '照片' }, { id: 'map', label: '地图' }, { id: 'altCard', label: '海拔卡' }].map(v => (
            <button key={v.id} onClick={() => setVisual(v.id)} style={{
              flex: 1, height: 48, background: PTColors.surface, borderRadius: 10, cursor: 'pointer',
              border: visual === v.id ? `1.5px solid ${PTColors.primary}` : `1px solid ${PTColors.outline}`,
              color: visual === v.id ? PTColors.fg : PTColors.fg2, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* FIELDS */}
      <div style={{ padding: '14px 20px 0' }}>
        <FieldLabel>显示字段</FieldLabel>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, overflow: 'hidden' }}>
          <Toggle label="海拔" on={fields.alt} onChange={() => toggle('alt')} />
          <Toggle label="距离" on={fields.dist} onChange={() => toggle('dist')} />
          <Toggle label="时长" on={fields.dur} onChange={() => toggle('dur')} />
          <Toggle label="日期" on={fields.date} onChange={() => toggle('date')} />
          <Toggle label="地点" on={fields.loc} onChange={() => toggle('loc')} last />
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 26px', background: 'linear-gradient(180deg, rgba(10,12,14,0), rgba(10,12,14,.96) 28%)' }}>
        <PrimaryButton full>保存到相册</PrimaryButton>
      </div>
    </div>
  );
};

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>{children}</div>
);

const Toggle = ({ label, on, onChange, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <span style={{ fontSize: 14, color: PTColors.fg }}>{label}</span>
    <button onClick={onChange} style={{
      width: 40, height: 22, borderRadius: 999, position: 'relative', cursor: 'pointer',
      background: on ? PTColors.primary : 'rgba(255,255,255,.12)', border: 'none', transition: 'background .15s',
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 999, background: '#fff', transition: 'left .15s' }} />
    </button>
  </div>
);

const MapVisual = () => (
  <div style={{ height: '100%', width: '100%', background: '#1a2028', position: 'relative', overflow: 'hidden' }}>
    <svg width="100%" height="100%" viewBox="0 0 300 380" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
      {/* contour lines */}
      {[...Array(10)].map((_, i) => (
        <ellipse key={i} cx="150" cy="200" rx={30 + i * 22} ry={20 + i * 14} stroke="rgba(141,149,155,.22)" strokeWidth="1" fill="none"/>
      ))}
      <path d="M40 320 Q90 240 150 200 T260 90" stroke={PTColors.success} strokeWidth="3" fill="none" strokeLinecap="round"/>
      <circle cx="40" cy="320" r="6" fill={PTColors.fg}/>
      <circle cx="150" cy="200" r="7" fill={PTColors.success}/>
    </svg>
  </div>
);

const AltitudeCardVisual = () => (
  <div style={{ height: '100%', width: '100%', background: 'linear-gradient(180deg,#1a2028 0%,#0e1215 100%)', position: 'relative' }}>
    <svg width="100%" height="100%" viewBox="0 0 300 380" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
      <path d="M0 280 L50 250 L100 220 L150 160 L170 120 L210 180 L260 230 L300 260 L300 380 L0 380 Z" fill={PTColors.success} opacity="0.22"/>
      <path d="M0 280 L50 250 L100 220 L150 160 L170 120 L210 180 L260 230 L300 260" stroke={PTColors.success} strokeWidth="2" fill="none"/>
      <circle cx="170" cy="120" r="5" fill={PTColors.success}/>
    </svg>
  </div>
);

window.ShareScreenV2 = ShareScreenV2;
