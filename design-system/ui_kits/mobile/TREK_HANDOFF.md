# Trek v2 — Live recording, handoff

Trek is the most state-dense screen in Peak Trekker. It is the live test of the product subject "one real mountain trip." These notes are production-level; follow them as written.

## Layout skeleton (all live states)

```
┌─ StatusBar (44)
├─ TopBar         [back] [REC chip · live/paused] [more]      56
├─ MountainContext (icon · name · 区域 · 目标海拔 · 线路)        60
├─ ElevationHero    ◎ 当前海拔 · 56px mono · AltitudeBar        132
├─ TrekMetricRow    dur · dist km · climb m                    84
├─ TrekMiniMap      160px ref-only map                         176
└─ BottomActionBar  [secondary] [primary] gradient mask        92
```

Total ~644px in viewport. No overflow. Every number tabular, mono.

## Elevation is the hero

- `ElevationHero.value` is the ONLY number rendered at 56px. Everything else ≤ 20px.
- Color: `--pt-success #6EE7A1`. This is the only screen where a mono numeral gets the success color.
- AltitudeBar reuses the shared primitive from Primitives.jsx. `max` is the mountain's peak height, not 8848.
- Subtext below bar: `距峰顶 {Δ}m · 目标 {peak}m` — always render both values; never collapse.
- Source of truth priority: GPS → barometer → last known. Label the source in `sub` when NOT GPS ("气压计读数").

## Map is reference only

`TrekMiniMap` is 160px tall, contour-only, dotted route, one current-position dot, one summit glyph. No interactive pan/zoom, no street labels, no compass rose. Chip `地图仅作参考` is always visible. GPS-weak state overlays an amber chip but does not hide the map.

## One primary CTA per state

| State | Secondary | Primary |
|---|---|---|
| pre-start | — | **开始记录** |
| live | 暂停 | **记一笔** (quick note / photo) |
| paused | 结束并保存 | **继续记录** |
| gpsWeak | 暂停 | 记一笔 (unchanged — never block the user on GPS alone) |
| nearSummit | 暂停 | **登顶留证** (camera icon) |
| summitConfirmed | 继续记录 | **结束并生成活动** |
| noMountain | 直接记为无归属 | **去 Explore 选山** |
| restricted | 换一座山 | **查看升级路径** |
| permissionDenied | 手动补签 | **去系统设置开启** |
| loading | — | — (no actions until data resolves) |

Primary is `--pt-primary #22C55E` on 46px pill. Ghost + linear-gradient mask above action bar prevents text clash when content scrolls behind it.

## State specs

### pre-start
- Copy: `即将开始` / `准备一次真实山行`
- Preflight card: GPS · offline map cache · battery. All ✓ → green check. Any ✗ → warn icon but still allow start.
- Footnote: `开始后屏幕常亮 · 自动记录轨迹与海拔`

### live
- RecDot pulses 1.4s ease-out. Never faster.
- `ElevationHero` updates at 1Hz max.
- Map `progress` tweens; never jumps.

### paused
- ElevationHero `sub`: `记录已暂停 · 数据保留` (tells user data won't be lost).
- Same layout — only chip text and CTA swap. Zero layout shift.

### gpsWeak
- Inline warn banner `GPS 信号弱 · 海拔仍来自气压计 · 距离与地图会延迟更新`.
- Distance metric renders `—` (em-dash) — not 0, not stale.
- Map gets `weak` prop: 0.4 opacity tiles + amber chip top-right.
- Do NOT pause automatically; user decides.

### nearSummit (proximity trigger: Δ ≤ 50m from peak)
- Inline success banner `接近峰顶 · 距顶 38m`.
- ElevationHero `pulse` on — subtle text-shadow ring, no glow.
- CTA swaps to `登顶留证` (camera icon). This is the product moment.

### summitConfirmed
- Dedicated layout. `已登顶` chip + mountain name + 6178m mono 48px.
- Timestamp in mono with `·` separators: `2024·10·07 · 13:24`.
- "留证窗口 10 分钟" card — tells user recording continues while they frame the photo.
- Primary CTA `结束并生成活动` flows to Activity Detail.

### noMountain (empty state)
- Subject is the constraint: *"Peak Trekker 的记录以一座真实的山为主语。先选一座，再开始记录。"*
- Primary: pick a mountain. Tertiary escape hatch: 直接记为无归属 · 事后再认领.

### restricted (insufficient license / level gate)
- Not a soft nudge — hard block. Red-outlined card.
- Copy: `这是硬性限制，不是建议。`
- Always show the path forward: `下一步：完成任一 5000m+ 山行…`

### permissionDenied
- Non-blocking — offer manual entry as tertiary (`手动补签（不自动记录）`).
- Reassurance: `仅在记录期间使用，不做后台追踪。`

### loading (skeleton)
- Matches live layout exactly — same heights, same row count. No spinners.
- 1.4s shimmer, never faster.

## Component inventory (this file)

- `TrekShell` — full-bleed dark container, relative positioning for BottomActionBar.
- `TrekTopBar` — back · REC chip · more.
- `MountainContext` — tappable card, `onChange` swaps mountain.
- `ElevationHero` — big number · AltitudeBar · delta line. `pulse` variant.
- `TrekMetricRow` + `TrekMetric` — 3 tiles. Never add a 4th.
- `TrekMiniMap` — 160px contour + route + dot. `progress`, `weak`, `offline` props.
- `RecDot` — pulsing status light.
- `BottomActionBar` — sticky, gradient mask, 2-column grid.
- `InlineBanner` — warn / success / error; always inside content padding, never edge-to-edge.
- `PreflightRow` — preflight check list row.
- `SkeletonRow` — shimmer primitive for loading.

## Tokens

| Token | Value |
|---|---|
| spacing | 4, 8, 12, 16 (default content), 20, 28 |
| radius | 10 (metric tiles, small), 12 (buttons / context card), 14 (inline cards), 16 (focus cards), 999 (chips / RecDot) |
| elevation hero type | 56 / 800 / tabular / `-0.02em` |
| metric type | 18 / 700 / tabular |
| label type | 10-11 / 600 / `.04–.08em` letter-spacing |
| banner type | 13 / 700 title, 11 / 400 sub |
| color `--pt-success` | `#6EE7A1` — elevation hero only |
| color `--pt-primary` | `#22C55E` — primary CTA only |
| color `--pt-warn` | `#F59E0B` — gpsWeak, permissionDenied, preflight warn |
| color `--pt-error` | `#EF4444` — restricted, REC dot |

## Interaction notes

- **Screen wake lock** — acquire on pre-start → start; release on paused, summitConfirmed, or app background.
- **Background recording** — must continue when screen off or app in background (OS capability required). A local notification keeps the user informed.
- **GPS state machine** — `good | weak | lost`. `weak` → banner + barometer label. `lost` → banner turns error tone, distance & map freeze, elevation continues from barometer.
- **Summit proximity trigger** — fires when haversine distance to peak ≤ 50m AND elevation within 30m of target, sustained 5s. Auto-dismiss if user descends ≥ 60m.
- **Summit confirmation** — 10-min window starts at first trigger. User can also confirm via primary CTA. Photo + timestamp attach to the activity.
- **Pause** — freezes metrics; does NOT stop location subscription (keeps GPS warm, faster resume).
- **Stop / save** — always produces an activity. Never discards data silently. If user explicitly discards, show one irrecoverable-confirm.
- **No-mountain escape hatch** — unassigned activity gets tagged `未归属`; user can claim later from Activity Detail.
- **Restricted** — client-side check is advisory only; server must enforce on activity submission.

## Developer handoff

- All state props are derived from a single `recordingState` enum + `gpsQuality` + `proximityToPeak`.
- Persist every 10s to IndexedDB (web) / file (native). Crash recovery loads latest snapshot and shows a `继续上次记录?` banner on pre-start.
- Elevation samples: dedupe at 1m resolution; store `(ts, alt, src)` where `src ∈ gps | baro | fused`.
- Map tiles: pre-cache within 8km bounding box of selected mountain at Explore-time; never fetch on Trek.
- Never render Trek without a mountain in state — use `TrekNoMountain` as the fallback, not a modal.
- Accessibility: respect `prefers-reduced-motion` → disable RecDot pulse and shimmer.

## What Trek v2 deliberately does NOT do

- No turn-by-turn navigation.
- No analytics graphs (elevation profile, pace chart, HR zones). Those live in Activity Detail.
- No team tracking, no live sharing, no "race mode."
- No free poster editor — Share is a separate screen.
- No ads, no tips-of-the-day, no unrelated notifications.
