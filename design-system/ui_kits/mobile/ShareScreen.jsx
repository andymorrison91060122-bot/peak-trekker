// Share — 水印相机 style. Simple: template / main visual / fields.

const ShareScreen = ({ onBack }) => {
  const [template, setTemplate] = React.useState('classic');
  const [showAlt, setShowAlt] = React.useState(true);
  const [showDist, setShowDist] = React.useState(true);
  const [showDate, setShowDate] = React.useState(true);

  return (
    <div style={{ background: '#0A0C0E', minHeight: '100%', paddingBottom: 100 }}>
      <StatusBar />
      <TopBar title="生成分享" onBack={onBack} right={<button style={{ background: 'none', border: 'none', color: PTColors.success, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>保存</button>} />

      {/* Preview */}
      <div style={{ padding: '12px 20px 0' }}>
        <div style={{ aspectRatio: '4/5', borderRadius: 16, overflow: 'hidden', position: 'relative', border: `1px solid ${PTColors.outline}` }}>
          <PhonePlaceholder h={400} tone="sky" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,12,14,.2) 0%, rgba(10,12,14,0) 25%, rgba(10,12,14,.86))' }} />

          {template === 'classic' ? (
            <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: '.2em', color: PTColors.success, marginBottom: 10 }}>PEAK TREKKER</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.01em', color: PTColors.fg }}>玉珠峰</div>
              {showAlt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 26, fontWeight: 700, color: PTColors.success, marginTop: 6 }}>6,178m</div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 14, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: 'rgba(245,247,248,.72)' }}>
                {showDate && <span>2024·10·07</span>}
                {showDist && <span>12.4km · 7h12</span>}
              </div>
            </div>
          ) : (
            <div style={{ position: 'absolute', left: 18, right: 18, top: 18, bottom: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: '.2em', color: PTColors.fg }}>PEAK TREKKER</div>
                {showDate && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'rgba(245,247,248,.7)' }}>2024·10·07</div>}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '.02em', color: PTColors.fg }}>玉珠峰</div>
                {showAlt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 52, fontWeight: 800, color: PTColors.success, lineHeight: 1, marginTop: 4 }}>6178</div>}
                {showAlt && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: '.3em', color: 'rgba(245,247,248,.72)', marginTop: 2 }}>METERS · ALTITUDE</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'rgba(245,247,248,.72)' }}>
                {showDist && <span>12.4km</span>}
                <span>·</span>
                <span>7h12</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template switcher */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ fontSize: 12, color: PTColors.fg2, marginBottom: 10 }}>模板</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { id: 'classic', label: '经典' },
            { id: 'altitude', label: '海拔卡' },
          ].map(t => (
            <button key={t.id} onClick={() => setTemplate(t.id)} style={{
              flex: 1, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: PTColors.surface, borderRadius: 10, cursor: 'pointer',
              border: template === t.id ? `1.5px solid ${PTColors.primary}` : `1px solid ${PTColors.outline}`,
              color: template === t.id ? PTColors.fg : PTColors.fg2, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ fontSize: 12, color: PTColors.fg2, marginBottom: 10 }}>显示字段</div>
        <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, overflow: 'hidden' }}>
          <Toggle label="海拔" on={showAlt} onChange={setShowAlt} />
          <Toggle label="距离与时长" on={showDist} onChange={setShowDist} />
          <Toggle label="日期与地点" on={showDate} onChange={setShowDate} last />
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 26px', background: 'linear-gradient(180deg, rgba(10,12,14,0), rgba(10,12,14,.96) 30%)' }}>
        <PrimaryButton full>保存到相册</PrimaryButton>
      </div>
    </div>
  );
};

const Toggle = ({ label, on, onChange, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <span style={{ fontSize: 14, color: PTColors.fg }}>{label}</span>
    <button onClick={() => onChange(!on)} style={{
      width: 40, height: 22, borderRadius: 999, position: 'relative', cursor: 'pointer',
      background: on ? PTColors.primary : 'rgba(255,255,255,.12)', border: 'none', transition: 'background .15s',
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 999, background: '#fff', transition: 'left .15s' }} />
    </button>
  </div>
);

window.ShareScreen = ShareScreen;
