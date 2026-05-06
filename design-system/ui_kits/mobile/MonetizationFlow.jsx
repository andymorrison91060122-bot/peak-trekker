// Peak Trekker — Monetization screens (locked design system)
// Exports
//   <PaywallSheet />              — bottom sheet over a dimmed page
//   <ProfileMembershipModule />   — three-state reference module
//
// Locked palette: bg #0f1113, surface #1a1d21, deep #15181a, outline #2a2f34
//                 fg #fff, fg2 #9ca3af, mint #7ef0b4

const PW_BG = '#0f1113';
const PW_SURFACE = '#1a1d21';
const PW_DEEP = '#15181a';
const PW_OUTLINE = '#2a2f34';
const PW_FG = '#ffffff';
const PW_FG2 = '#9ca3af';
const PW_MINT = '#7ef0b4';
const PW_FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif";

// ─────────────────────────────────────────
// Screen A — Paywall Bottom Sheet
// ─────────────────────────────────────────

// Background: a quiet representation of the share editor underneath, dimmed.
const PaywallBackdrop = () => (
  <div style={{
    position: 'absolute', inset: 0,
    background: PW_BG, fontFamily: PW_FONT,
    overflow: 'hidden',
  }}>
    {/* faux preview card silhouette to suggest "the share editor is behind this" */}
    <div style={{
      position: 'absolute', left: '50%', top: 90,
      transform: 'translateX(-50%)',
      width: 200, height: 355, borderRadius: 12,
      border: `1px solid ${PW_OUTLINE}`,
      background: 'linear-gradient(180deg, #14171a 0%, #0f1113 100%)',
      opacity: .9,
    }}>
      {/* faint trail */}
      <svg width="100%" height="100%" viewBox="0 0 200 355" fill="none" preserveAspectRatio="none">
        <path d="M22 290 Q 50 240, 80 250 T 140 180 T 175 110"
              stroke={PW_MINT} strokeWidth="2" fill="none" strokeLinecap="round" opacity=".5" />
      </svg>
    </div>
    {/* 60% black scrim */}
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)',
    }} />
  </div>
);

const PriceOptionCard = ({ recommended, title, price, priceUnit, desc }) => (
  <div style={{
    position: 'relative',
    padding: '18px 16px',
    borderRadius: 12,
    background: PW_DEEP,
    border: recommended ? `2px solid ${PW_MINT}` : `1px solid ${PW_OUTLINE}`,
    fontFamily: PW_FONT,
  }}>
    {recommended && (
      <div style={{
        position: 'absolute', top: -10, right: 14,
        padding: '3px 9px', borderRadius: 999,
        background: PW_MINT, color: '#0f1113',
        fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
      }}>
        推荐
      </div>
    )}
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: PW_FG }}>{title}</span>
      <span style={{
        fontSize: 24, fontWeight: 700, color: recommended ? PW_MINT : PW_FG,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em',
        whiteSpace: 'nowrap',
      }}>
        {price}
        <span style={{ fontSize: 13, fontWeight: 500, color: PW_FG2, marginLeft: 2 }}>{priceUnit}</span>
      </span>
    </div>
    <div style={{ marginTop: 6, fontSize: 12, color: PW_FG2, lineHeight: 1.5 }}>
      {desc}
    </div>
  </div>
);

const PaywallSheet = () => (
  <div style={{
    position: 'relative', width: '100%', height: '100%',
    background: PW_BG, color: PW_FG,
    fontFamily: PW_FONT, overflow: 'hidden',
  }}>
    <PaywallBackdrop />

    {/* Sheet */}
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      height: '55%', minHeight: 440,
      background: PW_SURFACE,
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      padding: '10px 20px 24px',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 -8px 32px rgba(0,0,0,.5)',
    }}>
      {/* drag handle */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4, paddingBottom: 14 }}>
        <span style={{ width: 32, height: 4, borderRadius: 999, background: '#3a3f44' }} />
      </div>

      {/* title + subtitle */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: PW_FG, letterSpacing: '-.01em' }}>
          解锁高级模板
        </div>
        <div style={{
          marginTop: 6, fontSize: 14, color: PW_FG2, lineHeight: 1.5,
          maxWidth: 280, margin: '6px auto 0',
        }}>
          你正在使用高级模板，限免期已结束
        </div>
      </div>

      <div style={{ height: 20 }} />

      {/* options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PriceOptionCard
          recommended
          title="月度会员"
          price="¥18"
          priceUnit="/月"
          desc="所有高级模板无限使用"
        />
        <PriceOptionCard
          title="单次解锁"
          price="¥3"
          priceUnit="/次"
          desc="本次导出使用高级模板"
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* primary + later */}
      <button style={{
        width: '100%', height: 52, borderRadius: 12, border: 'none',
        background: PW_MINT, color: '#0f1113',
        fontSize: 16, fontWeight: 700, cursor: 'pointer',
        fontFamily: PW_FONT, marginTop: 16,
      }}>
        继续
      </button>
      <button style={{
        marginTop: 10, padding: '10px 0', background: 'transparent', border: 'none',
        color: PW_FG2, fontSize: 14, cursor: 'pointer', fontFamily: PW_FONT,
      }}>
        稍后再说
      </button>
    </div>
  </div>
);

// ─────────────────────────────────────────
// Screen B — Profile Membership Module
// ─────────────────────────────────────────

// Right-side state pill / button
const StatusEnd = ({ state }) => {
  if (state === 'free') {
    return (
      <span style={{
        padding: '4px 10px', borderRadius: 999,
        background: 'rgba(126,240,180,.12)', border: `1px solid rgba(126,240,180,.28)`,
        fontSize: 12, fontWeight: 600, color: PW_MINT,
        whiteSpace: 'nowrap', fontFamily: PW_FONT,
      }}>
        永久免费
      </span>
    );
  }
  if (state === 'trial') {
    return (
      <span style={{
        fontSize: 12, fontWeight: 600, color: PW_MINT, whiteSpace: 'nowrap',
        fontFamily: PW_FONT,
      }}>
        限时免费中，剩余 23 天
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span style={{
        fontSize: 12, fontWeight: 600, color: PW_MINT, whiteSpace: 'nowrap',
        fontFamily: PW_FONT,
      }}>
        月度会员，有效期至 2026.06.28
      </span>
    );
  }
  // locked
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: PW_FONT }}>
      <span style={{ fontSize: 12, color: PW_FG2 }}>已锁定</span>
      <button style={{
        padding: '5px 12px', borderRadius: 999,
        background: 'transparent', border: `1.5px solid ${PW_MINT}`,
        color: PW_MINT, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        fontFamily: PW_FONT,
      }}>
        解锁
      </button>
    </span>
  );
};

// Single row
const StatusRow = ({ label, state, last }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: last ? 'none' : `1px solid ${PW_OUTLINE}`,
    gap: 12, fontFamily: PW_FONT,
  }}>
    <span style={{ fontSize: 14, color: PW_FG, fontWeight: 500 }}>{label}</span>
    <StatusEnd state={state} />
  </div>
);

// One module card
const MembershipModule = ({ advancedState = 'trial' }) => (
  <div style={{
    padding: 16, borderRadius: 12,
    background: PW_SURFACE, border: `1px solid ${PW_OUTLINE}`,
    fontFamily: PW_FONT,
  }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: PW_FG, marginBottom: 8 }}>
      分享模板
    </div>
    <StatusRow label="基础模板" state="free" />
    <StatusRow label="高级模板" state={advancedState} last />
  </div>
);

// Reference screen showing all three states stacked, with brief state captions.
const ProfileMembershipModule = () => (
  <div style={{
    width: '100%', height: '100%', background: PW_BG, color: PW_FG,
    fontFamily: PW_FONT, overflow: 'hidden',
  }}>
    {/* Status bar */}
    <div style={{
      height: 44, padding: '0 22px', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'space-between',
      fontSize: 14, fontWeight: 600, color: PW_FG, paddingBottom: 8,
    }}>
      <span>9:41</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ display: 'inline-flex', gap: 2 }}>
          {[3,5,7,9].map(h => <span key={h} style={{ width: 3, height: h, background: PW_FG, borderRadius: 1 }} />)}
        </span>
        <span style={{
          width: 22, height: 11, border: `1px solid ${PW_FG}`, borderRadius: 2.5,
          position: 'relative', opacity: .9,
        }}>
          <span style={{ position: 'absolute', inset: 1.5, width: '78%', background: PW_FG, borderRadius: 1 }} />
        </span>
      </span>
    </div>

    {/* Faux header to set context */}
    <div style={{ padding: '4px 20px 0' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: PW_FG, letterSpacing: '-.01em' }}>设置</div>
      <div style={{ fontSize: 13, color: PW_FG2, marginTop: 2 }}>分享模板状态</div>
    </div>

    {/* Stacked variants with caption */}
    <div style={{
      padding: '20px 20px 0',
      display: 'flex', flexDirection: 'column', gap: 18,
      overflowY: 'auto', height: 'calc(100% - 100px)',
    }}>
      {[
        { caption: '限免期内', state: 'trial' },
        { caption: '已订阅月度会员', state: 'active' },
        { caption: '限免结束 / 未订阅', state: 'locked' },
      ].map(v => (
        <div key={v.state}>
          <div style={{
            fontSize: 11, color: PW_FG2, letterSpacing: '.14em',
            textTransform: 'uppercase', fontWeight: 600, marginBottom: 8,
            paddingLeft: 4,
          }}>
            {v.caption}
          </div>
          <MembershipModule advancedState={v.state} />
        </div>
      ))}
      <div style={{ height: 20 }} />
    </div>
  </div>
);

window.PaywallSheet = PaywallSheet;
window.ProfileMembershipModule = ProfileMembershipModule;
