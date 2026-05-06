# FAQ + Contextual Help — Handoff

Base width **375 × 812**, dark only. All values trace to tokens in `../../colors_and_type.css`.

This system pairs a single **standalone FAQ surface** with **inline contextual triggers** placed on operational screens. Both layers read from one content source — there is never a contextual answer with no FAQ home, and never an FAQ entry with no contextual surfacing for confused users.

---

## 0. Architecture

```
HelpPrimitives.jsx
├── FAQ_GROUPS      — single source of truth for all topics
├── FAQ_BY_ANCHOR   — flat lookup, used by HelpSheet
├── HelpTrigger     — inline ?-icon (32×32 hit, 16px glyph)
├── HelpLink        — text link "查看说明" alternative
└── HelpSheet       — bottom-sheet wrapper, reads anchor → renders short answer

FAQScreen.jsx
├── FAQScreen                — default, all groups collapsed
├── FAQScreenExpanded        — one group + one accordion answer open
├── FAQScreenSearch          — query active, results card list
├── FAQScreenSearchEmpty     — 0 results, calm fallback
├── FAQScreenDeepLink        — landed via anchor, target highlighted
├── FAQDetailScreen          — Pattern B long-form (used by 3-4 dense topics)
├── HelpSheetGpsWeak         — context frame: short sheet over Trek
├── HelpSheetReview          — context frame: medium sheet over Activity
├── ProfileSettingsRowFrame  — fragment: 我的 with FAQ row inserted
├── TrekPreStartWithHelpFrame      — fragment: GPS row with ? trigger
└── ActivityProofStripWithHelpFrame — fragment: 审核中 chip with ? trigger
```

### Anchor convention
`<group>.<question-slug>` — e.g. `record.gps-weak`, `review.what-is-review`. Used for deep-link routing (`FAQ?anchor=…`) and for `HelpSheet` lookup. Anchors are stable identifiers; question text can be rewritten without breaking entry points.

---

## 1. Entry strategy (the layered model)

### Layer 1 — Global entry
- One persistent home: **Profile → 我的 → 帮助 · FAQ** row (Frame 69).
- No top-bar `?` on every screen. No floating bubble. No bottom-tab.

### Layer 2 — Contextual triggers
Quiet inline `?` icons or `查看说明` text links on operational screens, each tied to one anchor. On tap, two patterns:

| Pattern | When to use | Behavior |
|---|---|---|
| **(a) Inline sheet** | Atomic concept, ≤ 5 sentences, user wants to keep what they were doing | Opens `HelpSheet` over current screen. Footer link `查看更多 FAQ →` deep-links into FAQ main if they want context. |
| **(b) Deep-link to FAQ main** | Topic belongs to a group the user might want to browse, OR answer is long enough to warrant a dedicated page | Routes to FAQ main, target group pre-expanded, target question highlighted (Frame 65). For long-form, a `查看完整说明` link inside the accordion answer routes further to `FAQDetailScreen` (Frame 66). |

**The rule** — every contextual trigger maps to a topic that **also exists in `FAQ_GROUPS`**. Single source of truth.

### Trigger placements (load-bearing, not exhaustive)

| Surface | Affordance | Anchor | Pattern |
|---|---|---|---|
| Trek pre-start, GPS row | `?` | `record.gps-weak` | (a) sheet |
| Trek pre-start, 离线地图 row | `?` | `map.map-no-nav` | (a) sheet |
| Trek summit-confirmed, 留证窗口 row | `?` | `record.summit-window` | (a) sheet |
| Late Proof intro screen | `查看说明` link | `start.already-walked` | (b) deep-link, long |
| Activity Detail, near `审核中` chip | `?` | `review.what-is-review` | (b) deep-link, long |
| Community Compose, 仅山友圈可见 row | `?` | `privacy.visibility` | (a) sheet |
| Mountain Detail, license chip | `?` | `license.license-tiers` | (a) sheet |
| Mountain Detail, weather block update time | `?` | `map.weather-tier` | (a) sheet |
| Import NoMatch screen | `?` for "为什么没找到" | `start.mountain-not-listed` | (a) sheet |
| Explore not-found | `?` for "未收录山行" | `start.mountain-not-listed` | (a) sheet |
| Profile settings | `帮助 · FAQ` row | — (entry) | navigate to FAQ main |

**Never both** a `?` and a `查看说明` on one row. If you reach for both, the row is doing too much.

---

## 2. Frames

### Frame 61 — FAQ main · all collapsed (entry from Profile)
- `<FAQHeader>` — `StatusBar` + `TopBar(title="常见问题")` + subtitle row (`14/fg2/lh1.6` `不确定的时候来这里看一眼。`).
- `<FAQSearchField>` — 42px tall, radius 12, `--color-surface` bg, search icon left, placeholder `搜你想知道的事`. Focused state borders at `rgba(34,197,94,.36)`.
- `<FAQGroup>` rows — radius 14 surface card per group, 56px tap target, mono `· N 个问题` count + chevron right.
- **Bottom escape hatch** — single line `没有找到答案?` with two **inline text links** (`去找山 · 提交反馈`) separated by a middot. `--color-on-surface-variant` with a faint underline. No card, no border, no buttons — buttons would compete with the search/groups above. Quiet exit.
- Wordmark footer `PEAK TREKKER · 真实记录与分享` (mono, 10px, fg2, .16em tracking).

### Frame 62 — FAQ main · one group expanded + one accordion answer open
- Group `记录与留证` open. Question rows divide at 1px outline.
- Question row: `14/500/fg`, full-width tap target, chevron rotates 90° on expand.
- Answer body: 13/fg2/lh1.75, `pre-line` whitespace, set in inset card (`rgba(255,255,255,.02)` bg + outline) so it reads as supporting content.

### Frame 63 — FAQ main · search active, query echoed, filtered list
- Query: `审核` (3 hits across `审核与发布`).
- Group cards swap for **result cards**: each card shows group eyebrow (mono fg2 .12em uppercase), question (matched substring highlighted with success tone + 12% bg), and a 2-line answer preview clamped via `WebkitLineClamp`.
- Match-count line: `3 条匹配` (mono, fg2, 11px). No autocomplete dropdown.

### Frame 64 — FAQ main · search returns 0
- Query: `离线轨迹回放` (intentionally not in corpus).
- Empty illustration: 48px outlined search-glyph tile, no decoration.
- Headline 16/700 `没有找到`, sub copy `试试别的说法。或者直接告诉我们,这个问题应该写进来。`
- Single secondary action `提交反馈`. No primary CTA — empty state is not a sales surface.

### Frame 65 — FAQ main · deep-link landed
- Routed from Activity Detail's `查看说明` link. Group `审核与发布` pre-expanded; `什么是「审核中」` accordion open AND highlighted at `rgba(34,197,94,.06)`.
- In production, scroll-into-view on mount (not implemented in static frame).
- **The highlight is a transient state**, not persistent selection. It fades to transparent over **1.5s** starting on mount (CSS `transition: background-color 1500ms ease-out`). Re-tapping the same anchor from a deep-link re-triggers the fade. The accordion stays open; only the green tint fades.
- `long: true` flagged questions show a `查看完整说明 →` link at the bottom of the inline answer; tapping routes to `FAQDetailScreen`.

### Frame 66 — FAQ detail page (Pattern B)
- TopBar title `完整说明` + back. Eyebrow `审核与发布` (mono 10/.14em). Headline `22/800/-.01em`. Updated-on date (mono fg2, 11).
- Content blocks: lede paragraph → `审核会看哪些` 4-row enumerated list → `时间线` (`<TimelineRow>` with success-dot + connector) → `审核期间你能做什么` body card → warn-tinted reassurance block at the bottom. Reuses existing weather/risk-tone pattern from Mountain Detail.
- No CTA. Detail pages exist to explain, not to sell or convert.

### Frame 67 — Contextual sheet · short answer (`GPS 信号弱了会怎样`)
- Backdrop: **the full Trek pre-start screen** rendered behind the scrim, dimmed by `rgba(0,0,0,.55)` + 2px backdrop-blur. The user has not navigated away.
- Sheet shape: **22px drag-handle block at the top** (decorative — no TopBar, no back chevron, no mountain name) → group eyebrow → question 17/700 → body 14/fg2/lh1.7 → single right-aligned `查看更多 FAQ →` text link.
- **Auto height, sized to content**, capped at 60% viewport (long answers scroll inside the sheet). Dismiss by drag-down past 80px or tap-on-scrim. **No back button. No primary CTA.**

### Frame 68 — Contextual sheet · medium answer (`什么是「审核中」`)
- Backdrop: full Activity Detail screen behind the scrim. Same dim + blur.
- Sheet shape identical to Frame 67. The fact that this anchor is `long: true` is what makes the FAQ-main accordion offer a `查看完整说明` link when reached via deep-link — the sheet itself stays compact and never grows past 60%.

### Frame 69 — Profile · with FAQ entry row inserted
- Shows the **支持** section group (new). Two rows:
  - `帮助 · FAQ` — labeled with a small **8px unfilled green ring** (`--color-success`, 1.5px stroke) inline after the label. Quiet, Chinese-friendly, no English chrome.
  - `问题反馈`.
- Card uses the standard 1px `--color-outline` border. No callout outline.
- Faded existing rows above (账号 / 所在省份 / 执照等级) at 0.55 opacity, to make clear the new section is the addition, not the whole screen.
- The dot is a one-time discoverability hint; clears the first time the user opens the FAQ row (state stored locally).

### Frame 70 — Trek pre-start · `?` on GPS check row
- Reuses the existing 3-row preflight card pattern (`PreflightRow` → `PreflightRowWithHelp`). Each row gets a trailing `HelpTrigger` (32×32 hit) bound to its anchor.
- GPS → `record.gps-weak`, 离线地图 → `map.map-no-nav`. 电量 row has no trigger — battery is self-evident; adding a `?` would be noise.
- Bottom CTA `开始记录` left in place to demonstrate the trigger doesn't break primary action hierarchy.

### Frame 71 — Activity Detail · `查看说明` below `审核中` row
- Reuses the existing `ProofStrip` warn-tone container.
- An inline `?` next to the title would visually collide with the right-edge timestamp `09·14 / 14:22` on a 375px screen. Instead, a thin warn-tinted divider runs across the bottom of the strip and `查看说明` (`HelpLink`) sits below, indented 44px to align under the title — same hit area, no collision, copy reads naturally.
- Tap routes to Frame 65 (Pattern B target). For most users the chip + subhead is enough; the link exists for the minority that want to know what 审核 means.
- Rest of Activity Detail compressed to a dashed placeholder so reviewers focus on the affordance, not the screen.

---

## 3. Tokens

| Token | Value | Use |
|---|---|---|
| `--color-surface` | `#23272C` | FAQ group cards, sheet body, search field |
| `--color-surface-elevated` | `#282D33` | secondary buttons (去找山 / 提交反馈) |
| `--color-outline` | `#2F353B` | 1px borders on cards, dividers between Q rows |
| `--color-on-surface` | `#F5F7F8` | group titles (16/700), Q text (14/500) |
| `--color-on-surface-variant` | `#8D959B` | answer body, eyebrows, mono captions |
| `--color-success` | `#6EE7A1` | deep-link highlight bg `(α .06)`, search-match highlight bg `(α .12)`, timeline dots in detail page |
| `--color-warning` | `#F59E0B` | reassurance card border in detail page |

**Radii** — group card 14 · search field 12 · answer inset 10 · sheet top corners 18 · trigger hit area 0 (transparent square).
**Spacing** — group card padding `14/16`; group margin `10` between; sheet body padding `12 20 0`; sheet footer `14 20 22`; group inset answer `12 14`.
**Type** — group title 16/700 · question 14/500/lh1.5 · answer 13/fg2/lh1.75 · sheet question 17/700 · detail page H1 22/800/-.01em · eyebrows 10–11/700/.12–.14em uppercase mono.

No new tokens. No new shadows. The sheet uses the existing `shadow-float` pattern (`0 -18 36 rgba(0,0,0,.28)`).

---

## 4. States

### FAQ main
- **Default (entry from Profile)** — all groups collapsed, search empty.
- **One group open** — chevron rotates 90°; other groups stay collapsed (single-open is not enforced — multi-open is allowed; the design only shows one open at a time for readability).
- **Accordion answer open** — chevron on the question rotates; answer renders in inset card. Re-tapping the question collapses it.
- **Search filtering** — group cards replaced with flat result cards. Restoring empty query restores group cards. No autocomplete.
- **Search empty** — single calm illustration + 提交反馈 link.
- **Deep-link landed** — `?anchor=` parses to group + question; group expanded; question accordion open + highlighted with success-tint bg; on mount, `scrollIntoView({block:'center', behavior:'smooth'})`. Highlight fades to none after 2.5s in production (static in mock).
- **Long-answer flag** — `q.long === true` shows `查看完整说明 →` at the bottom of the inline answer; routes to `FAQDetailScreen?anchor=…`. Currently flagged on `start.already-walked`, `review.what-is-review`, `map.weather-lag`. Adding more is one prop change.

### HelpSheet
- **Open** — scrim fade in 160ms ease, sheet translateY 240ms cubic-bezier(.2,.0,.0,1) — same curve as existing post-share sheet.
- **Drag-down dismiss** — threshold 80px velocity, springs back if not exceeded.
- **Backdrop tap dismiss** — anywhere on scrim closes; sheet itself does not dismiss on body tap.
- **No content found for anchor** — defensively returns null. In production, log warn + show fallback `这条说明暂时还没写`.

### HelpTrigger / HelpLink
- **Rest** — `--color-on-surface-variant`.
- **Active** — `filter: brightness(.94)` for 120ms (matches existing `IconButton` curve).
- **Disabled** — never. If we don't have an answer, we don't show the trigger; we don't grey out a `?` to mean "coming soon" — that's worse than nothing.

---

## 5. Interactions

| Action | Behavior | Duration |
|---|---|---|
| Tap group row | Toggle expand. Other groups stay open if they were open. | 200ms |
| Tap question row | Toggle accordion. Other questions in same group collapse. | 200ms |
| Tap `?` trigger | Open `HelpSheet` for that anchor. | 240ms slide |
| Tap sheet `查看更多 FAQ →` | Navigate to FAQ main with `?anchor=` deep-link. Sheet dismisses first. | sheet 200 / nav 0 |
| Tap accordion `查看完整说明 →` | Navigate to `FAQDetailScreen?anchor=…`. | nav 0 |
| Tap search field | Focus state (success-tint border). Soft keyboard slides up. | platform default |
| Type query | In-place filter — no autocomplete dropdown. Clear button (`×`) appears once query is non-empty. | filter 0 (debounced 80ms in prod) |
| Tap empty-state `提交反馈` | Open feedback flow / mailto. | nav 0 |

---

## 6. Dev props

```jsx
<HelpTrigger anchor onOpen={(anchor) => …} size={16} />
<HelpLink anchor onOpen={(anchor) => …}>查看说明</HelpLink>
<HelpSheet anchor onClose onOpenFAQ={(anchor) => …} prebaked />

<FAQScreen onBack openAnchor /* deep-link */ />
<FAQDetailScreen anchor onBack />
```

- **`onOpen`** is fired with the anchor string. The host app decides whether to mount `HelpSheet` (Pattern a) or `router.push('/faq?anchor='+anchor)` (Pattern b). Per-anchor pattern choice lives in a small map in the app shell, not on the trigger.
- **`prebaked`** disables sheet entrance animation — used for kit screenshots and Storybook frames.
- **`FAQ_GROUPS`** is the only place answers are written. Adding/editing a question is a content edit, not a layout edit.
- **`long: true`** opts into `FAQDetailScreen` for that anchor. The detail-page body is currently authored inline in `FAQDetailScreen`; once we have more than 3 long-form topics, factor the body into a small per-anchor map similar to `FAQ_BY_ANCHOR`.

---

## 7. Copy

The FAQ is the most disciplined surface in the product. All 26 answers are drafted to production quality — no `[占位]`. They follow `克制 / 陪伴 / 户外` voice:

- Short declarative Chinese sentences, 句号 only.
- Honest "we can't do that yet" framing where load-bearing — see `review.community-scope` (`我们没急着把它做成又一个朋友圈`).
- Light reassurance only when it's the actual answer — see `record.data-loss` (`这次山行的轨迹和海拔也都还在`), not as a sign-off.

**Forbidden** — already absent from corpus: 亲, 您好亲, 请放心, exclamation marks, "easy", "简单", "一键", "如有任何疑问联系客服" closers, emoji.

**Read aloud test** — every answer should sound like a quiet hiking partner explaining something, not a chatbot. The team should re-read on each content edit.

---

## 8. Open product questions

1. **Search implementation.** v1 ships type-to-filter on a flat list of ~25 questions — fine for the corpus size. Do **not** add fuzzy match yet; users searching `审核` should see results, but `审 核` (a typo with space) shouldn't. Recommend revisit at 60+ topics.
2. **Long-answer threshold.** Three topics flagged `long: true` today. Recommend hard cap: never more than 6 long-form pages. If we cross that, we're writing documentation, not FAQ — split out a separate `/help` surface.
3. **Detail page authoring.** Frame 66's body is hand-built. Long-term we'll want a tiny content schema (`{lede, sections: [{title, kind: 'list'|'timeline'|'body', items}]}`) so a writer can author without touching JSX. Not in v1.
4. **Highlighting search matches inside long answers.** Currently we highlight in question text only. If users complain, extend to first-match snippet in the preview — but not into the full answer card on expand (too noisy).
5. **Cross-link between FAQ topics.** When an answer references another concept (e.g. `start.already-walked` references 补签 / 留证 / 完整记录), should those terms link to their own anchor? Recommend yes for v1.5 — currently they're plain text. Light underline + `--color-on-surface-variant` would match the rest of the kit.

---

## 9. Non-goals

- Live chat widget.
- "Popular questions" / "trending" — analytics-driven ordering is worse than the curated seven-group taxonomy.
- 👍 / 👎 helpfulness widgets — we don't have the feedback pipeline to act on them.
- Video walkthroughs.
- Floating help bubble.
- FAQ tab in bottom bar.
- Light mode.

---

## 10. The one rule

If a user reaches FAQ, **something already failed** on the previous screen. Our job is to explain it once, well, and get them back to what they were doing. Calm, brief, accurate, out of their way.

Reviewers: please re-read every answer aloud before signing off.
