# Peak Trekker Design System

Peak Trekker (中文产品名：真山) is a mobile-first hiking / mountain-trip product for Chinese users. The core object is **one real mountain trip** — not navigation, not a social feed, not a poster editor.

> 产品主语：**我的一次真实山行**

The product helps a user:

1. Find a mountain worth going to (Explore + Mountain Detail as decision surfaces)
2. Decide whether it fits them (license level, difficulty, elevation, risk)
3. Record or bring back a real trip result (Trek / Record, incl. 补签 / 留证 for late arrivals)
4. Turn that trip into a personal **activity** (Activity Detail, the core asset layer)
5. Share it as a simple, traceable image (Share / 水印相机, not a poster editor)
6. Post it to 山友圈 (Community — activity-driven, not a social广场)
7. Archive long-term in Profile (private 山行档案馆, not a leaderboard wall)

**Elevation (海拔)** is the highest-priority signal and must be visible across Explore, Mountain Detail, Trek, Activity and Share.

## Sources

| Source | Path / Link | Access |
|---|---|---|
| Codebase (Next.js app) | `src/` (local mount) | `local_ls`, `local_read`, `local_grep` |
| Product docs | `docs/` (local mount) | same as above |
| Public assets | `public/` (local mount) | same as above |
| UI/交互规范 v0.2 | `source-docs/ui-interaction-spec.md` | project filesystem |
| Color debt registry | `source-docs/color-debt.md` | project filesystem |

The codebase is a Next.js 15 App Router project (`src/app/`, `src/components/`, `src/lib/`). Design tokens live in `src/app/globals.css`; component styles in `src/app/components.css`. Supabase is the backend. **There is no separate marketing site.** The one product surface is the mobile web app at 375px.

---

## Content Fundamentals

### Language
- **Chinese-first.** All user-facing copy is Simplified Chinese. English appears only in monospace stat glyphs (e.g. `km`, `m`, `h`) and a handful of developer-facing admin labels we do not design against.
- Pronouns: second person is rare. Copy speaks **around** the user (“这一次山行”, “把这次结果带回来”) rather than barking “You did this.” Never uses 你/您 casually — uses implied subject instead.
- No exclamation points. No emoji. No hype.

### Tone
Three adjectives: **克制 (restrained), 陪伴 (companionable), 户外 (outdoor)**. Copy should feel like a quiet hiking partner who trusts the user is an adult.

Allowed:
- 轻问候 at the top of Home (“今天，想去哪座山。”)
- 节点文案 at high-emotion moments (确认登顶、接近峰顶)
- 出发仪式感 for 锁定目标 (“锁定 玉珠峰 · 6178m”)

Forbidden (per §11.2 / §11.3 of the UI spec):
- Dev-speak in UI: `debug`, `qa`, `mock`, `seed`, `fallback`, `schema`, `pipeline`, `env`, `force`, `helper`, `local only`, `not implemented`, `todo`
- 热血/中二 openers: “燃起来”, “征服”, “王者”, “巅峰时刻” — Peak Trekker is not a race prep app
- Hard technical error language: “系统异常”, error codes exposed raw
- Over-promising: 实时天气, 专业导航, 精准定位

### Concrete copy examples (from the codebase + spec)

| Surface | Good | Rationale |
|---|---|---|
| Header tagline | `真实记录与分享` | States the product’s job, 6 chars |
| Tab bar labels | `探索 · 山行 · 出发 · 山友圈 · 我的` | Verb-first, single or two chars |
| Explore license chip | `中级及以上` / `无需执照` | User-readable level, not `license.required == intermediate` |
| Mountain card stat | `6,178m · 进阶线 · 中级及以上` | Altitude first, difficulty second, gate third |
| Weather block | `更新于 1 小时内 · 天气信息供出发参考` | Sets expectation, not a forecast product |
| Trek start | `开始记录 · 目标 玉珠峰` | Confirmation, not “Begin Workout” |
| Confirm 登顶 | `确认你已抵达峰顶？` | Checks the user, doesn’t celebrate for them |
| Share default | `把这次山行带回来` | Action as noun phrase, avoids “Share now” |
| Locked CTA | `需 中级 登山证 · 去看升级路径` | Explains why, then the out |
| Empty state | `还没有记录过山行。去 Explore 找一座。` | Two short sentences, one CTA |

### Numbers & units
- Altitude: `6,178m` (comma thousands separator, no space before m)
- Distance: `12.4km` (one decimal, no space)
- Duration: `6h` or `6h 30m` — no `hrs`, no colons
- Percent / gain: `爬升 1,240m`
- Coordinates / ranks: tabular-nums (IBM Plex Mono)

### Casing
Pinyin / English words inside Chinese copy keep original casing (`Peak Trekker`, `Explore`, `AllTrails`), but avoid them in primary UI — use the Chinese equivalent when one exists. Never SHOUTCASE.

---

## Visual Foundations

### Palette strategy
A **deep neutral stack** (surface / surface-variant / surface-elevated) layered under **one signal green** (`#22c55e`). That’s it. Errors are a single red; warnings a single amber; success a lighter green. Everything else is drawn from the 11 semantic tokens in `colors_and_type.css`. There is a substantial **color debt** registry (`source-docs/color-debt.md`) of legacy hex values (poster illustrations, admin panels, onboarding illustrations) — new work must not extend it.

- Main CTA and “real登顶” marks: `--color-primary #22c55e`
- On-primary text: near-black `#08120d` (not pure black — preserves warmth)
- Body text on dark: `#f5f7f8` (not pure white)
- Muted text: `#8d959b` — used for timestamps, units, secondary meta
- Outlines: `#2f353b` at 1px — always 1px, never 2px

### Type
- Display/body: **Manrope** (400 → 800). Substituted from the codebase’s existing Google-Fonts import. If a Chinese/CJK system stack is available (PingFang SC, Hiragino Sans GB, Microsoft YaHei) it is used inline.
- Mono: **IBM Plex Mono** (400/500/600). Used exclusively for numeric stats and the single `STATIC REFERENCE` map label.
- **No serif.** Peak Trekker is not a magazine.

### Backgrounds & imagery
- Full-bleed **real photographs** of mountains — never illustrations, never AI-styled renders in the decision path (AI fallback images are allowed only for missing 山峰 covers).
- Hero images use a 16:9 crop; detail hero is a 3:4 carousel.
- Imagery color vibe: cool, slightly desaturated, high contrast. No warm sunset filters across the board. Granola / morning-light images are fine on Activity covers where they came from the user.
- No repeating patterns, no hand-drawn textures, no blobs, no 3D marks.

### Gradients
Very restrained. Two legitimate gradients exist:
1. **Protection gradient** at the bottom of hero images: `linear-gradient(180deg, transparent, rgba(8,10,12,0.72))` — so overlaid white text stays legible.
2. **Altitude bar fill**: `linear-gradient(90deg, #16a34a, #6ee7a1)` — the only decorative gradient in the system.

No purple/blue gradients. No `conic-gradient` shine. No animated gradients.

### Transparency & blur
- Sticky top header and bottom tab bar: `rgba(18,20,22,0.84)` + `backdrop-filter: blur(18px)`.
- Modal overlay: `rgba(18,20,22,0.78)` + blur(14px).
- Chips on photos: `rgba(12,14,16,0.72)` — never more than ~70% opaque; the photo should still breathe through.

### Corner radii
| Use | Token | px |
|---|---|---|
| Small tags, altitude pill | `--radius-xs` | 6 |
| IconButton, small stat tile | `--radius-sm` | 8 |
| Buttons, inputs | `--radius-md` | 12 |
| Cards | `--radius-lg` | 16 |
| Hero image, large sheets | `--radius-xl` | 20 |
| Circular (avatars, dots, pills) | 50% / `--radius-pill` | — |

### Shadows
Two shadows only:
- `--shadow-soft: 0 16px 32px rgba(0,0,0,0.18)` — standard card elevation.
- `--shadow-float: 0 18px 36px rgba(0,0,0,0.28)` — bottom action bars, floating sheets.

No inner shadows. No green glow. No neon.

### Cards
- Background `--color-surface-variant`, border `1px solid --color-outline`, `--radius-lg`.
- Interior padding `--space-4`. Between cards `--space-3`. Nested card-in-card **forbidden** (§5.8).
- Hero cover cards may use `--radius-xl` and no border.

### Borders
Always `1px solid`. Color is either `--color-outline` (structural) or a semantic token at 22–26% alpha (accent / error / warning). Dashed borders only used in acceptance/dev UI (we ignore those).

### Layout rules
- Base width **375px**. Max content column **520px** (centered on tablet/desktop).
- Page padding **16px** (`--space-4`) on the outer edge.
- Header sticky. Bottom TabBar fixed with `env(safe-area-inset-bottom)`.
- One-column page flows; no dashboards.
- One primary CTA per visual level.

### Buttons (§5.6)
All heights are exactly **44px** (not 48, not 52 — the old `.primary-btn` at 52px is legacy).
| | Primary | Secondary | Tertiary |
|---|---|---|---|
| BG | `--color-primary` | `--color-surface-variant` | transparent |
| FG | `--color-on-primary` | `--color-on-surface` | `--color-on-surface-variant` |
| Border | none | optional 1px outline | none |
| Radius | 12 | 12 | 12 |

### Icon buttons (§5.7)
- 44×44 hit target, 20px icon. Shape `--radius-sm` (square) or 50% (circular). Transparent by default, surface-variant when actively showing state. Must icon-ize: back, close, share, edit, more, report, delete, download.

### Animation
- **Tap feedback**: `filter: brightness(.94)` + `translateY(0)` — 120–180ms.
- **Expand/collapse**: 180–240ms, cubic-bezier(0.2, 0.6, 0.2, 1).
- **Sheet in/out**: 220–320ms.
- **High-moment celebration** (登顶确认): 240–360ms, one bounce max. No particles, no looping glow.
- No scroll-linked parallax. No hero Ken Burns pan. No entrance staggers on cards.

### Hover vs press
Hover is mostly irrelevant (mobile), but on pointer devices we lift `translateY(-1px)` + slight bg shift. Press state is `brightness(.94)` and returns to rest — no scale-down bounce.

### Protection gradient vs capsule
- On photos with overlaid text (Mountain Detail hero, Activity card): protection gradient at bottom.
- On photos with small overlaid chips (difficulty, license): use **capsules** (`.pt-chip` on a tinted background at 72% opacity), not blanket gradients — keeps more of the photo visible.

### What we **don’t** do
- No bluish-purple gradients
- No emoji in the UI
- No “card with rounded corners + colored left border” accent motif
- No hand-rolled SVG mountains (we have real photos)
- No duotone photo treatments
- No glass / chrome / noise overlays on buttons
- No dashboards on the home page

---

## Iconography

Peak Trekker **does not ship an icon font**. All icons are **inline SVG** drawn directly in React components (`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>`), stroked at **1.8px**, round linecaps, round linejoins. Two-tone icons are allowed: the “primary” path uses `#6ee7a1` (active) / `#8d959b` (inactive), the “secondary” path uses `#22c55e` (active) / `#6b7280` (inactive).

Examples live in `src/components/layout/TabBar.tsx` (Explore / Prep / Trek / Community / Profile) and in the `IconButton` family under `src/components/ui/`.

- **No emoji** in any user-facing surface.
- **No unicode char icons** (no ▲ ✦ etc) — the one exception is `▲` in `.altitude-tag::before` which is a typographic flourish, not information.
- **No PNG icons.**
- Since there’s no icon font, when a new icon is needed and doesn’t exist in the repo, use **Lucide** (`lucide-react` / lucide CDN) — closest stroke-weight match. Flag the substitution.

Assets copied into `assets/`:
- `default-mountain-cover.png` — fallback for mountains with no photo
- `default-activity-cover.png` — fallback for activities with no user photo

No brand logo file exists in the codebase. The wordmark is rendered as text (`Manrope 700 "Peak Trekker"`) next to the tab-icon-style mountain glyph — see `AppHeader.tsx`. This design system treats that pairing as the logo.

**Font substitution flag:** the codebase loads Manrope + IBM Plex Mono from Google Fonts. No `.ttf`/`.woff` files were shipped in `public/`. If you need the exact weights bundled offline, please attach them or confirm we can keep CDN loading.

---

## Index

Root files:
- `README.md` — this file
- `SKILL.md` — agent skill manifest
- `colors_and_type.css` — all color + type tokens as CSS vars
- `assets/` — raster fallbacks (mountain + activity cover)
- `source-docs/` — verbatim copies of the UI spec and color debt
- `preview/` — small HTML cards that populate the Design System tab
- `ui_kits/mobile/` — the sole UI kit: Peak Trekker mobile
  - `index.html` — clickable prototype (Home → Explore → Mountain Detail → Trek → Activity → Share → Community → Profile)
  - `*.jsx` — factored components

There is only one product surface (the mobile app). No slides, no marketing site, no docs site.
