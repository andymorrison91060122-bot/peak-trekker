// Peak Trekker · FAQ main page + detail page + context-insert frames
// ─────────────────────────────────────────────────────────────────────────────
// Exports:
//   FAQScreen                     — default, all groups collapsed (Profile entry)
//   FAQScreenExpanded             — one group open + accordion answer on one Q
//   FAQScreenSearch               — search active, filtered list
//   FAQScreenSearchEmpty          — search returns 0
//   FAQScreenDeepLink             — landed via deep link, target highlighted
//   FAQDetailScreen               — Pattern B long-form
//   HelpSheetGpsWeak              — short answer
//   HelpSheetReview               — medium answer
//   ProfileSettingsRowFrame       — Profile · with FAQ row inserted (in context)
//   TrekPreStartWithHelpFrame     — Trek pre-start · GPS row with ?
//   ActivityProofStripWithHelpFrame — Activity Detail · ProofStrip with ?
// ─────────────────────────────────────────────────────────────────────────────

const { useState: useFAQState } = React;

// ─────────────────────────────────────────────────────────────────────────────
// Page chrome
// ─────────────────────────────────────────────────────────────────────────────

const FAQHeader = ({ onBack }) => (
  <>
    <StatusBar />
    <TopBar title="常见问题" onBack={onBack} />
    <div style={{ padding: '4px 20px 0', fontSize: 13, color: PTColors.fg2, lineHeight: 1.6 }}>
      不确定的时候来这里看一眼。
    </div>
  </>
);

const FAQSearchField = ({ value = '', onChange, onClear, focused }) => (
  <div style={{ padding: '14px 16px 4px' }}>
    <div style={{
      height: 42, borderRadius: 12, padding: '0 12px',
      background: PTColors.surface,
      border: `1px solid ${focused ? 'rgba(34,197,94,.36)' : PTColors.outline}`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <PTIcons.search />
      {value
        ? <span style={{ flex: 1, color: PTColors.fg, fontSize: 14 }}>{value}</span>
        : <span style={{ flex: 1, color: PTColors.fg2, fontSize: 14 }}>搜你想知道的事</span>}
      {value && (
        <button onClick={onClear} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: PTColors.fg2, padding: 0, display: 'inline-flex' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="rgba(255,255,255,.08)"/><path d="M9 9l6 6M15 9l-6 6" stroke={PTColors.fg2} strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Group + question rendering
// ─────────────────────────────────────────────────────────────────────────────

const Chevron = ({ open, color = PTColors.fg2 }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>
    <path d="M9 6l6 6-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const FAQGroup = ({ group, open, openQ, onToggleGroup, onToggleQ, highlightAnchor }) => (
  <div style={{
    margin: '0 16px 10px', borderRadius: 14,
    background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
    overflow: 'hidden',
  }}>
    <button
      onClick={() => onToggleGroup && onToggleGroup(group.id)}
      style={{
        width: '100%', height: 56, padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        color: PTColors.fg, textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 700 }}>{group.title}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>· {group.questions.length} 个问题</span>
        <Chevron open={open} />
      </span>
    </button>
    {open && (
      <div style={{ borderTop: `1px solid ${PTColors.outline}` }}>
        {group.questions.map((q, i) => {
          const expanded = openQ === q.anchor;
          const highlighted = highlightAnchor === q.anchor;
          return (
            <div key={q.anchor} style={{
              borderTop: i === 0 ? 'none' : `1px solid ${PTColors.outline}`,
              background: highlighted ? 'rgba(34,197,94,.06)' : 'transparent',
            }}>
              <button
                onClick={() => onToggleQ && onToggleQ(q.anchor)}
                style={{
                  width: '100%', padding: '14px 16px',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                  background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  color: PTColors.fg, textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.5, flex: 1 }}>{q.q}</span>
                <span style={{ marginTop: 4 }}><Chevron open={expanded} /></span>
              </button>
              {expanded && (
                <div style={{ padding: '0 16px 16px' }}>
                  <div style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,.02)', border: `1px solid ${PTColors.outline}`,
                    fontSize: 13, color: PTColors.fg2, lineHeight: 1.75, whiteSpace: 'pre-line',
                  }}>
                    {q.a}
                    {q.long && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${PTColors.outline}` }}>
                        <span style={{ fontSize: 12, color: PTColors.fg, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          查看完整说明
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);

const FAQFooter = () => (
  <>
    <div style={{ margin: '22px 20px 0' }}>
      <div style={{ fontSize: 13, color: PTColors.fg2, lineHeight: 1.7 }}>
        没有找到答案?
      </div>
      <div style={{ marginTop: 10, fontSize: 13, color: PTColors.fg2, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: PTColors.fg2, fontSize: 13, fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'rgba(141,149,155,.4)' }}>去找山</button>
        <span style={{ color: PTColors.fg2, opacity: .5 }}>·</span>
        <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: PTColors.fg2, fontSize: 13, fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'rgba(141,149,155,.4)' }}>提交反馈</button>
      </div>
    </div>
    <div style={{ textAlign: 'center', padding: '24px 0 30px', fontSize: 10, color: PTColors.fg2, letterSpacing: '.16em', fontFamily: "'IBM Plex Mono',monospace" }}>
      PEAK TREKKER · 真实记录与分享
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// FAQ main — default state (all collapsed)
// ─────────────────────────────────────────────────────────────────────────────

const FAQScreen = ({ onBack }) => {
  const [openGroup, setOpenGroup] = useFAQState(null);
  const [openQ, setOpenQ] = useFAQState(null);
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 20 }}>
      <FAQHeader onBack={onBack} />
      <FAQSearchField />
      <div style={{ marginTop: 6 }}>
        {FAQ_GROUPS.map(g => (
          <FAQGroup key={g.id} group={g}
            open={openGroup === g.id}
            openQ={openGroup === g.id ? openQ : null}
            onToggleGroup={(id) => { setOpenGroup(openGroup === id ? null : id); setOpenQ(null); }}
            onToggleQ={(a) => setOpenQ(openQ === a ? null : a)}
          />
        ))}
      </div>
      <FAQFooter />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FAQ main — one group open + one accordion answer expanded
// ─────────────────────────────────────────────────────────────────────────────

const FAQScreenExpanded = ({ onBack }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 20 }}>
    <FAQHeader onBack={onBack} />
    <FAQSearchField />
    <div style={{ marginTop: 6 }}>
      {FAQ_GROUPS.map(g => (
        <FAQGroup key={g.id} group={g}
          open={g.id === 'record'}
          openQ={g.id === 'record' ? 'record.gps-weak' : null}
        />
      ))}
    </div>
    <FAQFooter />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// FAQ main — search active
// ─────────────────────────────────────────────────────────────────────────────

const FAQScreenSearch = ({ onBack }) => {
  const query = '审核';
  const matches = [];
  FAQ_GROUPS.forEach(g => g.questions.forEach(q => {
    if (q.q.includes(query) || q.a.includes(query)) matches.push({ ...q, group: g });
  }));
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 20 }}>
      <FAQHeader onBack={onBack} />
      <FAQSearchField value={query} focused />
      <div style={{ padding: '4px 20px 12px', fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>
        {matches.length} 条匹配
      </div>
      <div style={{ padding: '0 16px', display: 'grid', gap: 8 }}>
        {matches.map(m => (
          <button key={m.anchor} style={{
            padding: '14px 16px', textAlign: 'left',
            background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 12,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
              {m.group.title}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: PTColors.fg, marginTop: 6, lineHeight: 1.4 }}>
              {m.q.split('审核').map((part, i, arr) => (
                <React.Fragment key={i}>
                  {part}
                  {i < arr.length - 1 && <span style={{ color: PTColors.success, background: 'rgba(110,231,161,.12)', padding: '0 2px', borderRadius: 3 }}>审核</span>}
                </React.Fragment>
              ))}
            </div>
            <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 8, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {m.a.replace(/\n/g, ' ').slice(0, 80)}…
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FAQ main — search empty
// ─────────────────────────────────────────────────────────────────────────────

const FAQScreenSearchEmpty = ({ onBack }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 20 }}>
    <FAQHeader onBack={onBack} />
    <FAQSearchField value="离线轨迹回放" focused />
    <div style={{ padding: '60px 32px 0', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, margin: '0 auto', display: 'grid', placeItems: 'center' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="6" stroke={PTColors.fg2} strokeWidth="1.6"/>
          <path d="M16 16l4 4" stroke={PTColors.fg2} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ marginTop: 18, fontSize: 16, fontWeight: 700, color: PTColors.fg }}>没有找到</div>
      <div style={{ marginTop: 8, fontSize: 13, color: PTColors.fg2, lineHeight: 1.7 }}>
        试试别的说法。<br/>或者直接告诉我们,这个问题应该写进来。
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button style={{ padding: '10px 16px', background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, borderRadius: 10, color: PTColors.fg, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>提交反馈</button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// FAQ main — landed via deep link (target group expanded + highlighted)
// ─────────────────────────────────────────────────────────────────────────────

const FAQScreenDeepLink = ({ onBack }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 20 }}>
    <FAQHeader onBack={onBack} />
    <FAQSearchField />
    <div style={{ marginTop: 6 }}>
      {FAQ_GROUPS.map(g => (
        <FAQGroup key={g.id} group={g}
          open={g.id === 'review'}
          openQ={g.id === 'review' ? 'review.what-is-review' : null}
          highlightAnchor="review.what-is-review"
        />
      ))}
    </div>
    <FAQFooter />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// FAQ detail page — Pattern B long-form
// ─────────────────────────────────────────────────────────────────────────────

const FAQDetailScreen = ({ onBack }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative', paddingBottom: 30 }}>
    <StatusBar />
    <TopBar title="完整说明" onBack={onBack} />
    <div style={{ padding: '8px 20px 0' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
        审核与发布
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: PTColors.fg, marginTop: 10, letterSpacing: '-.01em', lineHeight: 1.3 }}>
        什么是「审核中」
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>
        更新于 2025·09·14
      </div>
    </div>

    <div style={{ padding: '20px 20px 0', fontSize: 14, color: PTColors.fg, lineHeight: 1.8 }}>
      补签和登顶留证都需要人工核验。我们读照片、对照轨迹、看时间和位置是否能对上。
    </div>

    <div style={{ padding: '14px 20px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase' }}>
        审核会看哪些
      </div>
      <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 12, background: PTColors.surface, border: `1px solid ${PTColors.outline}` }}>
        {[
          ['01', '照片里有没有可识别的峰顶或路标'],
          ['02', '时间和位置和已收录的山峰资料是否对得上'],
          ['03', '同一段轨迹是否已经在另一条记录里出现过'],
          ['04', '海拔曲线是否符合这条线路的实际情况'],
        ].map(([n, t], i, arr) => (
          <div key={n} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10, padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${PTColors.outline}`, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>{n}</span>
            <span style={{ fontSize: 13, color: PTColors.fg, lineHeight: 1.5 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>

    <div style={{ padding: '20px 20px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase' }}>
        时间线
      </div>
      <div style={{ marginTop: 10, padding: '14px 14px', borderRadius: 12, background: PTColors.surface, border: `1px solid ${PTColors.outline}` }}>
        <TimelineRow label="提交后立即" desc="进入审核队列,这条山行在档案里显示为「审核中」" />
        <TimelineRow label="一般 24 小时内" desc="审核完成,通过则进入档案;未通过会写明原因" />
        <TimelineRow label="超过 48 小时" desc="可能需要补充信息,我们会通过站内消息告诉你" last />
      </div>
    </div>

    <div style={{ padding: '20px 20px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase' }}>
        审核期间你能做什么
      </div>
      <div style={{ marginTop: 10, padding: '14px 14px', borderRadius: 12, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, fontSize: 13, color: PTColors.fg, lineHeight: 1.8 }}>
        审核期间你的山行已经在档案里 —— 自己能看到,只是还不能发到山友圈、不能用作执照升级依据。<br/><br/>
        如果想加照片或写一段亲历,审核期间也可以直接编辑。改动会重新进入队列。
      </div>
    </div>

    <div style={{ margin: '24px 16px 0', padding: '14px 16px', borderRadius: 12, background: 'rgba(245,158,11,.06)', border: `1px solid rgba(245,158,11,.22)`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <PTIcons.warn />
      <div style={{ fontSize: 12, color: PTColors.fg, lineHeight: 1.7 }}>
        <strong style={{ fontWeight: 700 }}>没通过不代表你没走过这座山。</strong><br/>
        <span style={{ color: PTColors.fg2 }}>它只代表我们这次拿到的信息不够支撑「自动归档」。补一张照片或一段说明,通常就够了。</span>
      </div>
    </div>
  </div>
);

const TimelineRow = ({ label, desc, last }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, paddingBottom: last ? 0 : 14, marginBottom: last ? 0 : 14, borderBottom: last ? 'none' : `1px solid ${PTColors.outline}` }}>
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: PTColors.success, marginTop: 5 }} />
      {!last && <div style={{ flex: 1, width: 1, background: PTColors.outline, marginTop: 4 }} />}
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>{label}</div>
      <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 4, lineHeight: 1.6 }}>{desc}</div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Bottom-sheet showcase frames
// Backdrop renders the underlying screen at full fidelity, dimmed by the scrim.
// The sheet sits over it sized to its content (auto height, max 60% viewport).
// ─────────────────────────────────────────────────────────────────────────────

// Faint Trek pre-start backdrop — full screen behind the scrim.
const SheetBackdropTrek = () => (
  <div style={{ position: 'absolute', inset: 0, background: PTColors.bg, filter: 'blur(.4px)' }}>
    <StatusBar />
    <TopBar title="玉珠峰 · 出发前" onBack={() => {}} />
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px', display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 12, alignItems: 'center', borderBottom: `1px solid ${PTColors.outline}` }}>
          <PTIcons.check c={PTColors.warn} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>GPS 信号弱</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>水平精度 ±18m</div>
          </div>
          <span style={{ fontSize: 14, color: PTColors.fg2 }}>?</span>
        </div>
        <div style={{ padding: '14px 14px', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'center', borderBottom: `1px solid ${PTColors.outline}` }}>
          <PTIcons.check c={PTColors.success} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>离线地图已缓存</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>玉珠峰区域 · 48MB</div>
          </div>
        </div>
        <div style={{ padding: '14px 14px', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'center' }}>
          <PTIcons.check c={PTColors.success} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>电量 82%</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3 }}>约够 11h 记录</div>
          </div>
        </div>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}>
      <PrimaryButton full>开始记录</PrimaryButton>
    </div>
  </div>
);

// Faint Activity Detail backdrop — full screen behind the scrim.
const SheetBackdropActivity = () => (
  <div style={{ position: 'absolute', inset: 0, background: PTColors.bg, filter: 'blur(.4px)' }}>
    <StatusBar />
    <TopBar title="一次山行" onBack={() => {}} right={<IconButton round><PTIcons.share /></IconButton>} />
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ padding: '14px 14px', borderRadius: 14, background: 'rgba(245,158,11,.06)', border: `1px solid rgba(245,158,11,.28)`, display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, alignItems: 'center' }}>
        <PTIcons.warn />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>审核中</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4, lineHeight: 1.55 }}>
            一般 24 小时内完成 · 审核期间这次山行只有你能看到
          </div>
        </div>
        <span style={{ fontSize: 10, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>09·14<br/>14:22</span>
      </div>
    </div>
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, padding: '16px 14px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace" }}>5,108<span style={{ fontSize: 12, color: PTColors.fg2, marginLeft: 4 }}>m</span></div>
        <div style={{ marginTop: 6, fontSize: 12, color: PTColors.fg2 }}>玉珠峰 · 西北脊</div>
      </div>
    </div>
  </div>
);

const HelpSheetGpsWeak = () => (
  <div style={{ position: 'relative', height: '100%', background: PTColors.bg }}>
    <SheetBackdropTrek />
    <HelpSheet anchor="record.gps-weak" prebaked />
  </div>
);

const HelpSheetReview = () => (
  <div style={{ position: 'relative', height: '100%', background: PTColors.bg }}>
    <SheetBackdropActivity />
    <HelpSheet anchor="review.what-is-review" prebaked />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Context-insert frames (fragments, not full re-skins)
// ─────────────────────────────────────────────────────────────────────────────

const ProfileSettingsRowFrame = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="我的" />
    <div style={{ padding: '6px 20px 0', fontSize: 10, color: PTColors.fg2, letterSpacing: '.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
      上下文示例 · 只展示新增行
    </div>

    {/* Existing block (faint) */}
    <div style={{ margin: '14px 16px 0', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,.02)', border: `1px solid ${PTColors.outline}`, opacity: .55 }}>
      <SettingsRow label="账号" value="13800·1234" />
      <SettingsRow label="所在省份" value="云南" />
      <SettingsRow label="执照等级" value="中级" last />
    </div>

    <div style={{ padding: '14px 20px 6px', fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.12em', textTransform: 'uppercase' }}>
      支持
    </div>
    {/* New row — quiet success dot, no inline NEW badge */}
    <div style={{ margin: '0 16px', borderRadius: 12, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, position: 'relative' }}>
      <SettingsRow label="帮助 · FAQ" value="" chevron last newDot />
      <SettingsRow label="问题反馈" value="" chevron last />
    </div>
    <div style={{ padding: '14px 20px 0', fontSize: 11, color: PTColors.fg2, lineHeight: 1.6 }}>
      新增的「帮助 · FAQ」入口。常见问题集中在这里,旁边的 ? 图标也都跳到同一处。
    </div>
  </div>
);

const SettingsRow = ({ label, value, chevron, last, newDot }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 14px',
    borderBottom: last ? 'none' : `1px solid ${PTColors.outline}`,
  }}>
    <span style={{ fontSize: 14, color: PTColors.fg, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {label}
      {newDot && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, border: `1.5px solid ${PTColors.success}`, display: 'inline-block' }} />}
    </span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {value && <span style={{ fontSize: 13, color: PTColors.fg2 }}>{value}</span>}
      {chevron && <Chevron open={false} />}
    </span>
  </div>
);

const TrekPreStartWithHelpFrame = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="玉珠峰 · 出发前" onBack={() => {}} />
    <div style={{ padding: '6px 20px 0', fontSize: 10, color: PTColors.fg2, letterSpacing: '.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
      上下文示例 · GPS 行 + ? 触发
    </div>

    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ background: PTColors.surface, border: `1px solid ${PTColors.outline}`, borderRadius: 14, overflow: 'hidden' }}>
        <PreflightRowWithHelp ok label="GPS 信号良好" sub="水平精度 ±4m" anchor="record.gps-weak" />
        <PreflightRowWithHelp ok label="离线地图已缓存" sub="玉珠峰区域 · 48MB" anchor="map.map-no-nav" />
        <PreflightRowWithHelp ok label="电量 82%" sub="约够 11h 记录" last />
      </div>
    </div>

    <div style={{ padding: '14px 20px 0', fontSize: 12, color: PTColors.fg2, lineHeight: 1.7 }}>
      每一项检查右侧的 ? 都打开一段简短说明,不打断出发。
    </div>

    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}>
      <PrimaryButton full>开始记录</PrimaryButton>
    </div>
  </div>
);

const PreflightRowWithHelp = ({ ok, label, sub, anchor, last }) => (
  <div style={{
    padding: '14px 14px', display: 'grid',
    gridTemplateColumns: '24px 1fr auto', gap: 12, alignItems: 'center',
    borderBottom: last ? 'none' : `1px solid ${PTColors.outline}`,
  }}>
    <PTIcons.check c={ok ? PTColors.success : PTColors.warn} />
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>{label}</div>
      <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
    </div>
    {anchor && <HelpTrigger anchor={anchor} />}
  </div>
);

const ActivityProofStripWithHelpFrame = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    <TopBar title="一次山行" onBack={() => {}} />
    <div style={{ padding: '6px 20px 0', fontSize: 10, color: PTColors.fg2, letterSpacing: '.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
      上下文示例 · 审核中条 + ? 触发
    </div>

    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ padding: '14px 14px', borderRadius: 14, background: 'rgba(245,158,11,.06)', border: `1px solid rgba(245,158,11,.28)` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, alignItems: 'center' }}>
          <PTIcons.warn />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: PTColors.fg }}>审核中</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 4, lineHeight: 1.55 }}>
              一般 24 小时内完成 · 审核期间这次山行只有你能看到
            </div>
          </div>
          <span style={{ fontSize: 10, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>09·14<br/>14:22</span>
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid rgba(245,158,11,.18)`, paddingLeft: 44 }}>
          <HelpLink anchor="review.what-is-review">查看说明</HelpLink>
        </div>
      </div>
    </div>

    <div style={{ padding: '14px 20px 0', fontSize: 12, color: PTColors.fg2, lineHeight: 1.7 }}>
      条下方的「查看说明」打开「什么是审核中」,避免和右侧时间戳挤在一起。
    </div>

    {/* placeholder rest of screen, very faint */}
    <div style={{ margin: '20px 16px 0', height: 110, borderRadius: 14, background: 'rgba(255,255,255,.02)', border: `1px dashed ${PTColors.outline}`, display: 'grid', placeItems: 'center' }}>
      <span style={{ fontSize: 10, color: PTColors.fg2, letterSpacing: '.16em', fontFamily: "'IBM Plex Mono',monospace" }}>· ACTIVITY DETAIL CONTINUES ·</span>
    </div>
  </div>
);

Object.assign(window, {
  FAQScreen, FAQScreenExpanded, FAQScreenSearch, FAQScreenSearchEmpty, FAQScreenDeepLink,
  FAQDetailScreen,
  HelpSheetGpsWeak, HelpSheetReview,
  ProfileSettingsRowFrame, TrekPreStartWithHelpFrame, ActivityProofStripWithHelpFrame,
});
