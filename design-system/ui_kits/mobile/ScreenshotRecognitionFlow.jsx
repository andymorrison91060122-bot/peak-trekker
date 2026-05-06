// Peak Trekker — Screenshot Recognition flow
// Locked design system: dark theme, mint #7ef0b4, no chrome on data, sans-only.
//
// Exports
//   <ScreenshotUploadScreen />     — A · upload entry
//   <ScreenshotProcessingScreen /> — B · scanning / extracting

const SR_BG = '#0f1113';
const SR_SURFACE = '#1a1d21';
const SR_OUTLINE = '#2a2f34';
const SR_FG = '#ffffff';
const SR_FG2 = '#9ca3af';
const SR_MINT = '#7ef0b4';

const SR_FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif";

// ───────────────────────────────────────────
// Shared chrome
// ───────────────────────────────────────────

const SRStatusBar = () => (
  <div style={{
    height: 44, padding: '0 22px', display: 'flex',
    alignItems: 'flex-end', justifyContent: 'space-between',
    fontSize: 14, fontWeight: 600, color: SR_FG, fontFamily: SR_FONT,
    paddingBottom: 8,
  }}>
    <span>9:41</span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[3,5,7,9].map(h => <span key={h} style={{ width: 3, height: h, background: SR_FG, borderRadius: 1 }} />)}
      </span>
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
        <path d="M8 3.5a6 6 0 0 1 4.2 1.7l1.4-1.4A8 8 0 0 0 8 1.5a8 8 0 0 0-5.6 2.3l1.4 1.4A6 6 0 0 1 8 3.5z" fill={SR_FG}/>
        <path d="M8 6.5a3 3 0 0 1 2.1.9l1.4-1.4A5 5 0 0 0 8 4.5a5 5 0 0 0-3.5 1.5l1.4 1.4A3 3 0 0 1 8 6.5z" fill={SR_FG}/>
        <circle cx="8" cy="9" r="1.4" fill={SR_FG}/>
      </svg>
      <span style={{
        width: 22, height: 11, border: `1px solid ${SR_FG}`, borderRadius: 2.5,
        position: 'relative', opacity: .9,
      }}>
        <span style={{ position: 'absolute', inset: 1.5, width: '78%', background: SR_FG, borderRadius: 1 }} />
      </span>
    </span>
  </div>
);

const SRNavBar = ({ title, onBack }) => (
  <div style={{
    height: 44, display: 'flex', alignItems: 'center',
    padding: '0 8px', position: 'relative',
    fontFamily: SR_FONT,
  }}>
    <button onClick={onBack} style={{
      width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M15 6l-6 6 6 6" stroke={SR_FG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
    <div style={{
      position: 'absolute', left: 0, right: 0, textAlign: 'center',
      fontSize: 16, fontWeight: 600, color: SR_FG, pointerEvents: 'none',
    }}>{title}</div>
  </div>
);

// Glyph: scan/camera (rounded square + corner ticks + center lens hint)
const ScanGlyph = ({ size = 48, color = SR_MINT }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    {/* corner ticks */}
    <path d="M8 16 V10 a2 2 0 0 1 2 -2 H16" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M40 16 V10 a2 2 0 0 0 -2 -2 H32" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M8 32 V38 a2 2 0 0 0 2 2 H16" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M40 32 V38 a2 2 0 0 1 -2 2 H32" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    {/* horizontal scan line */}
    <line x1="14" y1="24" x2="34" y2="24" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

// ───────────────────────────────────────────
// SCREEN A · Screenshot Upload
// ───────────────────────────────────────────

const ScreenshotUploadScreen = ({ onBack, onChoose, onCamera, onHowTo }) => (
  <div style={{
    width: '100%', height: '100%', background: SR_BG, color: SR_FG,
    fontFamily: SR_FONT, display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <SRStatusBar />
    <SRNavBar title="识别截图" onBack={onBack} />

    {/* Center stack: upload zone + howto link */}
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 24px', gap: 18,
    }}>
      <button onClick={onChoose} style={{
        width: 280, height: 200, borderRadius: 16,
        background: 'transparent',
        border: `2px dashed ${SR_OUTLINE}`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '0 20px', cursor: 'pointer',
        color: SR_FG, fontFamily: SR_FONT,
      }}>
        <ScanGlyph size={48} />
        <div style={{ fontSize: 16, fontWeight: 600, color: SR_FG, lineHeight: 1.4 }}>
          上传记录截图
        </div>
        <div style={{
          fontSize: 12, color: SR_FG2, lineHeight: 1.5,
          textAlign: 'center', maxWidth: 240,
        }}>
          支持两步路、六只脚、行者等APP的记录截图
        </div>
      </button>

      <button onClick={onHowTo} style={{
        background: 'transparent', border: 'none', padding: '6px 8px',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        color: SR_MINT, fontSize: 14, fontWeight: 500, cursor: 'pointer',
        fontFamily: SR_FONT,
      }}>
        如何获取截图？
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M9 6l6 6-6 6" stroke={SR_MINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>

    {/* Bottom buttons */}
    <div style={{ padding: '12px 20px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={onChoose} style={{
        height: 52, borderRadius: 12, border: 'none',
        background: SR_MINT, color: '#0f1113',
        fontSize: 16, fontWeight: 700, cursor: 'pointer',
        fontFamily: SR_FONT,
      }}>
        选择照片
      </button>
      <button onClick={onCamera} style={{
        height: 52, borderRadius: 12,
        background: 'transparent', border: `1.5px solid ${SR_MINT}`,
        color: SR_MINT, fontSize: 16, fontWeight: 600, cursor: 'pointer',
        fontFamily: SR_FONT,
      }}>
        拍照
      </button>
    </div>
  </div>
);

// ───────────────────────────────────────────
// SCREEN B · Processing
// ───────────────────────────────────────────

// Mock-screenshot preview content. Aspect ratio 9:16, sized to ~60% canvas width.
const MockScreenshot = () => {
  // simulated route polyline (non-functional, just visual)
  return (
    <div style={{
      width: 220, aspectRatio: '9/16', borderRadius: 12,
      border: `1px solid ${SR_OUTLINE}`, overflow: 'hidden',
      background: 'linear-gradient(180deg, #14171a 0%, #0f1113 100%)',
      position: 'relative', flexShrink: 0,
    }}>
      {/* faux app status row */}
      <div style={{
        height: 22, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 8, color: SR_FG2, fontWeight: 600, opacity: .7,
      }}>
        <span>9:32</span>
        <span>•••</span>
      </div>
      {/* faux header */}
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ height: 6, width: '70%', background: SR_OUTLINE, borderRadius: 2 }} />
        <div style={{ height: 4, width: '40%', background: SR_OUTLINE, borderRadius: 2, marginTop: 5, opacity: .5 }} />
      </div>
      {/* faux map area with route */}
      <div style={{
        margin: '0 10px', height: 140, borderRadius: 6,
        background: 'radial-gradient(ellipse at 30% 40%, #2a2f34 0%, #1a1d21 60%, #0f1113 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
          <path
            d="M20 110 Q 50 80, 70 90 T 110 60 Q 130 45, 150 50 T 185 25"
            stroke={SR_MINT} strokeWidth="2.5" fill="none" strokeLinecap="round"
            opacity=".95"
          />
          {/* start/end dots */}
          <circle cx="20" cy="110" r="3" fill={SR_MINT} />
          <circle cx="185" cy="25" r="3" fill={SR_MINT} />
        </svg>
      </div>
      {/* faux stat grid */}
      <div style={{ padding: '12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[1,2,3].map(i => (
          <div key={i}>
            <div style={{ height: 10, width: '70%', background: SR_OUTLINE, borderRadius: 2 }} />
            <div style={{ height: 4, width: '50%', background: SR_OUTLINE, borderRadius: 2, marginTop: 4, opacity: .4 }} />
          </div>
        ))}
      </div>
      {/* faux body lines */}
      <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[90, 75, 82, 60].map((w, i) => (
          <div key={i} style={{ height: 3, width: `${w}%`, background: SR_OUTLINE, borderRadius: 2, opacity: .4 }} />
        ))}
      </div>

      {/* SCAN LINE — at ~30% of screenshot height */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '30%',
        height: 2, background: SR_MINT,
        boxShadow: `0 0 12px ${SR_MINT}, 0 0 24px ${SR_MINT}80`,
        animation: 'sr-scan 2.4s ease-in-out infinite',
      }} />
      {/* scan line gradient overlay */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 'calc(30% - 30px)',
        height: 32, pointerEvents: 'none',
        background: `linear-gradient(180deg, transparent 0%, ${SR_MINT}1f 80%, transparent 100%)`,
        animation: 'sr-scan-glow 2.4s ease-in-out infinite',
      }} />
    </div>
  );
};

const StatusRow = ({ state, label }) => {
  // state: 'done' | 'active' | 'pending'
  const color = state === 'done' ? SR_MINT : state === 'active' ? SR_FG2 : SR_FG2;
  const textColor = state === 'done' ? SR_FG : state === 'active' ? SR_FG2 : SR_FG2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: SR_FONT }}>
      <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {state === 'done' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke={SR_MINT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            border: `1.5px solid ${color}`,
            opacity: state === 'active' ? .9 : .55,
          }} />
        )}
      </div>
      <span style={{ fontSize: 14, color: textColor, fontWeight: state === 'done' ? 500 : 400 }}>
        {label}
      </span>
    </div>
  );
};

const ScreenshotProcessingScreen = ({ onBack }) => (
  <div style={{
    width: '100%', height: '100%', background: SR_BG, color: SR_FG,
    fontFamily: SR_FONT, display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <style>{`
      @keyframes sr-scan {
        0%, 100% { top: 18%; }
        50% { top: 78%; }
      }
      @keyframes sr-scan-glow {
        0%, 100% { top: calc(18% - 30px); }
        50% { top: calc(78% - 30px); }
      }
      @keyframes sr-pulse {
        0%, 80%, 100% { opacity: .25; transform: scale(.85); }
        40% { opacity: 1; transform: scale(1); }
      }
    `}</style>

    <SRStatusBar />
    <SRNavBar title="识别截图" onBack={onBack} />

    {/* Screenshot at top center, with scan overlay */}
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 24 }}>
      <MockScreenshot />
    </div>

    {/* Title + dots */}
    <div style={{ textAlign: 'center', marginTop: 28 }}>
      <div style={{ fontSize: 16, color: SR_FG, fontWeight: 600 }}>
        正在识别你的记录...
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%', background: SR_MINT,
            animation: `sr-pulse 1.4s ease-in-out infinite`,
            animationDelay: `${i * 0.18}s`,
          }} />
        ))}
      </div>
    </div>

    {/* Status lines */}
    <div style={{
      marginTop: 36, padding: '0 40px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <StatusRow state="done" label="文字信息提取完成" />
      <StatusRow state="active" label="轨迹路线识别中..." />
      <StatusRow state="pending" label="数据整理中..." />
    </div>

    <div style={{ flex: 1 }} />
  </div>
);

// ───────────────────────────────────────────
// SCREEN C · Confirm Recognition Results
// ───────────────────────────────────────────

// Trail preview card — re-rendered route in Peak Trekker style.
// Variant: 'recognized' | 'unrecognized'
const TrailPreviewCard = ({ variant = 'recognized' }) => {
  if (variant === 'unrecognized') {
    return (
      <div style={{
        height: 180, borderRadius: 12,
        border: `2px dashed ${SR_OUTLINE}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
      }}>
        <div style={{ fontSize: 13, color: SR_FG2, fontFamily: SR_FONT }}>
          未能识别轨迹，可跳过
        </div>
      </div>
    );
  }
  return (
    <div style={{
      height: 180, borderRadius: 12, background: SR_BG,
      position: 'relative', overflow: 'hidden',
      border: `1px solid ${SR_OUTLINE}`,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 343 180" fill="none" preserveAspectRatio="none">
        <defs>
          <filter id="trailGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {/* glow halo */}
        <path
          d="M30 145 Q 70 110, 100 120 T 165 80 Q 200 60, 235 65 T 315 30"
          stroke={SR_MINT} strokeWidth="6" fill="none" strokeLinecap="round"
          opacity=".22" filter="url(#trailGlow)"
        />
        {/* main trail */}
        <path
          d="M30 145 Q 70 110, 100 120 T 165 80 Q 200 60, 235 65 T 315 30"
          stroke={SR_MINT} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"
        />
        {/* start: hollow */}
        <circle cx="30" cy="145" r="5.5" fill={SR_BG} stroke={SR_MINT} strokeWidth="2" />
        {/* end: filled */}
        <circle cx="315" cy="30" r="5.5" fill={SR_MINT} />
      </svg>
    </div>
  );
};

// Drag handle (six dots)
const DragHandle = () => (
  <svg width="14" height="20" viewBox="0 0 14 20" fill="none" style={{ flexShrink: 0 }}>
    {[0, 1].map(col => (
      [0, 1, 2].map(row => (
        <circle key={`${col}-${row}`} cx={3 + col * 8} cy={4 + row * 6} r="1.5" fill={SR_FG2} opacity=".5" />
      ))
    ))}
  </svg>
);

// Edit pencil — highlighted variant in mint
const EditPencil = ({ highlighted }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M14.7 4.3l5 5L8.5 20.5 3 22l1.5-5.5L14.7 4.3z"
      stroke={highlighted ? SR_MINT : SR_FG2}
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </svg>
);

// Lock icon
const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="9" rx="1.6" stroke={SR_FG2} strokeWidth="1.7" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={SR_FG2} strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

// iOS-style toggle
const Toggle = ({ on }) => (
  <span style={{
    width: 38, height: 22, borderRadius: 999,
    background: on ? SR_MINT : '#3a3f44',
    position: 'relative', flexShrink: 0,
    transition: 'background 200ms',
  }}>
    <span style={{
      position: 'absolute', top: 2, left: on ? 18 : 2,
      width: 18, height: 18, borderRadius: '50%',
      background: '#ffffff',
      transition: 'left 200ms',
      boxShadow: '0 1px 3px rgba(0,0,0,.3)',
    }} />
  </span>
);

// Field row
const FieldRow = ({ label, value, locked, on, missing, autoMatched, last }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 4px', minHeight: 56,
    borderBottom: last ? 'none' : `1px solid ${SR_BG}`,
    fontFamily: SR_FONT,
  }}>
    <div style={{ paddingTop: 4 }}>
      <DragHandle />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{
          fontSize: 14, color: SR_FG2, flexShrink: 0,
          minWidth: 80,
        }}>
          {label}
        </span>
        <span style={{
          fontSize: 16, fontWeight: 600, color: missing ? SR_FG2 : SR_FG,
          flex: 1, fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {missing ? '—' : value}
          {autoMatched && (
            <span style={{
              marginLeft: 8, fontSize: 11, color: SR_MINT, fontWeight: 500,
              padding: '2px 6px', borderRadius: 4, background: 'rgba(126,240,180,.12)',
              verticalAlign: 'middle',
            }}>
              自动匹配
            </span>
          )}
        </span>
      </div>
      {missing && (
        <div style={{
          marginLeft: 92, marginTop: 4,
          fontSize: 12, color: '#ff6b6b',
        }}>
          未识别，请填写
        </div>
      )}
    </div>
    <button style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
      flexShrink: 0,
    }}>
      <EditPencil highlighted={missing} />
    </button>
    <div style={{ width: 38, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', height: 28, flexShrink: 0 }}>
      {locked ? <LockIcon /> : <Toggle on={on} />}
    </div>
  </div>
);

// Validation bar
const ValidationBar = ({ tone }) => {
  const isWarn = tone === 'warning';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 10,
      background: isWarn ? 'rgba(255,196,0,.08)' : 'rgba(126,240,180,.06)',
      border: `1px solid ${isWarn ? 'rgba(255,196,0,.3)' : 'rgba(126,240,180,.2)'}`,
      fontFamily: SR_FONT,
    }}>
      {isWarn ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M12 3l10 17H2L12 3z" stroke="#ffc400" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 10v4" stroke="#ffc400" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1" fill="#ffc400" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M5 13l4 4L19 7" stroke={SR_MINT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      <span style={{ fontSize: 13, color: isWarn ? '#ffc400' : SR_MINT, fontWeight: 500 }}>
        {isWarn ? '速度偏高，请确认数据是否正确' : '所有数据在合理范围内'}
      </span>
    </div>
  );
};

// Variants
//   trail: 'recognized' | 'unrecognized'
//   validation: 'normal' | 'warning'
const ScreenshotConfirmScreen = ({
  onBack, trail = 'recognized', validation = 'normal',
}) => (
  <div style={{
    width: '100%', height: '100%', background: SR_BG, color: SR_FG,
    fontFamily: SR_FONT, display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <SRStatusBar />
    <SRNavBar title="确认识别结果" onBack={onBack} />

    {/* Scrollable body */}
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '8px 16px 0',
    }}>
      <TrailPreviewCard variant={trail} />

      <div style={{
        marginTop: 22, marginBottom: 6,
        fontSize: 16, fontWeight: 600, color: SR_FG,
      }}>
        识别结果
      </div>

      <div>
        <FieldRow label="海拔"     value="3,952 m"  locked />
        <FieldRow label="总距离"   value="12.8 km"  locked />
        <FieldRow label="时长"     value="06:42"    on />
        <FieldRow label="爬升"     value="1,350 m"  on />
        <FieldRow label="日期"     value="2026.04.28" on />
        <FieldRow label="地点"     missing on />
        <FieldRow label="配速"     missing />
        <FieldRow label="山峰匹配" value="玉山主峰" autoMatched on last />
      </div>

      <div style={{ marginTop: 16 }}>
        <ValidationBar tone={validation} />
      </div>

      <div style={{ height: 20 }} />
    </div>

    {/* Sticky bottom */}
    <div style={{
      padding: '12px 16px 24px',
      background: SR_BG,
      borderTop: `1px solid ${SR_BG}`,
    }}>
      <button style={{
        width: '100%', height: 52, borderRadius: 12, border: 'none',
        background: SR_MINT, color: '#0f1113',
        fontSize: 16, fontWeight: 700, cursor: 'pointer',
        fontFamily: SR_FONT,
      }}>
        确认并生成活动
      </button>
      <div style={{
        marginTop: 10, textAlign: 'center',
        fontSize: 12, color: SR_FG2, lineHeight: 1.5,
      }}>
        确认后将生成活动记录，可随时在分享编辑器中调整
      </div>
    </div>
  </div>
);

// Convenience variants for the gallery
const ScreenshotConfirmRecognized = () => <ScreenshotConfirmScreen trail="recognized" validation="normal" />;
const ScreenshotConfirmWarning    = () => <ScreenshotConfirmScreen trail="recognized" validation="warning" />;
const ScreenshotConfirmNoTrail    = () => <ScreenshotConfirmScreen trail="unrecognized" validation="normal" />;

window.ScreenshotUploadScreen = ScreenshotUploadScreen;
window.ScreenshotProcessingScreen = ScreenshotProcessingScreen;
window.ScreenshotConfirmScreen = ScreenshotConfirmScreen;
window.ScreenshotConfirmRecognized = ScreenshotConfirmRecognized;
window.ScreenshotConfirmWarning = ScreenshotConfirmWarning;
window.ScreenshotConfirmNoTrail = ScreenshotConfirmNoTrail;
