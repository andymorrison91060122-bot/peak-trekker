# Activity Detail v2 + Archive v2 — Handoff

Base width **375px**. Tokens: see `../../colors_and_type.css`.

---

## 1. Activity Detail v2 (`ActivityDetailV2.jsx`)

**Purpose.** Private mountain-trip archive entry — facts + a small amount of memory. Not a community post, not a dashboard.

### Content hierarchy (full state)
1. Hero photo 320px (realistic, bleeds under status bar) — chips: `● 已登顶` + `一次山行`; title 26/800 + mono date · region.
2. **Summit reached card** — bordered success tint; `登顶海拔 / 6,178m (mono, 36/800)` left, `登顶时间 / 13:24` right.
3. Key-data row — 3 cells: 距离 km · 爬升 m · 用时 (mono 16/700, each cell radius 12).
4. Route · 海拔剖面 — line + gradient area, summit marker with guide line and pulse ring. Right caption `min → max`.
5. 照片 — 2-col grid, square ratio, radius 12, mono corner label (起点 / C1 / 山顶 / 回营).
6. 手记 — neutral card, 14/700 serif-ish note, `仅自己可见` footer + edit link. Tap opens inline editor.
7. 留证 strip — success (confirmed) / warn (partial or manual).
8. 返回我的山行档案 — single row card → Archive.
9. Sticky bottom bar — `发布到山友圈` (secondary, auto) + **`分享这次山行`** (primary).

### Fallback state changes
- Hero: `默认封面` chip top-right; tone=`slate`; chip row shows `● 未登顶`.
- Summit card replaced by **最高海拔 card** (white fg, not success): `4,980m` + `C2 折返` (warn mono).
- 照片 section becomes dashed empty card with `补传照片` secondary.
- 手记 becomes dashed "写一段给自己的话" button.
- ProofStrip = `partial`.
- Route snapshot still present — it's the one thing we always have.

### Component inventory
`ActivityTopBar`, `ActivityHero`, `SummitReached`, `KeyDataRow`/`KeyDataCell`, `RouteSnapshot`, `PhotoStrip` (+ fallback), `MemoryNote` (+ empty), `ProofStrip` (3 modes), `BackToRecords`, `ActivityBottomBar`, `SectionHead`, `Chip`, `PhonePlaceholder`, `PrimaryButton`, `SecondaryButton`, `IconButton`, `StatusBar`, `PTIcons`.

### Tokens
- Radius: hero `0` (bleed) · cards `14` · small stat cells `12` · chips `999`.
- Spacing: section padding `18 16 0`; bottom-bar padding `12 16 26`.
- Type: mountain name 26/800 · summit altitude 36/800 mono success · stat values 16/700 mono · section head 11/700 uppercase fg2 .1em.
- Color: success `#6EE7A1` reserved for summit + proof-confirmed + route line. Warn `#F59E0B` for partial / unreached / fallback.
- Shadow: none. Flat surfaces, outline-only hierarchy.

### Interaction
- Photo tap → lightbox (out of scope).
- 手记 tap → inline editor modal (max 400 chars, 仅自己可见 by default).
- ProofStrip is display-only here; 补证 flow lives elsewhere.
- Bottom bar is always present; `发布到山友圈` posts a shareable summary (not photos) — opt-in per activity.
- Back-to-records row uses the same transition as Profile → Archive.

### Dev handoff
- Props: `{ activity, onBack, onShare, onPublishCommunity, onOpenRecords, onEditNote }`.
- `RouteSnapshot` takes `data: number[]` (elevation samples, ~13 points ideal). If <8 samples, hide the chart and show a single mono `min → max` line instead (not implemented in mock; add when data contract lands).
- Summit vs fallback is purely driven by `activity.summit` + `activity.photos.length` + `activity.note`. No separate route.
- Never show a map on this screen. Route = elevation profile, not cartography.

---

## 2. Archive / My Records v2 (`ArchiveV2.jsx`)

**Purpose.** Private archive of 一座一座 real mountain trips. More important than My Shares.

### Content hierarchy (populated)
1. TopBar — back, `我的山行档案`, more.
2. **Identity card** — avatar + name + province pin + license chip; divider; 3 summary stats (山行 · 登顶 · 最高 m, last one accent success).
3. Filter tabs (pill row) — 全部 · 登顶 · 已留证 · 未留证, each with mono count.
4. **Year dividers** — mono 22/800 year numeral + `N 次山行` right.
5. Trip cards — full-bleed photo 140px + summit chip + proof chip + name/date/region + elevation (mono success, right) + 3 mini stats under photo (距离/爬升/用时).
6. End marker `· 档案结束 ·`.

### Empty state changes
- Identity card keeps avatar + name + province, drops summary stats, adds `新人` chip.
- Center column: calm `0 / 0` eyebrow, `档案还没有一次山行`, sub copy.
- Two CTAs: **去找一座山** (primary) + `把以前的山行带回来` (secondary).
- Footer copy reinforces privacy.

### Component inventory
`ArchiveHeader`, `IdentityCard` / `IdentityCardEmpty`, `SummaryStat`, `FilterTabs`, `YearDivider`, `TripCard`, `MiniStat`, `PrimaryButton`, `SecondaryButton`, `Chip`, `PhonePlaceholder`, `PTIcons`.

### Tokens
- Radius: identity + trip cards `14` · chip pill `999` · filter pill `999`.
- Spacing: identity padding `16 16`; filter row padding `18 16 0`; card gap `12`; year divider `22 20 10`.
- Type: name 16/700 · summary stat value 20/700 mono (accent for max alt) · year 22/800 mono · trip title 17/700 · trip altitude 19/800 mono success · mini stat 13/700 mono.
- Color: success reserved for elevation + `● 登顶` + `● 留证 (confirmed)`; warn for 未登顶 / 部分留证; neutral chip for 补签.

### Interaction
- Filter tabs filter in place (no page reload); counts always reflect total (unchanged by current filter — spec §10.2).
- Tap trip card → `ActivityDetailV2`. Long-press (future) → quick actions (分享 / 发布 / 删除).
- Scroll is vertical only. No horizontal photo carousel inside cards — keeps archive feel.
- Year dividers stick on scroll (sticky top; not implemented in mock, recommended for prod).

### Dev handoff
- Props: `{ user, trips, onBack, onOpenTrip, onFindMountain, onBringBack }`.
- `TRIPS` is sorted desc by date; grouping by year is derived from `date` string `"YYYY·MM·DD"`.
- Summary stat 3 is **max elevation across trips** (not sum/avg). Do not change — elevation is the product's highest-priority signal and must stay singular.
- Trip card altitude is **the trip's highest point**, regardless of summit status.
- Archive intentionally has no sharing controls — share happens from ActivityDetail. Keeps the archive 克制.

---

## Non-goals (both screens)
- No comment feed, like count, or social chrome.
- No training zones, HR curves, pace graphs, VO2 estimates.
- No badge wall. No leaderboard. No ranking against friends.
- No map navigation. Route = elevation profile.
- No auto-generated "your year in summits" marketing reel.
