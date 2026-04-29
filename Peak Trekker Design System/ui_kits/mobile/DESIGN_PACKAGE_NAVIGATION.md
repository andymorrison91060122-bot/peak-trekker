# Peak Trekker · Design Package Navigation

**For implementers (Codex / human dev). Read this before implementing any UI from this design package.**

## What this package is

A design system + ~70 production-fidelity mobile screens for Peak Trekker. Mobile-only, dark-only, 375×812, Chinese-first.

It is **the visual + interaction reference**, not the spec. The product spec lives in the main project at `docs/`. If they conflict, follow `docs/`.

## Authoritative version per screen

The package contains multiple iterations of some screens (V1, V2, V3, V4). **Implement only the current authoritative version below.** All deprecated versions are in `_archive/deprecated-versions/` for historical reference and should NOT be implemented.

| Screen | Authoritative file | Notes |
|---|---|---|
| Home / Intent Split | `HomeScreenV4.jsx` | Three-intent split (find / bring back / review), locked target as calm primary |
| Explore | `ExploreScreenV3.jsx` | Refined no-selection state, mountain card list, not-found stash entry |
| Mountain Detail | `MountainDetailScreenV2.jsx` | Decision page; integrates with `WeatherMapModules.jsx`. **Curated Posts module from `Community.jsx` inserts between 关键点位与风险 and 天气参考 sections.** |
| Trek / Record | `TrekScreenV2.jsx` | 10 states. Refined Trek copy and Summit Confirmation in `EmotionalMoments.jsx` |
| Late Proof | `EmotionalMoments.jsx` | 4-screen flow: intro → upload → pending → submitted |
| Activity Detail | `ActivityDetailV2.jsx` | Two states: full / fallback. Memory-oriented variants in `EmotionalMoments.jsx` |
| Archive / My Records | `ArchiveV2.jsx` | Populated + empty. Hall of Memories variant in `EmotionalMoments.jsx` |
| Share Editor + Flow | `ShareScreenV3.jsx` | Exports: `ShareScreenV3`, `ShareActionSheet`, `ShareSavedToast`, `ShareCommunityCompose` |
| Profile | `ProfileScreen.jsx` | Single version. Add FAQ entry row per `FAQ_HANDOFF.md`. |
| Onboarding / Intro | `IntroFlow.jsx` | 3 screens |
| Import flow | `ImportFlow.jsx` | 10 screens |
| Mountain Detail weather/map embed | `WeatherMapModules.jsx` | `<WeatherBlock>` (live/stale/unavailable), `<MapBlock>` |
| **FAQ + contextual help** | **`FAQScreen.jsx` + `HelpPrimitives.jsx`** | **NEW**. See `FAQ_HANDOFF.md` for entry strategy and contextual trigger placements. |
| **Community Feed + Detail + Curated module** | **`Community.jsx`** | **NEW**. See `COMMUNITY_HANDOFF.md` for data contract and three surfaces. |
| Shared primitives | `Primitives.jsx` | `StatusBar`, `TopBar`, `TabBar`, `Chip`, `StatTile`, `AltitudeBar`, `PrimaryButton`, `SecondaryButton`, `IconButton`, `PhonePlaceholder`, `PTIcons` |
| Help primitives | `HelpPrimitives.jsx` | `<HelpTrigger>` (`?` icon button), `<HelpSheet>` (bottom sheet) |

## Implementation guidance for new surfaces (FAQ + Community)

These two surfaces are net-new — they don't replace existing production code, they add new screens and inject affordances into existing screens.

### FAQ implementation reference

- **Main page**: implement from `FAQScreen.jsx` exports. The file exports 5 main-page state variants (default / expanded / search / search-empty / deep-link) plus the long-form detail page. Use them as visual + behavior reference.
- **Help primitives**: import `HelpTrigger` and `HelpSheet` from `HelpPrimitives.jsx`. These are reusable across the product wherever a contextual `?` is placed.
- **Contextual trigger insertions**: see `FAQ_HANDOFF.md` for the full list of placements (Profile FAQ row, Trek pre-start GPS row, Activity Detail ProofStrip, Mountain Detail license/weather chips, Community Compose visibility row, Import NoMatch). Each trigger maps to a specific FAQ topic anchor — never insert a `?` that doesn't have a corresponding answer in the main page.
- **Two interaction patterns** (sheet vs deep-link to FAQ main): the file's frame compositions show which pattern is used where. Default to sheet for short atomic concepts, deep-link for answers part of a larger group.

### Community implementation reference

- **Three surfaces, one shared spine**: Feed (`/community`) + Detail (`/community/:postId`) + Curated module (embedded in Mountain Detail).
- **Data contract**: `COMMUNITY_HANDOFF.md` includes the full `Post` TypeScript type with backend field names and semantics. Follow it when designing the API surface or matching to existing schema.
- **Shared atoms** (defined inside `Community.jsx`, may be worth extracting): `<Avatar>`, `<MountainBindRow>`, `<ActivityStatStrip>`, `<AuthorStrip>`, `<EvidenceChip>`, `<LikeButton>`, `<MediaBlock>`, `<RoutePreviewBlock>`, `<InteractionFooter>`, `<KebabButton>`, `<PostMenuSheet>`, `<BodyCloser>`.
- **Evidence-tier chip**: 3 tiers, defined as `evidence: 'live' | 'photo' | 'import'` on Post objects, rendered as 实时记录 / 照片留证 / 轨迹导入. Mandatory on every post.
- **Photo fallback**: when `media.length === 0`, render `<RoutePreviewBlock>` instead of empty media region. Same applies to curated card thumbnails.
- **Interaction footer**: dedicated bottom block (not a tail). Left = status copy + count, right = three icon buttons (like / share / kebab). Author of the post sees no like button (can't like own post). Kebab is here, NOT in the author strip.
- **Detail page metadata**: 山峰 · 记录来源 · 发布时间 inline at end of body via `<BodyCloser>`, not as a standalone bottom block. See Fix 4 in `Community.jsx`.
- **Curated card differentiation**: 2px-wide vertical bar on the left edge in `--color-success` at 40% alpha. This is the ONLY place in the product that uses a left-edge accent bar. Keep it distinctive.

### Curated module insertion into Mountain Detail

The `<CuratedCommunityModule>` component goes into `MountainDetailScreenV2.jsx` between **关键点位与风险** and **天气参考** sections. If `is_curated_for_mountain` posts are 0 → entire section hides (no empty shell). If 1–3 → show all. If 4+ → show first 3 + a `看更多山友记录 →` text link to filtered Community Feed.

## Source-of-truth ordering

When information conflicts, follow this priority:

1. `docs/product-mainline-alignment.md` — product strategy
2. `docs/target-prd.md` — feature set
3. `docs/ui-interaction-spec.md` — interaction rules
4. `docs/acceptance-checklist.md` — acceptance gates
5. This package's `*HANDOFF.md` files — visual + interaction details per surface
6. This package's `.jsx` screen files — visual + behavioral reference
7. This document — navigation between the above

`source-docs/` inside this package contains snapshots of `docs/` at the time the package was assembled. **They may be stale.** Always read `docs/` directly from the project root, not the snapshots in `source-docs/`.

## Tokens — frozen, do not extend

All design tokens are defined in `colors_and_type.css`. Do not introduce new tokens. Do not redefine existing ones. Do not add new gradients, shadows, or color values. If a value isn't covered by an existing token, the design is wrong — flag it instead of inventing.

The 11 semantic color tokens defined here ARE the full color system. Anything outside this in the existing code (see `color-debt.md`) is debt to be cleaned up, not pattern to follow.

## Bottom tab bar — fixed

5 items, fixed: 探索 · 备赛 · 出发 · 山友圈 · 我的. Do not add a tab. Do not change order.

## Tone — fixed

- 克制 / 陪伴 / 户外 (restrained, companionable, outdoor)
- No emoji anywhere
- No exclamation marks anywhere
- No 亲 / 您好 / 客服-style openers
- No `请放心` (show safety, don't promise)
- No marketing / hype voice
- Numbers in IBM Plex Mono
- Chinese 句号 only

If you find yourself writing "easy" / "简单" / "一键" / "亲" — rewrite.

## Quality bar for implementation

- 375×812 mobile-first, dark-only
- All states from `*HANDOFF.md` and `.jsx` files must be implemented (default + empty + loading + error)
- Real Chinese copy from designs, not `[占位]`
- All visual decisions trace to a token in `colors_and_type.css`
- Hit visual parity with the `.jsx` reference

## Files in `_archive/` — DO NOT IMPLEMENT

```
_archive/deprecated-versions/
├── HomeScreen-v1.jsx          (use HomeScreenV4.jsx)
├── HomeScreenV2.jsx           (use HomeScreenV4.jsx)
├── HomeScreenV3.jsx           (use HomeScreenV4.jsx)
├── ExploreScreen-v1.jsx       (use ExploreScreenV3.jsx)
├── ExploreScreenV2.jsx        (use ExploreScreenV3.jsx)
├── MountainDetailScreen-v1.jsx (use MountainDetailScreenV2.jsx)
├── ShareScreen-v1.jsx         (use ShareScreenV3.jsx)
├── ShareScreenV2.jsx          (use ShareScreenV3.jsx)
└── ActivityDetailScreen-v1.jsx (use ActivityDetailV2.jsx)

_archive/exploratory/
└── PolishTokens.jsx            (orphan file, not referenced anywhere)
```

If you find yourself reading anything in `_archive/`, stop. Go back to the authoritative version.

## When in doubt

The product subject is **"我的一次真实山行" (my one real mountain trip)**. Every implementation decision should reinforce that hierarchy:

- Activity > Post (community is publication of activity, not standalone)
- Mountain > Author (mountain is anchor, author is contributor)
- Real records > generic content (evidence tier chip, real GPS data, real photos)
- Content > chrome (less UI, more substance)

If a pattern feels right but doesn't reinforce this subject, it's wrong for this product. Pull back.
