# Peak Trekker · Mobile UI Kit — Handoff Notes

Base width **375px**. All values are token-first; see `../../colors_and_type.css` for CSS vars.

Shared tokens used below:
- Color: `--color-surface` `#121416`, `--color-surface-variant` `#23272C`, `--color-surface-elevated` `#282D33`, `--color-outline` `#2F353B`, `--color-on-surface` `#F5F7F8`, `--color-on-surface-variant` `#8D959B`, `--color-primary` `#22C55E`, `--color-success` `#6EE7A1`, `--color-warning` `#F59E0B`, `--color-error` `#EF4444`.
- Type: sans = Manrope + CJK system stack. Mono = IBM Plex Mono (stats + timestamps only).
- Radius: `xs 6 · sm 8 · md 12 · lg 14 · xl 16 · pill 999`.
- Spacing: 4px base; `4 · 8 · 12 · 16 · 20 · 24 · 32 · 48`.
- Elevation: `shadow-soft 0 16 32 rgba(0,0,0,.18)` (cards) · `shadow-float 0 18 36 rgba(0,0,0,.28)` (bottom sheet only).

---

## 1. Mountain Detail (`MountainDetailScreenV2.jsx`)

**Purpose.** Decision page — *这座山适不适合你*. Not a brochure.

### Hierarchy
1. Hero photo (300px, realistic, minimal scrim)
2. Floating back / share / more controls (top-left, top-right)
3. Summit chips: license level + route line
4. Mountain name (display-l) + region pin
5. **4-stat row**: 海拔 m (accent) → 距离 km → 爬升 m → 时长
6. 这座山适不适合你 (decision rows with check/warn glyph)
7. 关键点位与风险 (waypoint list — altitude mono, status dot, name, desc)
8. 天气参考 (5-day strip, light decision support only)
9. Fixed bottom CTA: 查看路线 (secondary) + 开始记录 (primary)

### Component inventory
`StatusBar`, `IconButton (round)`, `Chip`, `StatTile`, `SectionHeader`, `DecisionRow`, `Waypoint`, `PrimaryButton`, `SecondaryButton`, `PhonePlaceholder`.

### Spacing / type / radius
- Page padding: `0` (hero bleeds) → `16px` below hero.
- Section spacing: `18px 20px 10px` for section headers; `16px` gutters for cards.
- Hero title: `26/30, weight 800, letter-spacing -.01em`.
- Stat tiles: radius `10`, padding `10/10`, mono digits 16/20 weight 700.
- Decision row / waypoint row: padding `12/14`, `1px outline` divider between rows.
- Bottom CTA bar: padding `12 16 26`, gradient scrim, two columns `auto 1fr`.

### Key states
- **Level gate failed** → first DecisionRow becomes tone=`warn`; secondary CTA becomes `去看升级路径`; primary CTA (开始记录) disabled at 0.45 opacity.
- **Season window closed** → second DecisionRow becomes `warn`; chip `非窗口期` appears next to 进阶线.
- **No weather data** → weather section hidden entirely (§10.4 — no empty shells).
- **No waypoints authored** → section hidden entirely.
- **Guest** → primary CTA reads `登录后开始记录`, routes to login with return.
- **Locked mountain for user's level** → overlay on hero with warn chip + upgrade CTA.

### Interaction notes
- Hero scroll parallax: disabled. Fixed hero height, standard scroll only.
- Back + share + more stay absolutely positioned over hero; dissolve into TopBar on scroll past 280px (future enhancement, not in v2).
- Tapping a waypoint opens the route sheet (out of scope for v2 mock).
- Tapping weather row opens the weather sheet — still decision-support, never a full weather product.

### Dev handoff
- Props: `{ mountain: { name, region, alt, dist, climb, dur, level, line, tone, season, license } }`, `onBack`, `onRecord`.
- Elevation MUST be rendered via `Intl.NumberFormat('en-US')` for the mono comma.
- Do not render a glowing hero mountain illustration. Use real photo when present; fall back to `PhonePlaceholder tone="alpine|slate|dusk|dawn"`.
- One primary only. If you add more CTAs, demote older ones to secondary.

---

## 2. Home / Intent Split (`HomeScreenV2.jsx`)

**Purpose.** 意图分流. Help the user pick one of three paths without a Explore-list-first mindset.

### Hierarchy
1. Quiet header: 今天 / 想去哪座山。 + avatar
2. **Locked target card** (if present): photo hero + chip + name + alt + countdown + (详情 / 出发前复核) CTAs
3. 接下来 section
4. Three equal-weight intent rows:
   - `01 · 去找下一座山` (primary destination) → Explore
   - `02 · 把这次结果带回来` → Record / 补签 / 留证
   - `03 · 我的 N 次山行` → Profile
5. Tab bar at bottom

### Component inventory
`StatusBar`, `Chip`, `PhonePlaceholder`, `PrimaryButton`, `SecondaryButton`, `IntentRow`, `TabBar`.

### Spacing / type / radius
- Header padding `6 20 16`; title `22/26, weight 700`; eyebrow `12, fg2`.
- Locked card: radius 16, hero 140px, bottom padding `10 14`.
- Intent rows: radius 14, padding `14 14`, three columns `42px 1fr auto`, gap `12`.
- Section label: 11px / letter-spacing .08em / uppercase / fg2 / weight 700.

### Key states
- **No locked target** → Locked card hides; 接下来 becomes the first block. The first IntentRow (`去找下一座山`) gains the primary chevron accent.
- **New user (0 山行)** → IntentRow `03` reads `开始你的第一次山行` and routes to Explore instead of Profile.
- **Offline** → Locked card keeps cached photo; countdown replaced with `最近缓存时间`.
- **Target today (countdown = 0)** → Locked card primary CTA becomes `开始记录`.

### Interaction notes
- Tapping the Locked card hero → Mountain Detail.
- Tapping Locked `详情` → Mountain Detail. Tapping `出发前复核` → re-runs the decision checks on Mountain Detail (scroll anchor).
- Intent rows have full-width hit targets (min 72px); chevron is decorative.
- No bottom-sheet promotion for Explore — Home is not Explore.

### Dev handoff
- Props: `{ locked?, user, onGoExplore, onGoRecord, onGoProfile, onTab }`.
- Greeting is static (`今天` / `想去哪座山。`) — do not inject time-of-day variants; keeps copy 克制.
- Do NOT add: team-up widget, leaderboard, feed preview, race-prep tiles.

---

## 3. Share Editor (`ShareScreenV2.jsx`)

**Purpose.** 水印相机 style — produce a shareable image in three decisions: template, main visual, fields.

### Hierarchy
1. TopBar with back + `保存` text action (top-right)
2. **Preview** — always 4:5 aspect (Instagram-safe), fixed width
3. 模板 switcher (3 options: 经典 / 海拔卡 / 极简)
4. 主画面 switcher (3 options: 照片 / 地图 / 海拔卡)
5. 显示字段 toggles (5 rows: 海拔 / 距离 / 时长 / 日期 / 地点)
6. Fixed primary CTA: `保存到相册`

### Component inventory
`StatusBar`, `TopBar`, `FieldLabel`, `Toggle`, `PrimaryButton`, `PhonePlaceholder`, `MapVisual`, `AltitudeCardVisual`.

### Spacing / type / radius
- Preview: radius 16, 1px outline, 20px gutter.
- Template buttons: 52px tall, radius 10, 1px outline, selected state = 1.5px primary border.
- Visual buttons: 48px tall, same pattern.
- Toggle rows: padding `12 14`, track `40×22` pill, thumb 18px.
- Bottom CTA: padding `12 20 26`, gradient scrim.

### Templates
- **经典** — bottom-left stacked; name + elevation (accent) + mono metadata row.
- **海拔卡** — top/bottom framing + giant `6178` numeral + `METERS · ALTITUDE` caption.
- **极简** — date eyebrow + one-line name + elevation inline.

### Key states
- **No elevation available** → `海拔` toggle disabled + secondary-text hint.
- **Visual = 地图** but no track recorded → `地图` button disabled; tapping it shows warn toast `还没有轨迹可用`.
- **Activity still in draft** → Top-right `保存` replaced with `完成草稿后再生成` (disabled text).
- **All fields off** → template falls back to minimum set: name + PEAK TREKKER wordmark only.
- **Long mountain name (>8 chars)** → font-size steps down from 24 → 20 → 18.

### Interaction notes
- Live preview updates on every toggle/switch (no commit step).
- `保存到相册` renders the preview via canvas snapshot (implementation: html-to-image in prod) and writes to 相册 with system prompt.
- No drag-to-reposition, no free-form text layer, no sticker picker — keeps Share 简单传播 not 编辑器.
- `保存` text action (top-right) = save draft; `保存到相册` bottom = export.

### Dev handoff
- Props: `{ activity, onBack, onSave }`.
- Templates live in a pure-function registry (`TEMPLATES[id](activity, fields)`). Adding a new one is one file, not a plugin system.
- Never open a full editor modal from this screen.
- Canvas export size: 1080 × 1350 (4:5, IG-safe).

---

## Activity card (refinement summary)

The Activity card used in `ActivityDetailScreen` and `ProfileScreen` lists now follows a structured product layout:

- Realistic photo placeholder (no glow). Neutral slate/alpine/dusk/dawn tones only.
- Top-left chip: `● 已登顶` (success tone) or `进行中` (warn) or `草稿` (neutral).
- Title: mountain name (17/700), then date (mono, fg2).
- 4-stat row: 海拔 (accent mono) → 距离 → 爬升 → 时长.
- Radius 14, 1px outline, `shadow-soft` on elevated containers only.
- No cinematic gradients beyond the standard 25→85% bottom scrim for photo legibility.
