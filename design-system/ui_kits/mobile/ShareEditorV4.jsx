// Peak Trekker — Share Editor v4 (locked design system)
// Above-the-fold view: nav + hero preview + tab + thumbs + control-row peek.
//
// Locked palette: dark #0f1113, surface #1a1d21, outline #2a2f34,
//                 fg #ffffff, fg2 #9ca3af, mint #7ef0b4
// No chrome on data values; mint scarce.

const SE_BG = '#0f1113';
const SE_SURFACE = '#1a1d21';
const SE_OUTLINE = '#2a2f34';
const SE_FG = '#ffffff';
const SE_FG2 = '#9ca3af';
const SE_MINT = '#7ef0b4';
const SE_FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif";

// ─────────────────────────────────────────
// Chrome
// ─────────────────────────────────────────

const SEStatusBar = () => (
  <div style={{
    height: 44, padding: '0 22px', display: 'flex',
    alignItems: 'flex-end', justifyContent: 'space-between',
    fontSize: 14, fontWeight: 600, color: SE_FG, fontFamily: SE_FONT, paddingBottom: 8,
  }}>
    <span>9:41</span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[3,5,7,9].map(h => <span key={h} style={{ width: 3, height: h, background: SE_FG, borderRadius: 1 }} />)}
      </span>
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
        <path d="M8 3.5a6 6 0 0 1 4.2 1.7l1.4-1.4A8 8 0 0 0 8 1.5a8 8 0 0 0-5.6 2.3l1.4 1.4A6 6 0 0 1 8 3.5z" fill={SE_FG}/>
        <path d="M8 6.5a3 3 0 0 1 2.1.9l1.4-1.4A5 5 0 0 0 8 4.5a5 5 0 0 0-3.5 1.5l1.4 1.4A3 3 0 0 1 8 6.5z" fill={SE_FG}/>
        <circle cx="8" cy="9" r="1.4" fill={SE_FG}/>
      </svg>
      <span style={{
        width: 22, height: 11, border: `1px solid ${SE_FG}`, borderRadius: 2.5,
        position: 'relative', opacity: .9,
      }}>
        <span style={{ position: 'absolute', inset: 1.5, width: '78%', background: SE_FG, borderRadius: 1 }} />
      </span>
    </span>
  </div>
);

const SENavBar = ({ onBack, onPreview }) => (
  <div style={{
    height: 44, display: 'flex', alignItems: 'center',
    padding: '0 8px 0 8px', position: 'relative',
    fontFamily: SE_FONT,
  }}>
    <button onClick={onBack} style={{
      width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M15 6l-6 6 6 6" stroke={SE_FG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
    <div style={{
      position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
      fontSize: 16, fontWeight: 600, color: SE_FG,
    }}>
      分享编辑器
    </div>
    <div style={{ flex: 1 }} />
    <button onClick={onPreview} style={{
      padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
      color: SE_MINT, fontSize: 15, fontWeight: 600, fontFamily: SE_FONT,
    }}>
      预览
    </button>
  </div>
);

// ─────────────────────────────────────────
// Topographic background — quiet contour lines
// ─────────────────────────────────────────

const TopoBackground = ({ opacity = .5 }) => (
  <svg
    width="100%" height="100%" viewBox="0 0 280 498" fill="none" preserveAspectRatio="xMidYMid slice"
    style={{ position: 'absolute', inset: 0, opacity }}
  >
    {/* nested elliptical contours suggesting a mountain dome */}
    {[
      { rx: 130, ry: 90,  cx: 140, cy: 240, op: .12 },
      { rx: 110, ry: 78,  cx: 142, cy: 240, op: .14 },
      { rx: 92,  ry: 68,  cx: 144, cy: 238, op: .16 },
      { rx: 76,  ry: 58,  cx: 146, cy: 234, op: .18 },
      { rx: 60,  ry: 48,  cx: 148, cy: 230, op: .20 },
      { rx: 44,  ry: 36,  cx: 150, cy: 226, op: .22 },
      { rx: 28,  ry: 24,  cx: 152, cy: 222, op: .26 },
    ].map((c, i) => (
      <ellipse key={i} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry}
        stroke={SE_FG} strokeWidth=".7" fill="none" opacity={c.op} />
    ))}
    {/* a few stray ridges */}
    <path d="M0 360 Q 60 340, 110 348 T 280 320" stroke={SE_FG} strokeWidth=".7" fill="none" opacity=".10" />
    <path d="M0 400 Q 70 388, 140 392 T 280 374" stroke={SE_FG} strokeWidth=".7" fill="none" opacity=".08" />
    <path d="M0 440 Q 80 430, 160 432 T 280 420" stroke={SE_FG} strokeWidth=".7" fill="none" opacity=".06" />
  </svg>
);

// Trail polyline + glow
const TrailPath = ({ stroke = 3 }) => (
  <svg
    width="100%" height="100%" viewBox="0 0 280 498" fill="none" preserveAspectRatio="none"
    style={{ position: 'absolute', inset: 0 }}
  >
    <defs>
      <filter id="se-trail-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3.5" />
      </filter>
    </defs>
    <path
      d="M30 380 Q 70 320, 110 330 T 175 240 Q 210 200, 240 200 T 260 130"
      stroke={SE_MINT} strokeWidth={stroke * 2.2} fill="none" strokeLinecap="round"
      opacity=".22" filter="url(#se-trail-glow)"
    />
    <path
      d="M30 380 Q 70 320, 110 330 T 175 240 Q 210 200, 240 200 T 260 130"
      stroke={SE_MINT} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"
    />
    <circle cx="30" cy="380" r="5" fill={SE_BG} stroke={SE_MINT} strokeWidth="2" />
    <circle cx="260" cy="130" r="5" fill={SE_MINT} />
  </svg>
);

// Brand footer (pill style — logo + name + source pill)
const BrandFooter = ({ source = '记录于 玉山主峰' }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    fontFamily: SE_FONT,
  }}>
    {/* mountain glyph */}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 19l5-9 4 6 3-4 6 7" stroke={SE_MINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <span style={{ fontSize: 12, fontWeight: 600, color: SE_FG, letterSpacing: '.02em' }}>Peak Trekker</span>
    <span style={{ width: 3, height: 3, borderRadius: 999, background: SE_FG2, opacity: .6 }} />
    <span style={{
      padding: '4px 9px', borderRadius: 999, border: `1px solid ${SE_OUTLINE}`,
      fontSize: 11, color: SE_FG2,
    }}>
      {source}
    </span>
  </div>
);

// ─────────────────────────────────────────
// Hero template preview — Base Classic
// ─────────────────────────────────────────

const HeroTemplate = ({ height }) => {
  const w = Math.round(height * (9 / 16)); // 9:16 aspect
  return (
    <div style={{
      width: w, height,
      borderRadius: 12, overflow: 'hidden',
      background: 'linear-gradient(180deg, #14171a 0%, #0f1113 100%)',
      border: `1px solid ${SE_OUTLINE}`,
      position: 'relative', flexShrink: 0,
    }}>
      <TopoBackground opacity={.55} />
      <TrailPath stroke={2.4} />

      {/* Hero altitude — top center */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '14%', textAlign: 'center',
        fontFamily: SE_FONT, color: SE_FG,
      }}>
        <div style={{
          fontSize: 11, color: SE_FG2, letterSpacing: '.18em',
          fontWeight: 500, marginBottom: 6,
        }}>
          ALTITUDE
        </div>
        <div style={{
          fontSize: 56, lineHeight: 1, fontWeight: 700, letterSpacing: '-.02em',
          color: SE_MINT, fontVariantNumeric: 'tabular-nums',
        }}>
          3,952<span style={{ fontSize: 22, fontWeight: 600, marginLeft: 3, color: SE_MINT }}>m</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: SE_FG, fontWeight: 600, letterSpacing: '.02em' }}>
          玉山主峰
        </div>
      </div>

      {/* Secondary data row — bottom area */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 56,
        padding: '0 22px',
        display: 'flex', justifyContent: 'space-between',
        fontFamily: SE_FONT, color: SE_FG,
      }}>
        {[
          { label: 'DISTANCE', value: '12.8', unit: 'km' },
          { label: 'GAIN',     value: '1,350', unit: 'm' },
          { label: 'TIME',     value: '6:42',  unit: '' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 9, color: SE_FG2, letterSpacing: '.16em', fontWeight: 500, marginBottom: 4,
            }}>
              {s.label}
            </div>
            <div style={{
              fontSize: 18, fontWeight: 700, color: SE_FG,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em',
            }}>
              {s.value}
              {s.unit && <span style={{ fontSize: 10, color: SE_FG2, fontWeight: 500, marginLeft: 2 }}>{s.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Brand footer */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
        <BrandFooter />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// Thumbnail (compact)
// ─────────────────────────────────────────

// Each thumb is a stripped-down preview: only mountain name + altitude + brand glyph.
// Variants vary visual treatment slightly so the row reads as different templates.
const TemplateThumb = ({ selected, variant = 'classic', name = '玉山主峰', alt = '3,952', accent = SE_MINT }) => {
  const w = 80, h = 120;
  const bg = variant === 'photo'
    ? 'linear-gradient(180deg, #1f2227 0%, #0f1113 100%)'
    : variant === 'minimal'
      ? '#0f1113'
      : 'linear-gradient(180deg, #14171a 0%, #0f1113 100%)';
  return (
    <div style={{
      width: w, height: h, borderRadius: 8, overflow: 'hidden',
      flexShrink: 0,
      background: bg,
      border: selected ? `2px solid ${SE_MINT}` : `1px solid ${SE_OUTLINE}`,
      position: 'relative',
      boxShadow: selected ? `0 0 0 4px rgba(126,240,180,.12)` : 'none',
      transition: 'border 200ms, box-shadow 200ms',
      fontFamily: SE_FONT,
    }}>
      {/* faint topo */}
      {variant !== 'minimal' && (
        <svg width="100%" height="100%" viewBox="0 0 80 120" preserveAspectRatio="xMidYMid slice"
             style={{ position: 'absolute', inset: 0, opacity: variant === 'photo' ? .35 : .25 }}>
          <ellipse cx="42" cy="58" rx="34" ry="22" stroke={SE_FG} strokeWidth=".4" fill="none" opacity=".5" />
          <ellipse cx="44" cy="56" rx="26" ry="18" stroke={SE_FG} strokeWidth=".4" fill="none" opacity=".5" />
          <ellipse cx="46" cy="54" rx="18" ry="14" stroke={SE_FG} strokeWidth=".4" fill="none" opacity=".5" />
          <ellipse cx="48" cy="50" rx="10" ry="8"  stroke={SE_FG} strokeWidth=".4" fill="none" opacity=".5" />
        </svg>
      )}
      {/* trail (only some variants) */}
      {variant !== 'minimal' && (
        <svg width="100%" height="100%" viewBox="0 0 80 120" preserveAspectRatio="none"
             style={{ position: 'absolute', inset: 0 }}>
          <path d="M10 92 Q 24 72, 36 76 T 60 50 T 72 30"
            stroke={accent} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      )}
      {/* altitude — centered top half */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 24, textAlign: 'center',
      }}>
        <div style={{
          fontSize: 16, fontWeight: 700, color: accent,
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em',
        }}>
          {alt}<span style={{ fontSize: 9, marginLeft: 1 }}>m</span>
        </div>
      </div>
      {/* mountain name */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 50, textAlign: 'center',
        fontSize: 8, color: SE_FG, fontWeight: 600, opacity: .9,
      }}>
        {name}
      </div>
      {/* brand glyph at bottom */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
      }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
          <path d="M3 19l5-9 4 6 3-4 6 7" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 7, fontWeight: 700, color: SE_FG, letterSpacing: '.04em' }}>PEAK TREKKER</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// Tab + thumbnail row + control-row peek
// ─────────────────────────────────────────

const TabBar = ({ active = 'basic', onChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 24,
    padding: '12px 20px 0',
    fontFamily: SE_FONT,
  }}>
    {[
      { id: 'basic',    label: '基础' },
      { id: 'advanced', label: '高级' },
    ].map(t => {
      const on = active === t.id;
      return (
        <button key={t.id} onClick={() => onChange?.(t.id)} style={{
          background: 'transparent', border: 'none', padding: '6px 0', cursor: 'pointer',
          fontSize: 15, fontWeight: 600, color: on ? SE_FG : SE_FG2,
          fontFamily: SE_FONT,
          position: 'relative',
        }}>
          {t.label}
          {on && <span style={{
            position: 'absolute', left: 0, right: 0, bottom: -2,
            height: 2, background: SE_MINT, borderRadius: 2,
          }} />}
        </button>
      );
    })}
  </div>
);

const ThumbRow = () => (
  <div style={{
    overflowX: 'auto',
    padding: '12px 20px 0',
    display: 'flex', gap: 12,
    scrollbarWidth: 'none',
  }}>
    <TemplateThumb selected variant="classic"  name="玉山主峰" alt="3,952" />
    <TemplateThumb            variant="minimal" name="玉山主峰" alt="3,952" />
    <TemplateThumb            variant="photo"   name="玉山主峰" alt="3,952" />
    <TemplateThumb            variant="classic" name="玉山主峰" alt="3,952" accent="#a8b3bd" />
    {/* hint of a 5th, half-visible by overflow */}
    <TemplateThumb            variant="classic" name="玉山主峰" alt="3,952" />
  </div>
);

// Just the very TOPS of the control icons peeking from the bottom
const ControlRowPeek = () => (
  <div style={{
    height: 22, padding: '0 20px',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    overflow: 'hidden',
  }}>
    {/* camera icon — only top edge shows */}
    <div style={{ width: 44, display: 'flex', justifyContent: 'center' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
        <rect x="3" y="6.5" width="18" height="13" rx="2.2" stroke={SE_FG} strokeWidth="1.7" />
        <circle cx="12" cy="13" r="3.5" stroke={SE_FG} strokeWidth="1.7" />
        <path d="M8 6.5l1.5-2h5L16 6.5" stroke={SE_FG} strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    </div>
    {/* center: faint dots, suggesting toggle/field controls */}
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 22 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{ width: 24, height: 8, borderRadius: 999, background: SE_OUTLINE }} />
      ))}
    </div>
    {/* trash icon */}
    <div style={{ width: 44, display: 'flex', justifyContent: 'center' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
        <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"
              stroke={SE_FG} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  </div>
);

// ─────────────────────────────────────────
// Composed screen
// ─────────────────────────────────────────

const ShareEditorV4 = ({ onBack, onPreview }) => {
  // Hero preview height ≈ 47% of 812 = 382px (≈ 215px wide at 9:16).
  // This is intentionally generous — preview is the hero.
  const heroHeight = 382;
  return (
    <div style={{
      width: '100%', height: '100%', background: SE_BG, color: SE_FG,
      fontFamily: SE_FONT, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <SEStatusBar />
      <SENavBar onBack={onBack} onPreview={onPreview} />

      {/* Hero preview — centered, generous */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '8px 20px 0',
      }}>
        <HeroTemplate height={heroHeight} />
      </div>

      {/* Tabs */}
      <TabBar active="basic" />
      {/* Hairline under the tabs spanning the full width */}
      <div style={{ height: 1, background: SE_OUTLINE, opacity: .8, margin: '0 0 0 0' }} />

      {/* Thumbnail row */}
      <ThumbRow />

      {/* Spacer pushes peek to the very bottom */}
      <div style={{ flex: 1 }} />

      {/* Control row peek — top ~22px shows */}
      <ControlRowPeek />
    </div>
  );
};

// ─────────────────────────────────────────
// Bottom-half view (scrolled-down state)
// ─────────────────────────────────────────

// Compact icon button — 36×36, dark surface, 1px border
const SECircleBtn = ({ children, onClick, ariaLabel }) => (
  <button onClick={onClick} aria-label={ariaLabel} style={{
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    background: SE_SURFACE, border: `1px solid ${SE_OUTLINE}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: 0,
  }}>
    {children}
  </button>
);

// Inline mini-toggle (label + switch)
const InlineToggle = ({ label, on }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 8,
    height: 36, padding: '0 12px', borderRadius: 10,
    background: SE_SURFACE, border: `1px solid ${SE_OUTLINE}`,
    flexShrink: 0,
    fontFamily: SE_FONT,
  }}>
    <span style={{ fontSize: 13, color: SE_FG, fontWeight: 500 }}>{label}</span>
    <span style={{
      width: 32, height: 18, borderRadius: 999,
      background: on ? SE_MINT : '#3a3f44',
      position: 'relative', transition: 'background 200ms',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2,
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.3)', transition: 'left 200ms',
      }} />
    </span>
  </div>
);

// Outlined-mint button — used in the control row for 导出透明水印
const SEOutlineMintButton = ({ children, icon, onClick }) => (
  <button onClick={onClick} style={{
    height: 36, borderRadius: 10, padding: '0 12px',
    background: 'transparent', border: `1.5px solid ${SE_MINT}`,
    color: SE_MINT, fontSize: 13, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    cursor: 'pointer', flexShrink: 0, fontFamily: SE_FONT,
    whiteSpace: 'nowrap',
  }}>
    {icon}
    {children}
  </button>
);

// Compact control row
const ControlRow = () => (
  <div style={{
    padding: '14px 20px 0',
    display: 'flex', alignItems: 'center', gap: 10,
    overflowX: 'auto', scrollbarWidth: 'none',
  }}>
    <SECircleBtn ariaLabel="更换照片">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6.5" width="18" height="13" rx="2.2" stroke={SE_FG} strokeWidth="1.7" />
        <circle cx="12" cy="13" r="3.5" stroke={SE_FG} strokeWidth="1.7" />
        <path d="M8 6.5l1.5-2h5L16 6.5" stroke={SE_FG} strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    </SECircleBtn>
    <SECircleBtn ariaLabel="移除照片">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"
              stroke={SE_FG} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </SECircleBtn>
    <InlineToggle label="地图" on />
    <SEOutlineMintButton
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" stroke={SE_MINT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      导出透明水印
    </SEOutlineMintButton>
  </div>
);

// ─────────────────────────────────────────
// Field rows for the editor (reuses screenshot pattern, mirrored locally)
// ─────────────────────────────────────────

const SEDragHandle = () => (
  <svg width="14" height="20" viewBox="0 0 14 20" fill="none" style={{ flexShrink: 0 }}>
    {[0, 1].map(col => (
      [0, 1, 2].map(row => (
        <circle key={`${col}-${row}`} cx={3 + col * 8} cy={4 + row * 6} r="1.5" fill={SE_FG2} opacity=".5" />
      ))
    ))}
  </svg>
);

const SEEditPencil = ({ highlighted }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M14.7 4.3l5 5L8.5 20.5 3 22l1.5-5.5L14.7 4.3z"
      stroke={highlighted ? SE_MINT : SE_FG2}
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </svg>
);

const SELockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="9" rx="1.6" stroke={SE_FG2} strokeWidth="1.7" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={SE_FG2} strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const SEToggle = ({ on }) => (
  <span style={{
    width: 38, height: 22, borderRadius: 999,
    background: on ? SE_MINT : '#3a3f44',
    position: 'relative', flexShrink: 0,
    transition: 'background 200ms',
  }}>
    <span style={{
      position: 'absolute', top: 2, left: on ? 18 : 2,
      width: 18, height: 18, borderRadius: '50%', background: '#ffffff',
      transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
    }} />
  </span>
);

const SEFieldRow = ({ label, value, locked, on, missing, last }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 4px', minHeight: 56,
    borderBottom: last ? 'none' : `1px solid ${SE_BG}`,
    fontFamily: SE_FONT,
  }}>
    <SEDragHandle />
    <span style={{ fontSize: 14, color: SE_FG2, flexShrink: 0, minWidth: 80 }}>
      {label}
    </span>
    <span style={{
      flex: 1, fontSize: 16, fontWeight: 600,
      color: missing ? SE_FG2 : SE_FG,
      fontVariantNumeric: 'tabular-nums',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {missing ? '—' : value}
    </span>
    <button style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
    }}>
      <SEEditPencil />
    </button>
    <div style={{ width: 38, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', height: 28, flexShrink: 0 }}>
      {locked ? <SELockIcon /> : <SEToggle on={on} />}
    </div>
  </div>
);

// Section header with right-side hint
const FieldSectionHeader = () => (
  <div style={{
    padding: '24px 20px 4px',
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    fontFamily: SE_FONT,
  }}>
    <span style={{ fontSize: 16, fontWeight: 600, color: SE_FG }}>自定义展示字段</span>
    <span style={{ fontSize: 12, color: SE_FG2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      必填项已锁定
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="11" width="14" height="9" rx="1.6" stroke={SE_FG2} strokeWidth="1.7" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={SE_FG2} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
  </div>
);

// ─────────────────────────────────────────
// Sticky action bar
// ─────────────────────────────────────────

const ActionBar = () => (
  <div style={{
    padding: '12px 16px 24px',
    background: SE_BG,
    borderTop: `1px solid ${SE_OUTLINE}`,
    display: 'flex', gap: 8, alignItems: 'center',
    fontFamily: SE_FONT,
  }}>
    {/* Save (outlined mint) */}
    <button style={{
      flex: '0 0 30%', height: 50, borderRadius: 12,
      background: 'transparent', border: `1.5px solid ${SE_MINT}`,
      color: SE_MINT, fontSize: 15, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      cursor: 'pointer', fontFamily: SE_FONT,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" stroke={SE_MINT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      保存
    </button>
    {/* Share (primary mint) */}
    <button style={{
      flex: '1 1 50%', height: 50, borderRadius: 12,
      background: SE_MINT, border: 'none', color: '#0f1113',
      fontSize: 16, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      cursor: 'pointer', fontFamily: SE_FONT,
    }}>
      分享
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M7 17L17 7M9 7h8v8" stroke="#0f1113" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    {/* More (subtle) */}
    <button aria-label="更多" style={{
      flex: '0 0 18%', height: 50, borderRadius: 12,
      background: SE_SURFACE, border: `1px solid ${SE_OUTLINE}`,
      color: SE_FG2, fontSize: 18,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', fontFamily: SE_FONT,
    }}>
      <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
        {[0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: SE_FG2 }} />)}
      </span>
    </button>
  </div>
);

// ─────────────────────────────────────────
// Composed bottom-half screen
// ─────────────────────────────────────────

const ShareEditorV4Bottom = ({ onBack }) => (
  <div style={{
    width: '100%', height: '100%', background: SE_BG, color: SE_FG,
    fontFamily: SE_FONT, display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    {/* Top: bottom edge of thumb row showing scroll continuity */}
    <div style={{
      padding: '16px 20px 0',
      display: 'flex', gap: 12, overflow: 'hidden',
      // mask the row so we see only the bottom ~28px — gives "you scrolled down from thumbs above" cue
      height: 28,
    }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{
          width: 80, height: 120, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(180deg, #14171a 0%, #0f1113 100%)',
          border: i === 0 ? `2px solid ${SE_MINT}` : `1px solid ${SE_OUTLINE}`,
          marginTop: -92, // pull up so only bottom edge shows
          opacity: .85,
        }} />
      ))}
    </div>

    {/* Compact control row */}
    <ControlRow />

    {/* Section header */}
    <FieldSectionHeader />

    {/* Field list */}
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '0 20px',
    }}>
      <SEFieldRow label="海拔"   value="3,952 m"    locked />
      <SEFieldRow label="总距离" value="12.8 km"    locked />
      <SEFieldRow label="时长"   value="06:42"      on />
      <SEFieldRow label="爬升"   value="1,350 m"    on />
      <SEFieldRow label="日期"   value="2026.04.28" on />
      <SEFieldRow label="地点"   value="台湾"       on />
      <SEFieldRow label="配速"   missing />
      <SEFieldRow label="山峰名" value="玉山主峰"   on last />
      <div style={{ height: 12 }} />
    </div>

    {/* Sticky action bar */}
    <ActionBar />
  </div>
);

// ─────────────────────────────────────────
// Advanced template states (monetization)
// ─────────────────────────────────────────

// "Advanced" thumbnail variants — slightly more visual variety than basic.
// Names cycle through a pool so each thumb reads as a distinct template.
const ADV_VARIANTS = [
  { id: 'photo-overlay', kind: 'photo-overlay', accent: SE_MINT },
  { id: 'topo-poster',   kind: 'topo-poster',   accent: SE_MINT },
  { id: 'minimal-grid',  kind: 'minimal-grid',  accent: '#a8b3bd' },
  { id: 'sunset',        kind: 'photo-overlay', accent: '#f0a87e' },
  { id: 'horizon',       kind: 'topo-poster',   accent: '#7ed7f0' },
];

// Slightly richer thumbnail body to reflect "advanced" templates visually.
const AdvThumbBody = ({ kind, accent }) => {
  if (kind === 'photo-overlay') {
    return (
      <>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, #2d3338 0%, #14171a 60%, #0f1113 100%)',
        }} />
        {/* faint horizon */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '52%', height: 1, background: 'rgba(255,255,255,.18)',
        }} />
        {/* faint silhouette ridge */}
        <svg width="100%" height="100%" viewBox="0 0 80 120" preserveAspectRatio="none"
             style={{ position: 'absolute', inset: 0 }}>
          <path d="M0 80 L18 60 L32 70 L48 50 L62 64 L80 48 L80 120 L0 120 Z"
                fill="rgba(0,0,0,.55)" />
        </svg>
      </>
    );
  }
  if (kind === 'minimal-grid') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#0f1113' }}>
        <svg width="100%" height="100%" viewBox="0 0 80 120" preserveAspectRatio="none">
          {[20, 40, 60, 80, 100].map(y => (
            <line key={y} x1="0" y1={y} x2="80" y2={y} stroke={SE_OUTLINE} strokeWidth=".5" />
          ))}
        </svg>
      </div>
    );
  }
  // topo-poster
  return (
    <>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #14171a 0%, #0f1113 100%)',
      }} />
      <svg width="100%" height="100%" viewBox="0 0 80 120" preserveAspectRatio="xMidYMid slice"
           style={{ position: 'absolute', inset: 0, opacity: .55 }}>
        {[
          { rx: 36, ry: 24 }, { rx: 28, ry: 20 }, { rx: 22, ry: 16 }, { rx: 14, ry: 12 }, { rx: 8, ry: 6 },
        ].map((c, i) => (
          <ellipse key={i} cx="46" cy="58" rx={c.rx} ry={c.ry}
            stroke={SE_FG} strokeWidth=".4" fill="none" opacity=".5" />
        ))}
      </svg>
    </>
  );
};

const AdvThumb = ({ variant, selected, badge }) => {
  const w = 80, h = 120;
  return (
    <div style={{
      width: w, height: h, borderRadius: 8, flexShrink: 0,
      position: 'relative', overflow: 'hidden',
      border: selected ? `2px solid ${SE_MINT}` : `1px solid ${SE_OUTLINE}`,
      boxShadow: selected ? `0 0 0 4px rgba(126,240,180,.12)` : 'none',
      transition: 'border 200ms, box-shadow 200ms',
      background: '#0f1113',
      fontFamily: SE_FONT,
    }}>
      <AdvThumbBody kind={variant.kind} accent={variant.accent} />

      {/* trail */}
      <svg width="100%" height="100%" viewBox="0 0 80 120" preserveAspectRatio="none"
           style={{ position: 'absolute', inset: 0 }}>
        <path d="M10 92 Q 24 72, 36 76 T 60 50 T 72 30"
              stroke={variant.accent} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>

      {/* altitude */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 24, textAlign: 'center' }}>
        <div style={{
          fontSize: 16, fontWeight: 700, color: variant.accent,
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em',
          textShadow: variant.kind === 'photo-overlay' ? '0 1px 2px rgba(0,0,0,.6)' : 'none',
        }}>
          3,952<span style={{ fontSize: 9, marginLeft: 1 }}>m</span>
        </div>
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 50, textAlign: 'center',
        fontSize: 8, color: SE_FG, fontWeight: 600, opacity: .9,
        textShadow: variant.kind === 'photo-overlay' ? '0 1px 2px rgba(0,0,0,.6)' : 'none',
      }}>
        玉山主峰
      </div>

      {/* brand glyph */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
      }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
          <path d="M3 19l5-9 4 6 3-4 6 7" stroke={variant.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 7, fontWeight: 700, color: SE_FG, letterSpacing: '.04em' }}>PEAK TREKKER</span>
      </div>

      {/* Top-right badge — limited-free or lock */}
      {badge === 'free' && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          padding: '2px 7px', borderRadius: 8,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
          fontSize: 10, fontWeight: 600, color: SE_FG, letterSpacing: '.04em',
          fontFamily: SE_FONT,
        }}>
          限免
        </div>
      )}
      {badge === 'lock' && (
        <>
          {/* dim overlay 40% */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(15,17,19,.4)',
            pointerEvents: 'none',
          }} />
          {/* lock icon top-right */}
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 22, height: 22, borderRadius: 7,
            background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="1.6" stroke="rgba(255,255,255,.85)" strokeWidth="1.7" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="rgba(255,255,255,.85)" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
};

// Advanced thumbnail row
const AdvThumbRow = ({ mode = 'free', selectedIndex = 0 }) => (
  <div style={{
    overflowX: 'auto',
    padding: '12px 20px 0',
    display: 'flex', gap: 12,
    scrollbarWidth: 'none',
  }}>
    {ADV_VARIANTS.map((v, i) => (
      <AdvThumb
        key={v.id}
        variant={v}
        selected={i === selectedIndex}
        badge={mode === 'free' ? 'free' : 'lock'}
      />
    ))}
  </div>
);

// Hero advanced template — Photo Overlay style, with optional preview-watermark
// `watermark`: boolean — show diagonal "Peak Trekker 预览版" repeated overlay
const HeroAdvancedTemplate = ({ height, watermark }) => {
  const w = Math.round(height * (9 / 16));
  return (
    <div style={{
      width: w, height,
      borderRadius: 12, overflow: 'hidden',
      background: 'linear-gradient(140deg, #2a3138 0%, #14171a 55%, #0a0c0e 100%)',
      border: `1px solid ${SE_OUTLINE}`,
      position: 'relative', flexShrink: 0,
    }}>
      {/* faint horizon line ~60% */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '60%', height: 1,
        background: 'rgba(255,255,255,.18)',
      }} />
      {/* silhouette ridge */}
      <svg width="100%" height="100%" viewBox="0 0 280 498" preserveAspectRatio="none"
           style={{ position: 'absolute', inset: 0 }}>
        <path d="M0 320 L40 270 L80 295 L130 245 L175 285 L220 240 L260 270 L280 250 L280 498 L0 498 Z"
              fill="rgba(0,0,0,.55)" />
        <path d="M0 360 L60 320 L100 340 L160 295 L220 320 L280 290 L280 498 L0 498 Z"
              fill="rgba(0,0,0,.7)" />
      </svg>
      {/* trail */}
      <TrailPath stroke={2.4} />

      {/* hero altitude */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '14%', textAlign: 'center',
        fontFamily: SE_FONT, color: SE_FG,
      }}>
        <div style={{
          fontSize: 11, color: SE_FG2, letterSpacing: '.18em',
          fontWeight: 500, marginBottom: 6,
        }}>
          ALTITUDE
        </div>
        <div style={{
          fontSize: 56, lineHeight: 1, fontWeight: 700, letterSpacing: '-.02em',
          color: SE_MINT, fontVariantNumeric: 'tabular-nums',
          textShadow: '0 2px 6px rgba(0,0,0,.5)',
        }}>
          3,952<span style={{ fontSize: 22, fontWeight: 600, marginLeft: 3, color: SE_MINT }}>m</span>
        </div>
        <div style={{
          marginTop: 10, fontSize: 13, color: SE_FG, fontWeight: 600, letterSpacing: '.02em',
          textShadow: '0 1px 2px rgba(0,0,0,.5)',
        }}>
          玉山主峰
        </div>
      </div>

      {/* secondary stats */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 56,
        padding: '0 22px',
        display: 'flex', justifyContent: 'space-between',
        fontFamily: SE_FONT, color: SE_FG,
      }}>
        {[
          { label: 'DISTANCE', value: '12.8', unit: 'km' },
          { label: 'GAIN',     value: '1,350', unit: 'm' },
          { label: 'TIME',     value: '6:42',  unit: '' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 9, color: SE_FG2, letterSpacing: '.16em', fontWeight: 500, marginBottom: 4,
            }}>
              {s.label}
            </div>
            <div style={{
              fontSize: 18, fontWeight: 700, color: SE_FG,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em',
              textShadow: '0 1px 2px rgba(0,0,0,.5)',
            }}>
              {s.value}
              {s.unit && <span style={{ fontSize: 10, color: SE_FG2, fontWeight: 500, marginLeft: 2 }}>{s.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* PERMANENT brand footer (always present, NOT a paywall watermark) */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
        <BrandFooter />
      </div>

      {/* Diagonal preview watermark — covers middle ~60% of preview */}
      {watermark && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '20%', height: '60%',
          pointerEvents: 'none', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-around',
          transform: 'rotate(-30deg) scale(1.4)',
          transformOrigin: 'center',
        }}>
          {[0, 1, 2].map(row => (
            <div key={row} style={{
              whiteSpace: 'nowrap',
              fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,.20)',
              letterSpacing: '.18em', fontFamily: SE_FONT,
              textAlign: 'center',
            }}>
              Peak Trekker 预览版 · Peak Trekker 预览版
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Hint bar shown under preview when watermarked
const UnlockHintBar = () => (
  <button style={{
    margin: '12px 20px 0',
    padding: '12px 14px', borderRadius: 10,
    background: 'rgba(126,240,180,.06)', border: `1px solid rgba(126,240,180,.2)`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer', fontFamily: SE_FONT,
    width: 'calc(100% - 40px)',
  }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="11" width="14" height="9" rx="1.6" stroke={SE_MINT} strokeWidth="1.7" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={SE_MINT} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 13, color: SE_MINT, fontWeight: 600 }}>
        解锁高级模板，导出无水印版本
      </span>
    </span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M9 6l6 6-6 6" stroke={SE_MINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
);

// Tab bar — "高级" active variant
const TabBarAdvanced = () => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 24,
    padding: '12px 20px 0',
    fontFamily: SE_FONT,
  }}>
    <button style={{
      background: 'transparent', border: 'none', padding: '6px 0', cursor: 'pointer',
      fontSize: 15, fontWeight: 600, color: SE_FG2, fontFamily: SE_FONT,
    }}>
      基础
    </button>
    <button style={{
      background: 'transparent', border: 'none', padding: '6px 0', cursor: 'pointer',
      fontSize: 15, fontWeight: 600, color: SE_FG, fontFamily: SE_FONT,
      position: 'relative',
    }}>
      高级
      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: -2,
        height: 2, background: SE_MINT, borderRadius: 2,
      }} />
    </button>
  </div>
);

// SCREEN A — Limited Free
const ShareEditorV4AdvFree = () => {
  const heroHeight = 382;
  return (
    <div style={{
      width: '100%', height: '100%', background: SE_BG, color: SE_FG,
      fontFamily: SE_FONT, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <SEStatusBar />
      <SENavBar />

      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 20px 0' }}>
        <HeroAdvancedTemplate height={heroHeight} />
      </div>

      <TabBarAdvanced />
      <div style={{ height: 1, background: SE_OUTLINE, opacity: .8 }} />

      <AdvThumbRow mode="free" selectedIndex={0} />

      <div style={{ flex: 1 }} />

      <ControlRowPeek />
    </div>
  );
};

// SCREEN B — Locked / Preview watermark
const ShareEditorV4AdvLocked = () => {
  const heroHeight = 382;
  return (
    <div style={{
      width: '100%', height: '100%', background: SE_BG, color: SE_FG,
      fontFamily: SE_FONT, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <SEStatusBar />
      <SENavBar />

      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 20px 0' }}>
        <HeroAdvancedTemplate height={heroHeight} watermark />
      </div>

      <UnlockHintBar />

      <TabBarAdvanced />
      <div style={{ height: 1, background: SE_OUTLINE, opacity: .8 }} />

      <AdvThumbRow mode="locked" selectedIndex={0} />

      <div style={{ flex: 1 }} />
    </div>
  );
};

window.ShareEditorV4 = ShareEditorV4;
window.ShareEditorV4Bottom = ShareEditorV4Bottom;
window.ShareEditorV4AdvFree = ShareEditorV4AdvFree;
window.ShareEditorV4AdvLocked = ShareEditorV4AdvLocked;
