// Peak Trekker — Watermark + Source-label showcase
// Locked palette: bg #0f1113, surface #1a1d21, outline #2a2f34
//                 fg #fff, fg2 #9ca3af, mint #7ef0b4
//
// Exports
//   <TransparentWatermarkScreen />
//   <SourceLabelShowcase />

const WM_BG = '#0f1113';
const WM_SURFACE = '#1a1d21';
const WM_OUTLINE = '#2a2f34';
const WM_FG = '#ffffff';
const WM_FG2 = '#9ca3af';
const WM_MINT = '#7ef0b4';
const WM_FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif";

// ─────────────────────────────────────────
// Shared chrome
// ─────────────────────────────────────────

const WMStatusBar = () => (
  <div style={{
    height: 44, padding: '0 22px', display: 'flex',
    alignItems: 'flex-end', justifyContent: 'space-between',
    fontSize: 14, fontWeight: 600, color: WM_FG, fontFamily: WM_FONT, paddingBottom: 8,
  }}>
    <span>9:41</span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[3,5,7,9].map(h => <span key={h} style={{ width: 3, height: h, background: WM_FG, borderRadius: 1 }} />)}
      </span>
      <span style={{
        width: 22, height: 11, border: `1px solid ${WM_FG}`, borderRadius: 2.5,
        position: 'relative', opacity: .9,
      }}>
        <span style={{ position: 'absolute', inset: 1.5, width: '78%', background: WM_FG, borderRadius: 1 }} />
      </span>
    </span>
  </div>
);

const WMNavBar = ({ title, onBack }) => (
  <div style={{
    height: 44, display: 'flex', alignItems: 'center',
    padding: '0 8px', position: 'relative',
    fontFamily: WM_FONT,
  }}>
    <button onClick={onBack} style={{
      width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M15 6l-6 6 6 6" stroke={WM_FG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
    <div style={{
      position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
      fontSize: 16, fontWeight: 600, color: WM_FG,
    }}>
      {title}
    </div>
  </div>
);

// ─────────────────────────────────────────
// Source labels (canonical spec)
// ─────────────────────────────────────────

// "GPS 验证" — mint, mint 20% bg
// "上传数据" — gray, gray 15% bg
const SourceLabelGps = ({ size = 'sm' }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: size === 'lg' ? '4px 10px' : '2px 8px',
    borderRadius: 4,
    background: 'rgba(126,240,180,.20)', color: WM_MINT,
    fontSize: size === 'lg' ? 12 : 10,
    fontWeight: 600, letterSpacing: '.02em',
    fontFamily: WM_FONT, whiteSpace: 'nowrap',
    lineHeight: 1.2,
  }}>
    <svg width={size === 'lg' ? 11 : 9} height={size === 'lg' ? 11 : 9} viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke={WM_MINT} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    GPS 验证
  </span>
);

const SourceLabelUpload = ({ size = 'sm' }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    padding: size === 'lg' ? '4px 10px' : '2px 8px',
    borderRadius: 4,
    background: 'rgba(156,163,175,.15)', color: WM_FG2,
    fontSize: size === 'lg' ? 12 : 10,
    fontWeight: 600, letterSpacing: '.02em',
    fontFamily: WM_FONT, whiteSpace: 'nowrap',
    lineHeight: 1.2,
  }}>
    上传数据
  </span>
);

// Brand footer (used inside the watermark preview)
const BrandFooterWithGps = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: WM_FONT,
  }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 19l5-9 4 6 3-4 6 7" stroke={WM_MINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <span style={{
      fontSize: 12, fontWeight: 700, color: WM_FG, letterSpacing: '.04em',
      textShadow: '0 1px 2px rgba(0,0,0,.4)',
    }}>
      PEAK TREKKER
    </span>
    <SourceLabelGps size="lg" />
  </div>
);

// ─────────────────────────────────────────
// SCREEN A — Transparent watermark preview
// ─────────────────────────────────────────

// Pure-CSS checkerboard
const checkerBg = {
  backgroundImage: `
    linear-gradient(45deg, #cccccc 25%, transparent 25%),
    linear-gradient(-45deg, #cccccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #cccccc 75%),
    linear-gradient(-45deg, transparent 75%, #cccccc 75%)
  `,
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
  backgroundColor: '#ffffff',
};

// Data-layer floating on checkerboard. NO bg surface.
const TransparentWatermarkPreview = () => (
  <div style={{
    width: '100%', aspectRatio: '9/14', borderRadius: 12, overflow: 'hidden',
    border: `1px solid ${WM_OUTLINE}`,
    position: 'relative',
    ...checkerBg,
  }}>
    {/* trail */}
    <svg width="100%" height="100%" viewBox="0 0 280 436" fill="none" preserveAspectRatio="none"
         style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="wm-trail-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {/* halo */}
      <path
        d="M30 350 Q 70 290, 110 300 T 175 220 Q 210 180, 240 180 T 260 100"
        stroke={WM_MINT} strokeWidth="6" fill="none" strokeLinecap="round"
        opacity=".35" filter="url(#wm-trail-glow)"
      />
      {/* main */}
      <path
        d="M30 350 Q 70 290, 110 300 T 175 220 Q 210 180, 240 180 T 260 100"
        stroke={WM_MINT} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="30" cy="350" r="5" fill="#ffffff" stroke={WM_MINT} strokeWidth="2" />
      <circle cx="260" cy="100" r="5" fill={WM_MINT} />
    </svg>

    {/* hero block */}
    <div style={{
      position: 'absolute', left: 0, right: 0, top: '12%', textAlign: 'center',
      fontFamily: WM_FONT,
    }}>
      <div style={{
        fontSize: 13, color: WM_FG, fontWeight: 600,
        letterSpacing: '.02em',
        textShadow: '0 1px 4px rgba(0,0,0,.5), 0 0 8px rgba(0,0,0,.3)',
      }}>
        玉山主峰 · 台湾
      </div>
      <div style={{
        marginTop: 6,
        fontSize: 50, lineHeight: 1, fontWeight: 700, letterSpacing: '-.02em',
        color: WM_MINT, fontVariantNumeric: 'tabular-nums',
        textShadow: '0 2px 6px rgba(0,0,0,.5), 0 0 10px rgba(0,0,0,.4)',
      }}>
        3,952<span style={{ fontSize: 22, fontWeight: 600, marginLeft: 3 }}>m</span>
      </div>
    </div>

    {/* secondary data row */}
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 56,
      display: 'flex', justifyContent: 'center', gap: 10,
      fontFamily: WM_FONT,
      fontSize: 12, fontWeight: 600, color: WM_FG,
      textShadow: '0 1px 3px rgba(0,0,0,.6)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span>12.8 km</span>
      <span style={{ opacity: .5 }}>·</span>
      <span>06:42</span>
      <span style={{ opacity: .5 }}>·</span>
      <span>1,350 m</span>
      <span style={{ opacity: .5 }}>·</span>
      <span>2026.04.28</span>
    </div>

    {/* footer */}
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
      <BrandFooterWithGps />
    </div>
  </div>
);

const TransparentWatermarkScreen = ({ onBack }) => (
  <div style={{
    width: '100%', height: '100%', background: WM_BG, color: WM_FG,
    fontFamily: WM_FONT, display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <WMStatusBar />
    <WMNavBar title="透明水印预览" onBack={onBack} />

    {/* Preview */}
    <div style={{ padding: '8px 24px 0' }}>
      <TransparentWatermarkPreview />
    </div>

    {/* Hint */}
    <div style={{
      padding: '14px 24px 0',
      fontSize: 12, color: WM_FG2, textAlign: 'center', lineHeight: 1.5,
    }}>
      导出为透明 PNG，可叠加在你的照片或视频上
    </div>

    <div style={{ flex: 1 }} />

    {/* Sticky bottom action bar */}
    <div style={{
      padding: '12px 16px 24px',
      background: WM_BG,
      borderTop: `1px solid ${WM_OUTLINE}`,
      display: 'flex', gap: 8,
    }}>
      {/* Save (mint primary, ~70%) */}
      <button style={{
        flex: '1 1 70%', height: 52, borderRadius: 12,
        background: WM_MINT, border: 'none', color: '#0f1113',
        fontSize: 16, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        cursor: 'pointer', fontFamily: WM_FONT,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14"
                stroke="#0f1113" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        保存到相册
      </button>
      {/* Share (mint outlined, ~30%) */}
      <button style={{
        flex: '0 0 30%', height: 52, borderRadius: 12,
        background: 'transparent', border: `1.5px solid ${WM_MINT}`,
        color: WM_MINT, fontSize: 15, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: 'pointer', fontFamily: WM_FONT,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M7 17L17 7M9 7h8v8" stroke={WM_MINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        分享
      </button>
    </div>
  </div>
);

// ─────────────────────────────────────────
// SCREEN B — Source label showcase
// ─────────────────────────────────────────

// Pointer arrow pointing from a label ("here") toward an inside-mock target.
// Direction: 'right' or 'left'. Label sits at the far edge.
const Pointer = ({ direction = 'right', label }) => (
  <div style={{
    position: 'absolute',
    [direction === 'right' ? 'left' : 'right']: 0,
    top: '50%', transform: 'translateY(-50%)',
    display: 'flex', alignItems: 'center',
    flexDirection: direction === 'right' ? 'row-reverse' : 'row',
    gap: 6, fontFamily: WM_FONT, pointerEvents: 'none',
  }}>
    <span style={{
      fontSize: 11, color: WM_MINT, fontWeight: 600, whiteSpace: 'nowrap',
      letterSpacing: '.04em',
    }}>
      {label}
    </span>
    <svg width="36" height="14" viewBox="0 0 36 14" fill="none"
         style={{ transform: direction === 'left' ? 'scaleX(-1)' : 'none' }}>
      <path d="M2 7 L30 7" stroke={WM_MINT} strokeWidth="1" strokeDasharray="2 2" />
      <path d="M30 7 L26 4 M30 7 L26 10" stroke={WM_MINT} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  </div>
);

// 1 — share poster mini
const PosterMini = () => (
  <div style={{
    width: 110, height: 170, borderRadius: 10,
    background: 'linear-gradient(180deg, #14171a 0%, #0f1113 100%)',
    border: `1px solid ${WM_OUTLINE}`,
    position: 'relative', overflow: 'hidden', flexShrink: 0,
  }}>
    {/* topo */}
    <svg width="100%" height="100%" viewBox="0 0 110 170" fill="none" preserveAspectRatio="xMidYMid slice"
         style={{ position: 'absolute', inset: 0, opacity: .55 }}>
      {[36, 28, 22, 16, 10].map((r, i) => (
        <ellipse key={i} cx="60" cy="78" rx={r * 1.4} ry={r}
          stroke={WM_FG} strokeWidth=".4" fill="none" opacity=".5" />
      ))}
    </svg>
    {/* trail */}
    <svg width="100%" height="100%" viewBox="0 0 110 170" preserveAspectRatio="none"
         style={{ position: 'absolute', inset: 0 }}>
      <path d="M14 130 Q 32 100, 50 110 T 90 60"
            stroke={WM_MINT} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
    {/* altitude */}
    <div style={{ position: 'absolute', left: 0, right: 0, top: 22, textAlign: 'center' }}>
      <div style={{
        fontSize: 22, fontWeight: 700, color: WM_MINT,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em',
      }}>
        3,952<span style={{ fontSize: 11, marginLeft: 1 }}>m</span>
      </div>
      <div style={{ marginTop: 2, fontSize: 8, color: WM_FG, fontWeight: 600, opacity: .9 }}>
        玉山主峰
      </div>
    </div>
    {/* footer with GPS pill */}
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
        <path d="M3 19l5-9 4 6 3-4 6 7" stroke={WM_MINT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ fontSize: 6.5, fontWeight: 700, color: WM_FG, letterSpacing: '.04em' }}>PEAK TREKKER</span>
      <SourceLabelGps />
    </div>
  </div>
);

// 2 — community feed card mini
const FeedCardMini = () => (
  <div style={{
    width: 280, height: 120, borderRadius: 10,
    background: WM_SURFACE, border: `1px solid ${WM_OUTLINE}`,
    position: 'relative', overflow: 'hidden', flexShrink: 0,
    fontFamily: WM_FONT,
  }}>
    {/* avatar + handle */}
    <div style={{
      padding: '10px 12px 0', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: 'linear-gradient(135deg, #2a3138 0%, #14171a 100%)',
        border: `1px solid ${WM_OUTLINE}`,
      }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: WM_FG, lineHeight: 1.2 }}>登山者 1024</div>
        <div style={{ fontSize: 9, color: WM_FG2 }}>2 小时前</div>
      </div>
    </div>

    {/* data row + label */}
    <div style={{
      padding: '8px 12px',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 10, color: WM_FG, fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span><span style={{ color: WM_MINT }}>3,952</span><span style={{ fontSize: 8, color: WM_FG2 }}>m</span></span>
      <span style={{ opacity: .4 }}>·</span>
      <span>12.8 km</span>
      <span style={{ opacity: .4 }}>·</span>
      <span>06:42</span>
      <SourceLabelUpload />
    </div>

    {/* caption */}
    <div style={{ padding: '0 12px', fontSize: 10, color: WM_FG, opacity: .85, lineHeight: 1.4 }}>
      雨后的玉山特别清澈，能见度极好…
    </div>
  </div>
);

// 3 — activity detail header mini
const ActivityHeaderMini = () => (
  <div style={{
    width: 280, height: 120, borderRadius: 10,
    background: WM_SURFACE, border: `1px solid ${WM_OUTLINE}`,
    position: 'relative', overflow: 'hidden', flexShrink: 0,
    fontFamily: WM_FONT, padding: 14,
  }}>
    <div style={{
      fontSize: 9, color: WM_FG2, letterSpacing: '.16em', fontWeight: 600,
    }}>
      2026.04.28
    </div>
    <div style={{
      marginTop: 4, fontSize: 18, fontWeight: 700, color: WM_FG, letterSpacing: '-.01em',
    }}>
      玉山主峰
    </div>
    <div style={{
      marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 12,
    }}>
      <span style={{
        fontSize: 26, fontWeight: 700, color: WM_MINT,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em',
      }}>
        3,952<span style={{ fontSize: 12, marginLeft: 1 }}>m</span>
      </span>
      <SourceLabelGps size="lg" />
    </div>
    <div style={{
      marginTop: 8, fontSize: 11, color: WM_FG, opacity: .85,
      fontVariantNumeric: 'tabular-nums',
    }}>
      12.8 km · 06:42 · 1,350 m
    </div>
  </div>
);

// 4 — record list item mini
const RecordItemMini = () => (
  <div style={{
    width: 280, height: 70, borderRadius: 10,
    background: WM_SURFACE, border: `1px solid ${WM_OUTLINE}`,
    position: 'relative', overflow: 'hidden', flexShrink: 0,
    fontFamily: WM_FONT,
    padding: '10px 14px',
    display: 'flex', alignItems: 'center', gap: 12,
  }}>
    {/* tiny altitude */}
    <div style={{ minWidth: 70 }}>
      <div style={{
        fontSize: 18, fontWeight: 700, color: WM_MINT,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em', lineHeight: 1,
      }}>
        3,952<span style={{ fontSize: 9, marginLeft: 1 }}>m</span>
      </div>
      <div style={{ marginTop: 2, fontSize: 9, color: WM_FG2 }}>2026.04.28</div>
    </div>
    <div style={{ flex: 1 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: WM_FG }}>玉山主峰</span>
        <SourceLabelUpload />
      </div>
      <div style={{ marginTop: 2, fontSize: 10, color: WM_FG2, fontVariantNumeric: 'tabular-nums' }}>
        12.8 km · 06:42
      </div>
    </div>
  </div>
);

// One showcase row
const ShowcaseRow = ({ caption, mock, pointerLabel }) => (
  <div style={{ position: 'relative', padding: '0 24px', fontFamily: WM_FONT }}>
    <div style={{
      fontSize: 11, color: WM_FG2, letterSpacing: '.14em',
      textTransform: 'uppercase', fontWeight: 600, marginBottom: 8,
    }}>
      {caption}
    </div>
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-start' }}>
      {mock}
      <Pointer direction="right" label={pointerLabel} />
    </div>
  </div>
);

const SourceLabelShowcase = ({ onBack }) => (
  <div style={{
    width: '100%', height: '100%', background: WM_BG, color: WM_FG,
    fontFamily: WM_FONT, display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <WMStatusBar />
    <WMNavBar title="来源标签 · Source Labels" onBack={onBack} />

    <div style={{
      flex: 1, overflowY: 'auto', padding: '8px 0 16px',
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      <ShowcaseRow
        caption="分享海报中"
        pointerLabel="GPS 验证"
        mock={<PosterMini />}
      />
      <ShowcaseRow
        caption="山友圈卡片中"
        pointerLabel="上传数据"
        mock={<FeedCardMini />}
      />
      <ShowcaseRow
        caption="活动详情页中"
        pointerLabel="GPS 验证"
        mock={<ActivityHeaderMini />}
      />
      <ShowcaseRow
        caption="我的记录中"
        pointerLabel="上传数据"
        mock={<RecordItemMini />}
      />

      {/* spec footer */}
      <div style={{
        margin: '6px 24px 0', padding: '14px 16px', borderRadius: 10,
        background: WM_SURFACE, border: `1px solid ${WM_OUTLINE}`,
      }}>
        <div style={{
          fontSize: 11, color: WM_FG2, letterSpacing: '.14em',
          textTransform: 'uppercase', fontWeight: 600, marginBottom: 10,
        }}>
          标签规格
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SourceLabelGps size="lg" />
            <span style={{ fontSize: 11, color: WM_FG2, lineHeight: 1.4 }}>
              <span style={{ color: WM_FG, fontWeight: 600 }}>GPS 验证</span> · 实时记录的真实数据 · mint 20% bg
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SourceLabelUpload size="lg" />
            <span style={{ fontSize: 11, color: WM_FG2, lineHeight: 1.4 }}>
              <span style={{ color: WM_FG, fontWeight: 600 }}>上传数据</span> · 截图识别 / 手动导入 · gray 15% bg
            </span>
          </div>
          <div style={{
            paddingTop: 8, borderTop: `1px solid ${WM_OUTLINE}`,
            fontSize: 10, color: WM_FG2, lineHeight: 1.5, fontFamily: WM_FONT,
          }}>
            radius 4 · padX 8 · padY 2 · 12pt
          </div>
        </div>
      </div>
    </div>
  </div>
);

window.TransparentWatermarkScreen = TransparentWatermarkScreen;
window.SourceLabelShowcase = SourceLabelShowcase;
