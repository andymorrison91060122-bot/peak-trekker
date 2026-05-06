// Peak Trekker — GPX/FIT track import confirmation
// Mirrors the screenshot-recognition confirm screen, but with:
//   • A richer topographic preview (contour lines + place labels)
//   • All fields populated (no missing/未识别 states)
//   • Section header "导入数据"
//   • An additional helper-button row under the mountain match
//   • A source-label preview ("上传数据" gray pill)
//
// Exports
//   <GpxImportConfirmScreen />

const GP_BG = '#0f1113';
const GP_SURFACE = '#1a1d21';
const GP_DEEP = '#15181a';
const GP_OUTLINE = '#2a2f34';
const GP_FG = '#ffffff';
const GP_FG2 = '#9ca3af';
const GP_MINT = '#7ef0b4';
const GP_FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif";

// ─────────────────────────────────────────
// Chrome
// ─────────────────────────────────────────

const GPStatusBar = () => (
  <div style={{
    height: 44, padding: '0 22px', display: 'flex',
    alignItems: 'flex-end', justifyContent: 'space-between',
    fontSize: 14, fontWeight: 600, color: GP_FG, fontFamily: GP_FONT, paddingBottom: 8,
  }}>
    <span>9:41</span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[3,5,7,9].map(h => <span key={h} style={{ width: 3, height: h, background: GP_FG, borderRadius: 1 }} />)}
      </span>
      <span style={{
        width: 22, height: 11, border: `1px solid ${GP_FG}`, borderRadius: 2.5,
        position: 'relative', opacity: .9,
      }}>
        <span style={{ position: 'absolute', inset: 1.5, width: '78%', background: GP_FG, borderRadius: 1 }} />
      </span>
    </span>
  </div>
);

const GPNavBar = ({ title, onBack }) => (
  <div style={{
    height: 44, display: 'flex', alignItems: 'center',
    padding: '0 8px', position: 'relative', fontFamily: GP_FONT,
  }}>
    <button onClick={onBack} style={{
      width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M15 6l-6 6 6 6" stroke={GP_FG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
    <div style={{
      position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
      fontSize: 16, fontWeight: 600, color: GP_FG,
    }}>
      {title}
    </div>
  </div>
);

// ─────────────────────────────────────────
// Topographic preview card
// ─────────────────────────────────────────
//
// 343 wide × 200 tall, dark surface, lots of structure visible:
//   - Two layered contour-ellipse clusters (玉山主峰 area + 玉山北峰 area)
//   - Faint NS/EW grid hairlines (very low opacity)
//   - Trail polyline from排雲山莊→玉山主峰→玉山北峰
//   - Place labels with small triangle glyph + altitude
//   - Subtle compass + scale bar in bottom corners

const TopoPreviewCard = () => (
  <div style={{
    width: '100%', height: 200, borderRadius: 12, overflow: 'hidden',
    border: `1px solid ${GP_OUTLINE}`,
    background: 'linear-gradient(180deg, #14171a 0%, #0f1113 100%)',
    position: 'relative', fontFamily: GP_FONT,
  }}>
    <svg width="100%" height="100%" viewBox="0 0 343 200" preserveAspectRatio="none"
         style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="gp-trail-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* very faint grid */}
      {[40, 80, 120, 160, 200, 240, 280, 320].map(x => (
        <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="200"
              stroke={GP_FG} strokeWidth=".4" opacity=".05" />
      ))}
      {[40, 80, 120, 160].map(y => (
        <line key={`h-${y}`} x1="0" y1={y} x2="343" y2={y}
              stroke={GP_FG} strokeWidth=".4" opacity=".05" />
      ))}

      {/* Contour cluster A — 玉山主峰 (right) */}
      {[64, 50, 38, 28, 20, 13, 7].map((r, i) => (
        <ellipse key={`a-${i}`} cx="240" cy="80" rx={r * 1.3} ry={r * 0.85}
          stroke={GP_FG} strokeWidth=".4" fill="none"
          opacity={0.10 + i * 0.025}
          transform="rotate(-12 240 80)" />
      ))}
      {/* Contour cluster B — 玉山北峰 (upper-left) */}
      {[48, 36, 26, 18, 11, 5].map((r, i) => (
        <ellipse key={`b-${i}`} cx="100" cy="55" rx={r * 1.4} ry={r * 0.95}
          stroke={GP_FG} strokeWidth=".4" fill="none"
          opacity={0.09 + i * 0.022}
          transform="rotate(20 100 55)" />
      ))}
      {/* Contour cluster C — 排雲山莊 (lower-left) */}
      {[34, 24, 16, 9].map((r, i) => (
        <ellipse key={`c-${i}`} cx="60" cy="160" rx={r * 1.3} ry={r * 0.85}
          stroke={GP_FG} strokeWidth=".4" fill="none"
          opacity={0.07 + i * 0.02} />
      ))}

      {/* Trail glow */}
      <path
        d="M60 160 Q 88 130, 110 122 T 140 100 Q 160 92, 175 90 T 220 75 T 245 70"
        stroke={GP_MINT} strokeWidth="6" fill="none" strokeLinecap="round"
        opacity=".25" filter="url(#gp-trail-glow)"
      />
      {/* Trail (排雲山莊 -> 玉山主峰) */}
      <path
        d="M60 160 Q 88 130, 110 122 T 140 100 Q 160 92, 175 90 T 220 75 T 245 70"
        stroke={GP_MINT} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Spur (玉山主峰 -> 玉山北峰) */}
      <path
        d="M245 70 Q 220 60, 195 55 T 130 50"
        stroke={GP_MINT} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"
        opacity=".85" strokeDasharray="0"
      />

      {/* start: 排雲山莊 hollow dot */}
      <circle cx="60" cy="160" r="5" fill={GP_BG} stroke={GP_MINT} strokeWidth="2" />
      {/* main summit: filled */}
      <circle cx="245" cy="70" r="6" fill={GP_MINT} />
      {/* north peak: smaller filled */}
      <circle cx="130" cy="50" r="4.5" fill={GP_MINT} />
    </svg>

    {/* Place labels (rendered as HTML so kerning is correct) */}
    {/* 玉山主峰 — anchor at (245,70), label offset upper-right */}
    <div style={{
      position: 'absolute', left: 'calc(245px + 10px)', top: 'calc(70px - 26px)',
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, color: GP_FG,
      textShadow: '0 1px 2px rgba(0,0,0,.7)',
      letterSpacing: '.02em', whiteSpace: 'nowrap',
    }}>
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
        <path d="M6 1L11 11H1L6 1Z" fill={GP_MINT} />
      </svg>
      <span>玉山主峰</span>
      <span style={{ color: GP_FG2, fontWeight: 500 }}>3,952m</span>
    </div>
    {/* 玉山北峰 — left-of-anchor */}
    <div style={{
      position: 'absolute', left: 'calc(130px - 92px)', top: 'calc(50px - 8px)',
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, color: GP_FG,
      textShadow: '0 1px 2px rgba(0,0,0,.7)',
      letterSpacing: '.02em', whiteSpace: 'nowrap',
      opacity: .92,
    }}>
      <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
        <path d="M6 1L11 11H1L6 1Z" fill={GP_FG} opacity=".75" />
      </svg>
      <span>玉山北峰</span>
      <span style={{ color: GP_FG2, fontWeight: 500 }}>3,858m</span>
    </div>
    {/* 排雲山莊 — right-of-anchor */}
    <div style={{
      position: 'absolute', left: 'calc(60px + 12px)', top: 'calc(160px - 6px)',
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, color: GP_FG,
      textShadow: '0 1px 2px rgba(0,0,0,.7)',
      letterSpacing: '.02em', whiteSpace: 'nowrap',
      opacity: .9,
    }}>
      <svg width="7" height="7" viewBox="0 0 12 12" fill="none">
        <rect x="2" y="3" width="8" height="7" stroke={GP_FG2} strokeWidth="1.2" fill="none" />
        <path d="M2 5l4-2 4 2" stroke={GP_FG2} strokeWidth="1.2" fill="none" />
      </svg>
      <span>排雲山莊</span>
      <span style={{ color: GP_FG2, fontWeight: 500 }}>3,402m</span>
    </div>

    {/* corner: file source chip */}
    <div style={{
      position: 'absolute', top: 10, left: 12,
      padding: '3px 8px', borderRadius: 4,
      background: 'rgba(15,17,19,.7)', backdropFilter: 'blur(6px)',
      border: `1px solid ${GP_OUTLINE}`,
      fontSize: 10, fontWeight: 600, color: GP_FG2,
      letterSpacing: '.06em', fontFamily: GP_FONT,
    }}>
      GPX · 玉山-2026-04-28.gpx
    </div>

    {/* compass */}
    <div style={{
      position: 'absolute', top: 10, right: 12,
      width: 22, height: 22, borderRadius: '50%',
      border: `1px solid ${GP_FG2}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, color: GP_FG, fontWeight: 700,
      background: 'rgba(15,17,19,.5)', backdropFilter: 'blur(4px)',
    }}>
      N
    </div>

    {/* scale bar */}
    <div style={{
      position: 'absolute', bottom: 10, right: 12,
      display: 'flex', alignItems: 'center', gap: 6,
      fontFamily: GP_FONT,
    }}>
      <svg width="60" height="6" viewBox="0 0 60 6">
        <line x1="0" y1="3" x2="60" y2="3" stroke={GP_FG2} strokeWidth=".8" />
        <line x1="0" y1="0" x2="0" y2="6" stroke={GP_FG2} strokeWidth=".8" />
        <line x1="30" y1="0" x2="30" y2="6" stroke={GP_FG2} strokeWidth=".8" />
        <line x1="60" y1="0" x2="60" y2="6" stroke={GP_FG2} strokeWidth=".8" />
      </svg>
      <span style={{ fontSize: 9, color: GP_FG2, letterSpacing: '.04em' }}>2 km</span>
    </div>
  </div>
);

// ─────────────────────────────────────────
// Field-row primitives (parallel to SR file)
// ─────────────────────────────────────────

const DragHandle = () => (
  <svg width="14" height="20" viewBox="0 0 14 20" fill="none" style={{ flexShrink: 0 }}>
    {[0, 1].map(col => (
      [0, 1, 2].map(row => (
        <circle key={`${col}-${row}`} cx={3 + col * 8} cy={4 + row * 6} r="1.5" fill={GP_FG2} opacity=".5" />
      ))
    ))}
  </svg>
);

const EditPencil = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M14.7 4.3l5 5L8.5 20.5 3 22l1.5-5.5L14.7 4.3z"
      stroke={GP_FG2} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="9" rx="1.6" stroke={GP_FG2} strokeWidth="1.7" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={GP_FG2} strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const Toggle = ({ on }) => (
  <span style={{
    width: 38, height: 22, borderRadius: 999,
    background: on ? GP_MINT : '#3a3f44',
    position: 'relative', flexShrink: 0,
  }}>
    <span style={{
      position: 'absolute', top: 2, left: on ? 18 : 2,
      width: 18, height: 18, borderRadius: '50%',
      background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
    }} />
  </span>
);

const FieldRow = ({ label, value, locked, on, autoMatched, last, children }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 4px', minHeight: 56,
    borderBottom: last ? 'none' : `1px solid ${GP_BG}`,
    fontFamily: GP_FONT,
  }}>
    <div style={{ paddingTop: 4 }}>
      <DragHandle />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 14, color: GP_FG2, flexShrink: 0, minWidth: 80 }}>{label}</span>
        <span style={{
          fontSize: 16, fontWeight: 600, color: GP_FG,
          flex: 1, fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value}
          {autoMatched && (
            <span style={{
              marginLeft: 8, fontSize: 11, color: GP_MINT, fontWeight: 500,
              padding: '2px 6px', borderRadius: 4, background: 'rgba(126,240,180,.12)',
              verticalAlign: 'middle', whiteSpace: 'nowrap',
            }}>
              自动匹配
            </span>
          )}
        </span>
      </div>
      {children}
    </div>
    <button style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
    }}>
      <EditPencil />
    </button>
    <div style={{
      width: 38, display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
      height: 28, flexShrink: 0,
    }}>
      {locked ? <LockIcon /> : <Toggle on={on} />}
    </div>
  </div>
);

// Helper text-button link
const TextLink = ({ children }) => (
  <button style={{
    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
    fontSize: 12, color: GP_FG2, fontWeight: 500, fontFamily: GP_FONT,
  }}>
    {children}
  </button>
);

// Source label preview pill
const SourceLabelUpload = () => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 10px', borderRadius: 4,
    background: 'rgba(156,163,175,.15)', color: GP_FG2,
    fontSize: 12, fontWeight: 600, letterSpacing: '.02em',
    fontFamily: GP_FONT, whiteSpace: 'nowrap', lineHeight: 1.2,
  }}>
    上传数据
  </span>
);

// ─────────────────────────────────────────
// Screen
// ─────────────────────────────────────────

const GpxImportConfirmScreen = ({ onBack }) => (
  <div style={{
    width: '100%', height: '100%', background: GP_BG, color: GP_FG,
    fontFamily: GP_FONT, display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <GPStatusBar />
    <GPNavBar title="确认导入数据" onBack={onBack} />

    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '8px 16px 0',
    }}>
      <TopoPreviewCard />

      {/* Section header */}
      <div style={{
        marginTop: 22, marginBottom: 6,
        fontSize: 16, fontWeight: 600, color: GP_FG,
      }}>
        导入数据
      </div>

      {/* Field list — all populated */}
      <div>
        <FieldRow label="海拔"   value="3,952 m"    locked />
        <FieldRow label="总距离" value="12.8 km"    locked />
        <FieldRow label="时长"   value="06:42"      on />
        <FieldRow label="爬升"   value="1,350 m"    on />
        <FieldRow label="日期"   value="2026.04.28" on />
        <FieldRow
          label="山峰匹配"
          value="玉山主峰"
          autoMatched
          on
          last
        >
          <div style={{
            marginLeft: 92, marginTop: 6,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <TextLink>修改匹配</TextLink>
            <span style={{ width: 1, height: 10, background: GP_OUTLINE }} />
            <TextLink>不关联山峰</TextLink>
          </div>
        </FieldRow>
      </div>

      {/* Source label preview */}
      <div style={{
        marginTop: 18,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', borderRadius: 10,
        background: GP_SURFACE, border: `1px solid ${GP_OUTLINE}`,
      }}>
        <span style={{ fontSize: 13, color: GP_FG2, fontFamily: GP_FONT }}>
          来源标签
        </span>
        <SourceLabelUpload />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: GP_FG2, fontFamily: GP_FONT, lineHeight: 1.4 }}>
          导入数据将以"上传数据"标识展示
        </span>
      </div>

      <div style={{ height: 20 }} />
    </div>

    {/* Sticky bottom */}
    <div style={{
      padding: '12px 16px 24px',
      background: GP_BG,
      borderTop: `1px solid ${GP_BG}`,
    }}>
      <button style={{
        width: '100%', height: 52, borderRadius: 12, border: 'none',
        background: GP_MINT, color: '#0f1113',
        fontSize: 16, fontWeight: 700, cursor: 'pointer',
        fontFamily: GP_FONT,
      }}>
        确认并生成活动
      </button>
      <div style={{
        marginTop: 10, textAlign: 'center',
        fontSize: 12, color: GP_FG2, lineHeight: 1.5,
      }}>
        确认后将生成活动记录，可随时在分享编辑器中调整
      </div>
    </div>
  </div>
);

window.GpxImportConfirmScreen = GpxImportConfirmScreen;
