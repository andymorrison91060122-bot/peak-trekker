// Peak Trekker · Community surfaces (consumption side)
// ─────────────────────────────────────────────────────────────────────────────
// Composition:
//   1. Shared atoms — MountainBindRow, ActivityStatStrip, LikeButton, AuthorStrip,
//                     RelativeTime, MediaBlock, KebabMenu, PostMenuSheet
//   2. <CommunityCard>            — feed card (used in feed list)
//   3. <CommunityFeedScreen>      — list, with empty/loading/end variants
//   4. <CommunityDetailScreen>    — single post page, author/viewer states
//   5. <CuratedPostCard>          — denser, mountain-detail-only card
//   6. <CuratedCommunityModule>   — section wrapper for Mountain Detail
//   7. Frame compositions for index.html canvas
//
// Backend contract assumptions (flagged in handoff):
//   post.id, post.author{ id, name, avatar }, post.created_at
//   post.bound_activity_id      → links Community post → Activity
//   post.bound_mountain{ id, name, region, photo_url, alt }
//   post.body                   → 0–N chars, may be empty (text-only or media-only allowed)
//   post.media[]                → array of { url, w, h }
//   post.activity_stats{ alt, dist_km, climb_m, duration }
//   post.likes_count, post.likedByMe
//   post.is_authored_by_me      → drives author/viewer branches
//   post.is_curated_for_mountain (admin-set; surfaces in curated module)
// ─────────────────────────────────────────────────────────────────────────────

const { useState: useC } = React;

// ─────────────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────────────

// Avatar — circular tinted placeholder. Real product uses uploaded photos.
const Avatar = ({ size = 40, name = '', tone = 'a' }) => {
  const tones = {
    a: ['#3a4148', '#6c757d'], b: ['#4a3f3a', '#a8826b'],
    c: ['#3b4a3f', '#7da587'], d: ['#3f3a4a', '#8b7da5'],
    e: ['#4a3b3f', '#a57d8a'], f: ['#3a4a48', '#6ba59c'],
  };
  const [bg, fg] = tones[tone] || tones.a;
  const initial = name.slice(0, 1) || '·';
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: `linear-gradient(135deg, ${bg}, ${fg})`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,.85)', fontSize: size * 0.42, fontWeight: 700,
      flexShrink: 0,
    }}>{initial}</div>
  );
};

// Mandatory mountain bind row — load-bearing for "real trip, not a tweet"
const MountainBindRow = ({ mountain, dense }) => (
  <button style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: dense ? '4px 8px' : '5px 10px', borderRadius: 999,
    background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`,
    color: PTColors.fg, cursor: 'pointer', fontFamily: 'inherit',
    maxWidth: '100%', overflow: 'hidden',
  }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 2C7.6 2 4 5.6 4 10c0 5.4 8 12 8 12s8-6.6 8-12c0-4.4-3.6-8-8-8z" stroke={PTColors.fg2} strokeWidth="1.8"/>
      <circle cx="12" cy="10" r="3" stroke={PTColors.fg} strokeWidth="1.8"/>
    </svg>
    <span style={{ fontSize: dense ? 11 : 12, fontWeight: 600, color: PTColors.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {mountain.name}
    </span>
    <span style={{ fontSize: dense ? 10 : 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>
      · {mountain.region}
    </span>
  </button>
);

// Activity stat strip — load-bearing, ties post to a real Activity
const ActivityStatStrip = ({ stats, dense }) => {
  const cells = [
    { label: '海拔 m', value: stats.alt.toLocaleString(), accent: true },
    { label: '距离 km', value: stats.dist_km },
    { label: '爬升 m', value: stats.climb_m.toLocaleString() },
    { label: '用时',  value: stats.duration },
  ];
  if (dense) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
        {cells.map(c => (
          <div key={c.label} style={{ padding: '6px 0' }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: c.accent ? PTColors.success : PTColors.fg, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{c.value}</div>
            <div style={{ fontSize: 9, color: PTColors.fg2, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.04em' }}>{c.label}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{
      background: 'rgba(255,255,255,.025)', border: `1px solid ${PTColors.outline}`,
      borderRadius: 12, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8,
    }}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ borderLeft: i === 0 ? 'none' : `1px solid ${PTColors.outline}`, paddingLeft: i === 0 ? 0 : 8 }}>
          <div style={{ fontSize: 9, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.06em', textTransform: 'uppercase' }}>{c.label}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, fontWeight: 700, color: c.accent ? PTColors.success : PTColors.fg, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
};

// Like button — outline / filled-success states
const LikeButton = ({ liked, count, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'transparent', border: 'none', padding: '6px 0',
      cursor: 'pointer', color: liked ? PTColors.success : PTColors.fg2,
      fontFamily: 'inherit',
    }}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? PTColors.success : 'none'}>
      <path d="M12 20.5s-7.4-4.6-9.4-9.5C1.5 8 3.5 5 6.6 5c1.9 0 3.6 1 4.4 2.7C11.8 6 13.5 5 15.4 5 18.5 5 20.5 8 19.4 11c-2 4.9-9.4 9.5-9.4 9.5h2z" stroke={liked ? PTColors.success : PTColors.fg2} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Evidence-tier chip — visual expression of the three-tier evidence model
// ─────────────────────────────────────────────────────────────────────────────
//
// Three tiers from product mainline §8 (完整山行 / 登顶留证 / 个人归档):
//   evidence: 'live'    → 实时记录   GPS-tracked from start to finish (highest tier)
//                                     Was: GPS 实时记录. New: 实时记录 — drops engineer-voice prefix.
//   evidence: 'photo'   → 照片留证   Photo-only proof submitted post-hoc (mid tier)
//                                     Was: 照片补签记录. New: 照片留证 — frames as keepsake, not 'fix-up'.
//   evidence: 'import'  → 轨迹导入   GPX/FIT imported from another device (lowest verification, but kept honest)
//                                     This tier was implicit in old design — now explicit.
//
// Why these labels: see COMMUNITY_HANDOFF.md §Chip-copy reasoning. Short answer:
// each is a noun phrase the user would say aloud. No 'GPS', no '补签', no system jargon.
// All three same length so the chip footprint is visually stable across feed cards.

const EVIDENCE_TIERS = {
  live:   { label: '实时记录', color: PTColors.success, dotted: false },
  photo:  { label: '照片留证', color: PTColors.fg,      dotted: false },
  import: { label: '轨迹导入', color: PTColors.fg2,     dotted: true  },
};

const EvidenceChip = ({ tier }) => {
  const t = EVIDENCE_TIERS[tier]; if (!t) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 7px', borderRadius: 999,
      border: `1px ${t.dotted ? 'dashed' : 'solid'} ${t.color === PTColors.success ? 'rgba(110,231,161,.35)' : PTColors.outline}`,
      background: t.color === PTColors.success ? 'rgba(110,231,161,.08)' : 'rgba(255,255,255,.025)',
      fontSize: 10, fontWeight: 600, color: t.color,
      fontFamily: 'inherit', letterSpacing: '.02em', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: 999, background: t.color, opacity: t.color === PTColors.fg2 ? .8 : 1,
      }} />
      {t.label}
    </span>
  );
};

// Author strip — avatar + name + relative time + evidence chip
// (kebab is NO LONGER here; it lives in the InteractionFooter)
const AuthorStrip = ({ author, time, evidence, faintReviewed }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <Avatar size={40} name={author.name} tone={author.tone} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{author.name}</span>
        <span style={{ width: 3, height: 3, borderRadius: 999, background: PTColors.fg2, opacity: .5 }} />
        <span style={{ fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500 }}>{time}</span>
        {evidence && <EvidenceChip tier={evidence} />}
      </div>
      {faintReviewed && (
        <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 2, opacity: .8, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.04em' }}>已发布到山友圈</div>
      )}
    </div>
  </div>
);

// Media block — handles 0/1/2/3+ images per spec
const MediaBlock = ({ media }) => {
  if (!media || media.length === 0) return null;
  const tone = (i) => ['alpine','ridge','dawn','glacial'][i % 4];
  if (media.length === 1) {
    return (
      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${PTColors.outline}` }}>
        <PhonePlaceholder h={252} tone={tone(0)} label="" />
      </div>
    );
  }
  if (media.length === 2) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {media.slice(0, 2).map((_, i) => (
          <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, aspectRatio: '1/1' }}>
            <PhonePlaceholder h={155} tone={tone(i)} label="" />
          </div>
        ))}
      </div>
    );
  }
  // 3+: asymmetric — large left, two stacked right
  const extra = media.length > 3 ? media.length - 3 : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 6, height: 220 }}>
      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, position: 'relative' }}>
        <PhonePlaceholder h={220} tone={tone(0)} label="" />
      </div>
      <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 6 }}>
        <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${PTColors.outline}` }}>
          <PhonePlaceholder h={107} tone={tone(1)} label="" />
        </div>
        <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${PTColors.outline}`, position: 'relative' }}>
          <PhonePlaceholder h={107} tone={tone(2)} label="" />
          {extra > 0 && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace" }}>+{extra}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RoutePreviewBlock — photo fallback + load-bearing 'map is reference' moment
// ─────────────────────────────────────────────────────────────────────────────
//
// Replaces the media region when a post has no photos. NOT a real map — explicitly
// labelled STATIC REFERENCE so users understand we're not promising live navigation.
// (Product positioning §13.1: 'map is reference, not navigation'.)
//
// Three sizes:
//   variant='card'  → feed card / detail-page width (full block, w/ inset thumbnail)
//   variant='inset' → curated thumbnail size (60×80, just glyph + STATIC label)

const RoutePreviewBlock = ({ mountain, variant = 'card' }) => {
  if (variant === 'inset') {
    return (
      <div style={{
        width: 60, height: 80, borderRadius: 8, border: `1px solid ${PTColors.outline}`,
        background: 'radial-gradient(circle at 30% 40%, rgba(110,231,161,.18) 0%, transparent 60%), radial-gradient(circle at 70% 70%, rgba(126,176,255,.14) 0%, transparent 55%), #14171a',
        position: 'relative', overflow: 'hidden',
        backgroundImage: `linear-gradient(#1c2024 1px, transparent 1px), linear-gradient(90deg, #1c2024 1px, transparent 1px), radial-gradient(circle at 30% 40%, rgba(110,231,161,.18) 0%, transparent 60%), radial-gradient(circle at 70% 70%, rgba(126,176,255,.14) 0%, transparent 55%)`,
        backgroundSize: '10px 10px, 10px 10px, 100% 100%, 100% 100%',
      }}>
        <svg viewBox="0 0 60 80" style={{ position: 'absolute', inset: 0 }}>
          <path d="M8 60 Q 18 40 28 36 T 50 16" stroke={PTColors.success} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="50" cy="16" r="2.5" fill={PTColors.success} />
        </svg>
        <div style={{
          position: 'absolute', left: 4, bottom: 3,
          fontSize: 7, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
          color: PTColors.success, letterSpacing: '.08em',
        }}>STATIC</div>
      </div>
    );
  }
  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${PTColors.outline}`,
      background: '#14171a', position: 'relative', overflow: 'hidden',
      backgroundImage: `linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px), radial-gradient(circle at 28% 35%, rgba(110,231,161,.16) 0%, transparent 55%), radial-gradient(circle at 78% 70%, rgba(126,176,255,.13) 0%, transparent 50%)`,
      backgroundSize: '24px 24px, 24px 24px, 100% 100%, 100% 100%',
    }}>
      {/* Inner padding container */}
      <div style={{ padding: '14px 16px 14px', minHeight: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
        {/* Top-left: title + mountain */}
        <div style={{
          display: 'inline-block', padding: '8px 12px',
          background: 'rgba(18,20,22,.6)', backdropFilter: 'blur(8px)',
          borderRadius: 8, alignSelf: 'flex-start',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: PTColors.fg }}>路线轨迹</div>
          <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2, fontWeight: 400 }}>{mountain?.name || '未指定山峰'}</div>
        </div>
        {/* Bottom: STATIC REFERENCE label + sentence + inset glyph */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: PTColors.success,
              fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.14em', textTransform: 'uppercase',
            }}>STATIC REFERENCE</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, lineHeight: 1.55, marginTop: 6, maxWidth: 180 }}>
              这里只保留静态路线示意和占位语义,不承诺实时地图能力。
            </div>
          </div>
          {/* Inset thumbnail with reference line */}
          <div style={{
            width: 76, height: 76, borderRadius: 10,
            background: 'rgba(18,20,22,.7)', backdropFilter: 'blur(8px)',
            border: `1px solid ${PTColors.outline}`,
            position: 'relative', overflow: 'hidden',
          }}>
            <svg viewBox="0 0 76 76" style={{ position: 'absolute', inset: 0 }}>
              <path d="M12 58 Q 24 38 34 32 T 60 14" stroke={PTColors.success} strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <circle cx="60" cy="14" r="3" fill={PTColors.success} />
              <circle cx="60" cy="14" r="6" fill="none" stroke={PTColors.success} strokeWidth="1" opacity=".4" />
            </svg>
            <div style={{
              position: 'absolute', left: 6, bottom: 5,
              fontSize: 8, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600,
              color: PTColors.fg2, letterSpacing: '.04em',
            }}>参考线</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// InteractionFooter — status copy on left, three icon buttons on right
// ─────────────────────────────────────────────────────────────────────────────
//
// Replaces the previous tail-style ♡ count. The empty-state copy is the warm-voice
// moment: 0 likes reads as '还没有点赞 · 成为第一个点赞的人', not as a number.
// Author viewing own post: like is hidden (can't like own post per spec); status
// becomes the count or '暂无互动'.

const FooterIconBtn = ({ children, label, active, onClick }) => (
  <button onClick={onClick} aria-label={label} style={{
    width: 36, height: 36, borderRadius: 999, padding: 0,
    background: active ? 'rgba(110,231,161,.1)' : 'rgba(255,255,255,.04)',
    border: `1px solid ${active ? 'rgba(110,231,161,.3)' : PTColors.outline}`,
    color: active ? PTColors.success : PTColors.fg2, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit',
  }}>{children}</button>
);

const InteractionFooter = ({ post, onMenuToggle, sticky }) => {
  const isMine = post.is_authored_by_me;
  const liked = post.likedByMe;
  const count = post.likes_count;
  // Left status — three branches
  let statusLine;
  if (isMine) {
    statusLine = count > 0
      ? <FooterStatus badge={count} title={`${count} 人觉得有用`} sub="你的发布" />
      : <FooterStatus badge={0} title="暂无互动" sub="等待第一位山友" muted />;
  } else if (count === 0) {
    statusLine = <FooterStatus badge={0} title="还没有点赞" sub="成为第一个点赞的人" />;
  } else {
    statusLine = <FooterStatus badge={count} title={`${count} 人觉得有用`} sub="" />;
  }
  return (
    <div style={{
      ...(sticky ? {} : { borderTop: `1px solid ${PTColors.outline}`, marginTop: 4 }),
      padding: sticky ? '10px 14px' : '12px 4px 2px',
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
    }}>
      {statusLine}
      <div style={{ display: 'flex', gap: 8 }}>
        {!isMine && (
          <FooterIconBtn label={liked ? '已点赞' : '点赞'} active={liked}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? PTColors.success : 'none'}>
              <path d="M12 20.5s-7.4-4.6-9.4-9.5C1.5 8 3.5 5 6.6 5c1.9 0 3.6 1 4.4 2.7C11.8 6 13.5 5 15.4 5 18.5 5 20.5 8 19.4 11c-2 4.9-9.4 9.5-9.4 9.5h2z" stroke={liked ? PTColors.success : PTColors.fg2} strokeWidth="1.7" strokeLinejoin="round"/>
            </svg>
          </FooterIconBtn>
        )}
        <FooterIconBtn label="分享">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 4v12M12 4l-4 4M12 4l4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" stroke={PTColors.fg2} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </FooterIconBtn>
        <FooterIconBtn label="更多" onClick={onMenuToggle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="12" r="1.5" fill={PTColors.fg2}/>
            <circle cx="12" cy="12" r="1.5" fill={PTColors.fg2}/>
            <circle cx="19" cy="12" r="1.5" fill={PTColors.fg2}/>
          </svg>
        </FooterIconBtn>
      </div>
    </div>
  );
};

const FooterStatus = ({ badge, title, sub, muted }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
    <div style={{
      width: 32, height: 32, borderRadius: 999,
      background: 'rgba(255,255,255,.04)', border: `1px solid ${PTColors.outline}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700,
      color: badge > 0 ? PTColors.fg : PTColors.fg2,
      fontVariantNumeric: 'tabular-nums',
    }}>{badge}</div>
    <div style={{ minWidth: 0, lineHeight: 1.3 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: muted ? PTColors.fg2 : PTColors.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  </div>
);

// Body text with optional truncation
const PostBody = ({ text, maxLines, full }) => {
  if (!text) return null;
  if (full) {
    return (
      <div style={{ fontSize: 15, color: PTColors.fg, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{text}</div>
    );
  }
  return (
    <div style={{
      fontSize: 14, color: PTColors.fg, lineHeight: 1.55,
      display: '-webkit-box', WebkitLineClamp: maxLines || 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    }}>{text}</div>
  );
};

// Kebab popover — now anchored to bottom-right footer block (above the kebab button)
const PostMenuSheet = ({ isMine, anchor = 'footer' }) => (
  <div style={{
    position: 'absolute',
    ...(anchor === 'footer' ? { bottom: 64, right: 14 } : { top: 48, right: 14 }),
    zIndex: 4,
  }}>
    <div style={{
      background: PTColors.elevated, border: `1px solid ${PTColors.outline}`, borderRadius: 12,
      padding: '4px 0', minWidth: 168, boxShadow: '0 12px 28px rgba(0,0,0,.36)',
    }}>
      {isMine ? (
        <>
          <MenuItem label="查看活动详情" />
          <Divider />
          <MenuItem label="编辑内容" />
          <Divider />
          <MenuItem label="从山友圈移除" tone="danger" />
        </>
      ) : (
        <MenuItem label="举报" tone="danger" />
      )}
    </div>
  </div>
);
const MenuItem = ({ label, tone }) => (
  <button onClick={(e) => e.stopPropagation()} style={{
    display: 'block', width: '100%', textAlign: 'left',
    padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
    color: tone === 'danger' ? PTColors.error : PTColors.fg, fontSize: 13, fontWeight: 500,
    fontFamily: 'inherit',
  }}>{label}</button>
);
const Divider = () => <div style={{ height: 1, background: PTColors.outline }} />;

// ─────────────────────────────────────────────────────────────────────────────
// CommunityCard — feed list card
// ─────────────────────────────────────────────────────────────────────────────

const CommunityCard = ({ post, menuOpen, onMenuToggle }) => {
  return (
    <div style={{
      position: 'relative',
      background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
      borderRadius: 14, padding: '14px 16px 12px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <AuthorStrip
        author={post.author}
        time={post.time}
        isMine={post.is_authored_by_me}
        faintReviewed={post.is_authored_by_me}
        onMore={onMenuToggle}
      />
      {menuOpen && <PostMenuSheet isMine={post.is_authored_by_me} />}

      <div>
        <MountainBindRow mountain={post.bound_mountain} />
      </div>

      {post.body && <PostBody text={post.body} maxLines={4} />}

      {post.media && post.media.length > 0 && <MediaBlock media={post.media} />}

      <ActivityStatStrip stats={post.activity_stats} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${PTColors.outline}`, paddingTop: 10, marginTop: 2 }}>
        <LikeButton liked={post.likedByMe} count={post.likes_count} />
      </div>
    </div>
  );
};

// Skeleton card — matches CommunityCard structure exactly
const CommunityCardSkeleton = () => (
  <div style={{
    background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
    borderRadius: 14, padding: '14px 16px 12px',
    display: 'flex', flexDirection: 'column', gap: 12,
  }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,.05)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 12, width: 100, borderRadius: 4, background: 'rgba(255,255,255,.05)' }} />
        <div style={{ height: 10, width: 60, borderRadius: 4, background: 'rgba(255,255,255,.04)', marginTop: 6 }} />
      </div>
    </div>
    <div style={{ height: 22, width: 160, borderRadius: 999, background: 'rgba(255,255,255,.04)' }} />
    <div>
      <div style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,.04)' }} />
      <div style={{ height: 12, width: '70%', borderRadius: 4, background: 'rgba(255,255,255,.04)', marginTop: 8 }} />
    </div>
    <div style={{ height: 180, borderRadius: 12, background: 'rgba(255,255,255,.03)' }} />
    <div style={{ height: 56, borderRadius: 12, background: 'rgba(255,255,255,.03)' }} />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Sample posts — used by feed + curated frames
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_POSTS = [
  {
    id: 'p1',
    author: { name: '林之野', tone: 'b' },
    time: '2 小时前',
    is_authored_by_me: false,
    bound_activity_id: 'a-001',
    bound_mountain: { name: '玉珠峰', region: '青海·格尔木' },
    body: '凌晨从 C1 出发,登顶时风不大,云海完整。下撤的路结了一层薄冰,新雪覆盖,走得比上去慢。\n带了双层靴是对的。',
    media: [{}, {}, {}, {}],
    evidence: 'live',
    activity_stats: { alt: 6178, dist_km: 12.4, climb_m: 1240, duration: '8h12' },
    likes_count: 24, likedByMe: false,
  },
  {
    id: 'p2',
    author: { name: 'Arie', tone: 'c' },
    time: '昨天',
    is_authored_by_me: true,
    bound_activity_id: 'a-002',
    bound_mountain: { name: '哈巴雪山', region: '云南·迪庆' },
    body: '从大本营出发到登顶 5 小时,标准线路,雪况不错。',
    media: [{}],
    evidence: 'live',
    activity_stats: { alt: 5396, dist_km: 8.6, climb_m: 1210, duration: '7h40' },
    likes_count: 12, likedByMe: true,
  },
  {
    id: 'p3',
    author: { name: '老路', tone: 'a' },
    time: '昨天',
    is_authored_by_me: false,
    bound_activity_id: 'a-003',
    bound_mountain: { name: '四姑娘山·大峰', region: '四川·阿坝' },
    body: '九月初的大峰,植被还没全黄。轨迹交给系统,人去看雪。能见度好,一路看到二峰三峰。',
    media: [{}, {}, {}],
    evidence: 'live',
    activity_stats: { alt: 5025, dist_km: 9.2, climb_m: 980, duration: '6h05' },
    likes_count: 47, likedByMe: false,
  },
  {
    id: 'p4',
    author: { name: '小满', tone: 'd' },
    time: '2024·10·04',
    is_authored_by_me: false,
    bound_activity_id: 'a-004',
    bound_mountain: { name: '雀儿山', region: '四川·甘孜' },
    body: '',
    media: [{}, {}],
    evidence: 'photo',
    activity_stats: { alt: 6168, dist_km: 14.8, climb_m: 1480, duration: '10h22' },
    likes_count: 89, likedByMe: true,
  },
  {
    id: 'p5',
    author: { name: '一川', tone: 'e' },
    time: '2024·09·30',
    is_authored_by_me: false,
    bound_activity_id: 'a-005',
    bound_mountain: { name: '岗什卡', region: '青海·门源' },
    body: '今年第三次了,这次是带着第一次走高海拔的朋友一起。\n慢一点,看到的东西多一点。',
    media: null,
    evidence: 'import',
    activity_stats: { alt: 5254, dist_km: 11.0, climb_m: 1080, duration: '7h28' },
    likes_count: 8, likedByMe: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Community Feed — populated, empty, loading, end states
// ─────────────────────────────────────────────────────────────────────────────

const CommunityFeedHeader = ({ subtitle }) => (
  <>
    <StatusBar />
    <div style={{
      position: 'sticky', top: 0, zIndex: 3, background: PTColors.bg,
      borderBottom: `1px solid ${PTColors.outline}`,
    }}>
      <div style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: PTColors.fg }}>山友圈</div>
        <button aria-label="回到顶部" style={{
          width: 32, height: 32, background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PTColors.fg2,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 19V6M6 12l6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
      {subtitle && (
        <div style={{ padding: '4px 16px 10px', fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>{subtitle}</div>
      )}
    </div>
  </>
);

const CommunityFeedScreen = ({ menuOpenIndex }) => {
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <CommunityFeedHeader />
      <div style={{ padding: '14px 14px 30px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {SAMPLE_POSTS.slice(0, 4).map((p, i) => (
          <CommunityCard key={p.id} post={p} menuOpen={menuOpenIndex === i} />
        ))}
        <EndMarker />
      </div>
      <BottomTabPlaceholder />
    </div>
  );
};

const CommunityFeedScreenTop = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
    <CommunityFeedHeader />
    <div style={{ padding: '14px 14px 30px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
      <CommunityCard post={SAMPLE_POSTS[0]} />
      <CommunityCard post={SAMPLE_POSTS[1]} />
    </div>
    <BottomTabPlaceholder />
  </div>
);

const CommunityFeedScreenEmpty = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
    <CommunityFeedHeader />
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '0 32px' }}>
      <div style={{ textAlign: 'center', marginTop: -40 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18,
          background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
          margin: '0 auto', display: 'grid', placeItems: 'center',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M4 17L9.8 8.2a1 1 0 0 1 1.7 0L20 17" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 17h16" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ marginTop: 18, fontSize: 16, fontWeight: 700, color: PTColors.fg }}>还没有人发布山行</div>
        <div style={{ marginTop: 8, fontSize: 13, color: PTColors.fg2, lineHeight: 1.6 }}>
          山友圈里只有真实走过的山。<br/>去找一座你想去的山,从那里开始。
        </div>
        <div style={{ marginTop: 22 }}>
          <SecondaryButton>去探索</SecondaryButton>
        </div>
      </div>
    </div>
    <BottomTabPlaceholder />
  </div>
);

const CommunityFeedScreenLoading = () => (
  <div style={{ background: PTColors.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
    <CommunityFeedHeader />
    <div style={{ padding: '14px 14px 30px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
      <CommunityCardSkeleton />
      <CommunityCardSkeleton />
      <CommunityCardSkeleton />
    </div>
    <BottomTabPlaceholder />
  </div>
);

const CommunityFeedScreenWithMenu = () => (
  <CommunityFeedScreen menuOpenIndex={1} />
);

const EndMarker = () => (
  <div style={{ textAlign: 'center', padding: '18px 0 8px', fontSize: 10, letterSpacing: '.2em', color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace" }}>
    · 已经看完 ·
  </div>
);

// Faint tab-bar placeholder for the host phone (helps reviewers see context)
const BottomTabPlaceholder = () => (
  <div style={{ height: 64, borderTop: `1px solid ${PTColors.outline}`, background: PTColors.bg, padding: '8px 18px 0', display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start' }}>
    {['mountain','archive','community','me'].map(k => (
      <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {PTIcons[k]({ size: 22, active: k === 'community' })}
        <span style={{ fontSize: 10, color: k === 'community' ? PTColors.fg : PTColors.fg2 }}>
          {k === 'mountain' ? '找山' : k === 'archive' ? '档案' : k === 'community' ? '山友圈' : '我的'}
        </span>
      </div>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// CommunityDetailScreen — author + viewer states
// ─────────────────────────────────────────────────────────────────────────────

const CommunityDetailScreen = ({ post, viewerIsAuthor = false, gallerySlide = 0, onBack, menuOpen }) => {
  const p = post || {
    ...SAMPLE_POSTS[0],
    is_authored_by_me: viewerIsAuthor,
    body: '凌晨 4:20 从 C1 出发,登顶时风不大,云海完整,远处可可西里山脊清晰可见。\n下撤的路结了一层薄冰,新雪覆盖,走得比上去慢。\n带了双层靴是对的。',
  };
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%', position: 'relative' }}>
      <StatusBar />
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', justifyContent: 'space-between' }}>
        <IconButton round onClick={onBack}><PTIcons.back /></IconButton>
        <div style={{ fontSize: 13, fontWeight: 600, color: PTColors.fg }}>{p.author.name}</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <AuthorStrip author={p.author} time={p.time} evidence={p.evidence} faintReviewed={viewerIsAuthor} />
      </div>

      {/* Mountain bind card — larger reference */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
          borderRadius: 14, padding: 10, display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 12, alignItems: 'center',
        }}>
          <div style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', border: `1px solid ${PTColors.outline}` }}>
            <PhonePlaceholder h={60} tone="alpine" label="" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.06em', textTransform: 'uppercase' }}>来自</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: PTColors.fg, marginTop: 3 }}>{p.bound_mountain.name}</div>
            <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>{p.bound_mountain.region}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700, color: PTColors.success, fontVariantNumeric: 'tabular-nums' }}>
              {p.activity_stats.alt.toLocaleString()}<span style={{ fontSize: 10, color: PTColors.fg2, marginLeft: 2 }}>m</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginTop: 6 }}>
              <path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Body */}
      {p.body && (
        <div style={{ padding: '18px 20px 0' }}>
          <PostBody text={p.body} full />
        </div>
      )}

      {/* Body closer (Fix 4) — hairline + 山峰 · 记录来源 · 发布时间 inline */}
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ height: 1, background: PTColors.outline, opacity: .55 }} />
        <div style={{
          marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 11, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace",
          fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap',
        }}>
          <button style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            color: PTColors.fg, fontSize: 11, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace",
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            {p.bound_mountain.name}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span style={{ color: PTColors.outline }}>·</span>
          <span>{EVIDENCE_TIERS[p.evidence]?.label || '未标记'}</span>
          <span style={{ color: PTColors.outline }}>·</span>
          <span>{(p.time === '昨天' || p.time === '2 小时前') ? '2026·04·22' : p.time}</span>
        </div>
      </div>

      {/* Media region (Fix 3) — photos OR route preview fallback */}
      {p.media && p.media.length > 0
        ? <GalleryFullBleed media={p.media} index={gallerySlide} />
        : (
          <div style={{ padding: '20px 16px 0' }}>
            <RoutePreviewBlock mountain={p.bound_mountain} />
          </div>
        )}

      {/* Activity stat block — 2x2 substantial */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.1em', textTransform: 'uppercase', paddingBottom: 10 }}>这次山行</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <DetailStat label="海拔 m" value={p.activity_stats.alt.toLocaleString()} accent />
          <DetailStat label="距离 km" value={p.activity_stats.dist_km} />
          <DetailStat label="爬升 m" value={p.activity_stats.climb_m.toLocaleString()} />
          <DetailStat label="用时" value={p.activity_stats.duration} />
        </div>
      </div>

      {/* Author-only: link to private Activity */}
      {viewerIsAuthor && (
        <div style={{ padding: '18px 16px 0' }}>
          <button style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,.03)', border: `1px dashed ${PTColors.outline}`,
            color: PTColors.fg, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}>
            <span>查看活动详情</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: PTColors.fg2, fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>
              仅自己可见
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          </button>
        </div>
      )}

      {/* Spacer for sticky interaction footer */}
      <div style={{ height: 92 }} />

      {/* Sticky interaction footer (Fix 2) */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: PTColors.bg, borderTop: `1px solid ${PTColors.outline}`,
      }}>
        <InteractionFooter post={p} sticky />
      </div>
      {menuOpen && <PostMenuSheet isMine={viewerIsAuthor} anchor="footer" />}
    </div>
  );
};

const DetailStat = ({ label, value, accent }) => (
  <div style={{
    background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
    borderRadius: 12, padding: '10px 10px',
  }}>
    <div style={{ fontSize: 9, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 17, fontWeight: 700, color: accent ? PTColors.success : PTColors.fg, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{value}</div>
  </div>
);

const DetailLikeButton = ({ liked }) => (
  <button style={{
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', borderRadius: 999,
    background: liked ? 'rgba(110,231,161,.12)' : PTColors.surface,
    border: `1px solid ${liked ? 'rgba(110,231,161,.3)' : PTColors.outline}`,
    color: liked ? PTColors.success : PTColors.fg, fontSize: 13, fontWeight: 600,
    fontFamily: 'inherit', cursor: 'pointer',
  }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? PTColors.success : 'none'}>
      <path d="M12 20.5s-7.4-4.6-9.4-9.5C1.5 8 3.5 5 6.6 5c1.9 0 3.6 1 4.4 2.7C11.8 6 13.5 5 15.4 5 18.5 5 20.5 8 19.4 11c-2 4.9-9.4 9.5-9.4 9.5h2z" stroke={liked ? PTColors.success : PTColors.fg} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
    {liked ? '已点赞' : '点个赞'}
  </button>
);

const GalleryFullBleed = ({ media, index = 0 }) => (
  <div style={{ marginTop: 18, position: 'relative' }}>
    <div style={{ aspectRatio: '4/3', overflow: 'hidden', position: 'relative' }}>
      <PhonePlaceholder h={281} tone={['alpine','ridge','dawn','glacial'][index % 4]} label="" />
      {/* Counter only — dots removed (this round) */}
      {media.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12,
          padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)',
          fontSize: 11, color: PTColors.fg, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {index + 1} / {media.length}
        </div>
      )}
    </div>
  </div>
);

// Variants
const CommunityDetailViewerOther = () => <CommunityDetailScreen viewerIsAuthor={false} />;
const CommunityDetailViewerAuthor = () => <CommunityDetailScreen viewerIsAuthor={true} menuOpen />;
const CommunityDetailMultiImage = () => (
  <CommunityDetailScreen viewerIsAuthor={false} gallerySlide={1} post={{ ...SAMPLE_POSTS[2], media: [{},{},{}], body: '九月初的大峰,植被还没全黄。轨迹交给系统,人去看雪。\n能见度好,一路看到二峰三峰。' }} />
);
const CommunityDetailTextOnly = () => (
  <CommunityDetailScreen viewerIsAuthor={false} post={{ ...SAMPLE_POSTS[4], media: null }} />
);

// ─────────────────────────────────────────────────────────────────────────────
// Curated module — embedded in Mountain Detail
// ─────────────────────────────────────────────────────────────────────────────

const CuratedPostCard = ({ post }) => {
  const hasMedia = post.media && post.media.length > 0;
  return (
    <div style={{
      background: PTColors.surface, border: `1px solid ${PTColors.outline}`,
      borderRadius: 12, padding: '12px 14px 12px 16px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Distinctive 2px left accent — the only place in the product using it */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
        background: 'rgba(110,231,161,.4)',
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: hasMedia ? '1fr 60px' : '1fr', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          {/* Author — small */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar size={32} name={post.author.name} tone={post.author.tone} />
            <span style={{ fontSize: 11, fontWeight: 600, color: PTColors.fg }}>{post.author.name}</span>
          </div>
          {/* Body — always shown, max 3 lines */}
          <div style={{
            marginTop: 10, fontSize: 13, color: PTColors.fg, lineHeight: 1.6,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{post.body}</div>
          {/* Stats — denser horizontal */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${PTColors.outline}` }}>
            <ActivityStatStrip stats={post.activity_stats} dense />
          </div>
        </div>
        {hasMedia && (
          <div style={{ width: 60, height: 80, borderRadius: 8, overflow: 'hidden', border: `1px solid ${PTColors.outline}` }}>
            <PhonePlaceholder h={80} tone="dawn" label="" />
          </div>
        )}
      </div>
    </div>
  );
};

const CuratedCommunityModule = ({ posts = [], totalCount }) => {
  if (!posts || posts.length === 0) return null;
  return (
    <>
      <div style={{ padding: '18px 20px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: PTColors.fg }}>山友怎么说</div>
        <div style={{ fontSize: 12, color: PTColors.fg2, marginTop: 4 }}>精选自这座山的山友圈记录</div>
      </div>
      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {posts.map(p => <CuratedPostCard key={p.id} post={p} />)}
      </div>
      {totalCount > 3 && (
        <div style={{ padding: '12px 20px 0' }}>
          <button style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: PTColors.fg, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            看更多山友记录
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={PTColors.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// In-context Mountain Detail frames — show module embedded between sections
// ─────────────────────────────────────────────────────────────────────────────

const MountainDetailWithCurated3 = () => (
  <MountainDetailContextFrame curated={SAMPLE_POSTS.slice(0, 3).map(p => ({...p, body: CURATED_BODIES[p.id] || p.body }))} totalCount={7} />
);
const MountainDetailWithCurated1 = () => (
  <MountainDetailContextFrame curated={[{ ...SAMPLE_POSTS[2], body: CURATED_BODIES['p3'] }]} totalCount={1} />
);
const MountainDetailWithCurated0 = () => (
  <MountainDetailContextFrame curated={[]} totalCount={0} showHiddenHint />
);

// Curated bodies are typically shorter, opinionated — admin selects
const CURATED_BODIES = {
  'p1': '凌晨从 C1 出发风很小,云海完整,但下撤路新雪覆盖薄冰,走得比上去慢。带双层靴是对的。',
  'p2': '从大本营到登顶 5 小时,雪况不错,但接近顶峰前要注意右侧那段冰裂。',
  'p3': '九月初植被还没全黄,但能见度极好。一路看到二峰三峰,适合第一次走 5000+。',
};

// Composite frame: render condensed version of Mountain Detail with Curated section in correct slot
const MountainDetailContextFrame = ({ curated, totalCount, showHiddenHint }) => (
  <div style={{ background: PTColors.bg, minHeight: '100%' }}>
    <StatusBar />
    {/* Faint hero stub */}
    <div style={{ position: 'relative', height: 120, background: 'linear-gradient(180deg, rgba(60,70,80,.8) 0%, rgba(18,20,22,.96) 100%)', display: 'flex', alignItems: 'flex-end', padding: '12px 16px' }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: PTColors.fg }}>玉珠峰</div>
        <div style={{ fontSize: 11, color: PTColors.fg2, marginTop: 2 }}>青海·格尔木</div>
      </div>
    </div>

    {/* Section above (faint) — 关键点位与风险 */}
    <div style={{ padding: '14px 16px 0', opacity: .55 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>关键点位与风险</div>
      <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 12, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, fontSize: 12, color: PTColors.fg, lineHeight: 1.7 }}>
        大本营 4,280m · C1 高营地 5,100m · 冰雪过渡带 5,800m · 山顶 6,178m
      </div>
    </div>

    {/* The module — or absence */}
    {showHiddenHint ? (
      <div style={{ margin: '18px 16px 0', padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,.02)', border: `1px dashed ${PTColors.outline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 10, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.16em', textTransform: 'uppercase' }}>· 模块缺席 ·</span>
        <span style={{ fontSize: 12, color: PTColors.fg2 }}>无精选时整段不渲染,直接到天气参考</span>
      </div>
    ) : (
      <CuratedCommunityModule posts={curated} totalCount={totalCount} />
    )}

    {/* Section below (faint) — 天气参考 */}
    <div style={{ padding: '20px 16px 30px', opacity: .55 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PTColors.fg2, letterSpacing: '.08em', textTransform: 'uppercase' }}>天气参考</div>
      <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 12, background: PTColors.surface, border: `1px solid ${PTColors.outline}`, fontSize: 12, color: PTColors.fg, lineHeight: 1.7 }}>
        周五 -4° · 周六 -2° · 周日 -9° · 周一 -11° · 周二 -3°
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Card-variant composite (frame 5) — multi-state showcase on one phone
// ─────────────────────────────────────────────────────────────────────────────

const CommunityCardVariants = () => {
  const text1 = { ...SAMPLE_POSTS[1] }; // text + 1 photo
  const text3 = { ...SAMPLE_POSTS[2] }; // text + 3 photos
  const textOnly = { ...SAMPLE_POSTS[4] }; // text only
  const liked = { ...SAMPLE_POSTS[3], likedByMe: true, likes_count: 90 }; // liked
  const mine = { ...SAMPLE_POSTS[1], is_authored_by_me: true };
  return (
    <div style={{ background: PTColors.bg, minHeight: '100%' }}>
      <StatusBar />
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: PTColors.fg }}>卡片状态</div>
        <div style={{ fontSize: 10, color: PTColors.fg2, marginTop: 4, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.12em', textTransform: 'uppercase' }}>5 个变体 · 同一组件</div>
      </div>
      <div style={{ padding: '12px 14px 30px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <VariantTag>文本 + 1 图</VariantTag>
        <CommunityCard post={text1} />
        <VariantTag>文本 + 3 图(非对称网格)</VariantTag>
        <CommunityCard post={text3} />
        <VariantTag>纯文本</VariantTag>
        <CommunityCard post={textOnly} />
        <VariantTag>已点赞</VariantTag>
        <CommunityCard post={liked} />
        <VariantTag>自己的发布 · 菜单展开</VariantTag>
        <CommunityCard post={mine} menuOpen />
      </div>
    </div>
  );
};
const VariantTag = ({ children }) => (
  <div style={{ fontSize: 9, color: PTColors.fg2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.16em', textTransform: 'uppercase', paddingLeft: 4 }}>· {children}</div>
);

Object.assign(window, {
  // Atoms (exported for handoff demos)
  MountainBindRow, ActivityStatStrip, LikeButton, CommunityCard, CuratedPostCard, CuratedCommunityModule,
  // Feed
  CommunityFeedScreen, CommunityFeedScreenTop, CommunityFeedScreenEmpty, CommunityFeedScreenLoading, CommunityFeedScreenWithMenu,
  CommunityCardVariants,
  // Detail
  CommunityDetailScreen, CommunityDetailViewerOther, CommunityDetailViewerAuthor,
  CommunityDetailMultiImage, CommunityDetailTextOnly,
  // Mountain Detail with module
  MountainDetailWithCurated3, MountainDetailWithCurated1, MountainDetailWithCurated0,
});
