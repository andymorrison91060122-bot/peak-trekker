// Home v4 — Intent Split, refined.
//
// Goals over v3:
//  • Three intent paths read as PEERS, not 01/02/03 with row 03 buried.
//  • Locked-target card stays as a calm primary, but doesn't compete with the intents.
//  • Path B ("把这次结果带回来") makes its three sub-actions feel like a real product strategy:
//      导入轨迹 / 登顶留证 / 手动补签.
//  • Greeting is shorter and more emotionally inviting; the long second line goes away.
//  • Adds a soft "回看" strip at the bottom showing the last archive entry, so 我的山行 has
//    presence even without taking a full row.

const HomeScreenV4 = ({ onTab, onGoExplore, onImport, onArchive, onOpenLocked }) => {
  const locked = { name: '玉珠峰', alt: 6178, region: '青海 · 格尔木', countdown: '3 天后出发' };
  const lastTrip = { name: '哈巴雪山', date: '4 月 18 日', alt: 5396 };

  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', paddingBottom: 96 }}>
      <StatusBar />

      {/* Greeting — short, no second line, tone matches "今天，想去哪座山。" from spec */}
      <div style={{ padding: '6px 20px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: PTColors.fg2, textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>4 月 28 日 · 周二</div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginTop: 6, letterSpacing: '-.005em' }}>今天，从哪里继续。</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 999, background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, display: 'grid', placeItems: 'center', color: PTColors.fg, fontSize: 13, fontWeight: 600 }}>陈</div>
      </div>

      {/* Locked target — kept, but framed as "进行中的目标" not as another intent. */}
      {locked && (
        <div style={{ padding: '0 16px 18px' }}>
          <button onClick={onOpenLocked} style={{
            width: '100%', textAlign: 'left', padding: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: PTColors.surface, borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 16px 32px rgba(0,0,0,.18)',
          }}>
            <div style={{ position: 'relative' }}>
              <PhonePlaceholder h={156} tone="alpine" label={locked.name} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12,14,16,.15) 0%, rgba(12,14,16,0) 35%, rgba(12,14,16,.86) 100%)' }} />
              <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
                <Chip tone="active">● 进行中的目标</Chip>
              </div>
              <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 700, color: PTColors.fg, lineHeight: 1.1 }}>{locked.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(245,247,248,.72)', marginTop: 4 }}>{locked.region} · {locked.countdown}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: 'rgba(245,247,248,.55)', letterSpacing: '.12em', fontFamily: "'IBM Plex Mono',monospace" }}>ALT</div>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: PTColors.success, lineHeight: 1, marginTop: 2 }}>{locked.alt.toLocaleString()}<span style={{ fontSize: 12, marginLeft: 2 }}>m</span></div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '10px 14px 12px', borderTop: `1px solid ${PTColors.outline}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: PTColors.fg2 }}>出发前复核 · 装备 · 天气</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: PTColors.success }}>
                  打开 <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Two equal intent cards: A. find a mountain  B. bring back a result. */}
      <div style={{ padding: '0 20px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg2, whiteSpace: 'nowrap' }}>从这里开始</div>
      </div>

      <div style={{ padding: '8px 16px 0', display: 'grid', gap: 10 }}>
        {/* A — Find next mountain */}
        <button onClick={onGoExplore} style={{
          textAlign: 'left', padding: 0, border: `1px solid ${PTColors.outline}`,
          background: PTColors.surface, borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 16px 14px', display: 'grid', gridTemplateColumns: '46px minmax(0,1fr) auto', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.05)', border: `1px solid ${PTColors.outline}` }}>
              <PathAIcon />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: PTColors.fg, letterSpacing: '-.005em' }}>去找下一座山</div>
              <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 4 }}>看看谁值得去 · 海拔、难度、执照</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </button>

        {/* B — Bring back a result. Same outer treatment as A; sub-options in a grid that reads as integral, not a footer. */}
        <div style={{
          border: `1px solid rgba(34,197,94,.3)`,
          background: 'linear-gradient(180deg, rgba(34,197,94,.07) 0%, rgba(34,197,94,.015) 60%, rgba(34,197,94,0) 100%)',
          borderRadius: 16, overflow: 'hidden',
        }}>
          <button onClick={onImport} style={{
            width: '100%', textAlign: 'left', padding: '16px 16px 14px', border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 14, alignItems: 'center',
          }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.14)', border: `1px solid rgba(34,197,94,.3)` }}>
              <PathBIcon />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: PTColors.fg, letterSpacing: '-.005em' }}>把这次结果带回来</div>
              </div>
              <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 4 }}>已经走过了 · 让它进入你的档案</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid rgba(34,197,94,.18)` }}>
            <SubChoiceV4 icon={<TrackIconV4 />} label="导入轨迹" sub="GPX · FIT" onClick={onImport} />
            <SubChoiceV4 icon={<ProofIconV4 />} label="登顶留证" sub="补一张登顶照" onClick={onImport} dividers />
            <SubChoiceV4 icon={<ManualIconV4 />} label="手动补签" sub="只声明结果" onClick={onImport} />
          </div>
        </div>
      </div>

      {/* Path C — 我的山行. Quiet, archive-style strip with one preview. Not a row 03; it sits as a "回看" rail. */}
      <div style={{ padding: '22px 20px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg2, whiteSpace: 'nowrap' }}>回看 · 我的山行</div>
        <button onClick={onArchive} style={{ background: 'none', border: 'none', color: PTColors.fg2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>全部 7 次 →</button>
      </div>

      <div style={{ padding: '8px 16px 0' }}>
        <button onClick={onArchive} style={{
          width: '100%', textAlign: 'left', padding: '12px 14px', border: `1px solid ${PTColors.outline}`,
          background: PTColors.surface, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
          display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 12, alignItems: 'center',
        }}>
          <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden' }}>
            <PhonePlaceholder h={52} tone="dusk" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>{lastTrip.name}</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>最近一次 · {lastTrip.date}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: PTColors.success }}>{lastTrip.alt.toLocaleString()}m</div>
            <div style={{ fontSize: 9, color: PTColors.fg2, marginTop: 2, letterSpacing: '.1em', fontFamily: "'IBM Plex Mono',monospace" }}>登顶</div>
          </div>
        </button>
      </div>

      <TabBar active="explore" onChange={onTab} />
    </div>
  );
};

const SubChoiceV4 = ({ icon, label, sub, dividers, onClick }) => (
  <button onClick={onClick} style={{
    padding: '14px 6px 14px', textAlign: 'center', cursor: 'pointer', background: 'transparent', fontFamily: 'inherit',
    borderLeft: dividers ? `1px solid rgba(34,197,94,.18)` : 'none',
    borderRight: dividers ? `1px solid rgba(34,197,94,.18)` : 'none',
    borderTop: 'none', borderBottom: 'none',
  }}>
    <div style={{ display: 'grid', placeItems: 'center', height: 22 }}>{icon}</div>
    <div style={{ fontSize: 12, fontWeight: 600, color: PTColors.fg, marginTop: 8 }}>{label}</div>
    <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 2, letterSpacing: '.04em' }}>{sub}</div>
  </button>
);

// ---- Path icons ---------------------------------------------------------
const PathAIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 18 L8.5 9.5 a1 1 0 0 1 1.7 0 L15 16.5" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M11 18 L15.5 11.5 a1 1 0 0 1 1.7 0 L21 18" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="17" cy="13.5" r="1" fill={PTColors.success}/>
  </svg>
);
const PathBIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M5 17 Q9 9 13 12 T20 6" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <circle cx="20" cy="6" r="2" fill={PTColors.success}/>
    <path d="M12 21l4-4-4-4" stroke={PTColors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".6"/>
  </svg>
);
const TrackIconV4 = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M4 18 Q9 12 12 14 T20 6" stroke={PTColors.fg} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <circle cx="4" cy="18" r="1.6" fill={PTColors.fg}/><circle cx="20" cy="6" r="1.6" fill={PTColors.success}/>
  </svg>
);
const ProofIconV4 = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke={PTColors.fg} strokeWidth="1.8"/>
    <circle cx="12" cy="13" r="3" stroke={PTColors.fg} strokeWidth="1.8"/>
  </svg>
);
const ManualIconV4 = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M4 19l4-1 11-11-3-3L5 15z" stroke={PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
);

window.HomeScreenV4 = HomeScreenV4;
