// Profile — private 山行档案馆

const ProfileScreen = ({ onTab, onOpenActivity }) => {
  const activities = [
    { yr: 2024, items: [{ name: '玉珠峰', alt: 6178, date: '10·07', tone: 'warm' }, { name: '四姑娘大峰', alt: 5025, date: '06·15', tone: 'cool' }] },
    { yr: 2023, items: [{ name: '哈巴雪山', alt: 5396, date: '11·02', tone: 'sky' }, { name: '雪宝顶', alt: 5588, date: '08·20', tone: 'cool' }, { name: '岗什卡雪山', alt: 5254, date: '05·04', tone: 'warm' }] },
  ];

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 90 }}>
      <StatusBar />
      <TopBar title="我的山行" right={<IconButton round><PTIcons.more /></IconButton>} />

      {/* Identity strip */}
      <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 58, height: 58, borderRadius: 999, background: 'linear-gradient(180deg,rgba(34,197,94,.3),rgba(34,197,94,.08))', border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700, color: PTColors.fg }}>陈</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>陈老山</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><Chip tone="active">中级登山</Chip><Chip>青海</Chip></div>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <SumTile label="山行" value="7" />
        <SumTile label="最高海拔" value="6,178" accent />
        <SumTile label="已访省份" value="5" />
      </div>

      {/* Archive header */}
      <div style={{ padding: '12px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.06em' }}>山行档案馆</div>
        <span style={{ fontSize: 12, color: PTColors.fg2 }}>按年 · 时间线</span>
      </div>

      {/* Timeline */}
      <div style={{ padding: '0 16px', display: 'grid', gap: 18 }}>
        {activities.map(g => (
          <div key={g.yr}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: PTColors.fg, padding: '0 4px 10px' }}>{g.yr}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {g.items.map((a, i) => (
                <button key={i} onClick={onOpenActivity} style={{ textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 12, padding: 12, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, alignItems: 'center' }}>
                    <div style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                      <PhonePlaceholder h={72} tone={a.tone} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{a.name}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: PTColors.fg2 }}>{g.yr}·{a.date}</div>
                      </div>
                      <div style={{ marginTop: 8 }}><AltitudeBar value={a.alt} label={null} /></div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <TabBar active="me" onChange={onTab} />
    </div>
  );
};

const SumTile = ({ label, value, accent }) => (
  <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12, padding: 12 }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 700, color: accent ? PTColors.success : PTColors.fg }}>{value}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 4, letterSpacing: '.04em' }}>{label}</div>
  </div>
);

window.ProfileScreen = ProfileScreen;
