# Home v3 + Explore v2 + Explore Not-Found — Handoff

These three screens elevate the second product entry — **导入已有结果 (import an existing trip)** — into a first-class path, on equal footing with **找下一座山 (find a next mountain)**.

---

## 1. Home / Intent Split v3 (`HomeScreenV3.jsx`)

### Hierarchy
1. Greeting — two-line headline acknowledges both starting points: *从一座山开始，或把一次结果带回来。*
2. Locked target card (if any) — owns the primary CTA slot. Unchanged from v2.
3. **接下来** section — three intent rows, equal weight visually:
   - **01 · 去找下一座山** — neutral surface tile, mountain icon.
   - **02 · 把这次结果带回来** — *visually upgraded.* Green-tinted icon tile, three sub-choices in a divided row beneath: 导入轨迹 · 登顶留证 · 手动补签.
   - **03 · 我的 7 次山行** — neutral surface tile, archive icon.

### Why 02 is upgraded, not equalized
- Equal-weight rows would read as "three random options." Intent 02 is the harder concept (most apps don't have it), so it gets a green-tint icon + sub-choices to *teach the path* without pushing it above intent 01.
- Sub-choices give the user a one-tap landing target: power users tap straight to 导入轨迹; everyone else taps the row and lands on a chooser.

### Tokens
- Card radius `14`, divided sub-choices share the card's border, no extra shadow.
- Sub-choice columns separated by 1px outline lines, same color as card border.
- 02's icon tile: `rgba(34,197,94,.1)` bg + `rgba(34,197,94,.22)` border. Other intent icon tiles: `rgba(255,255,255,.04)` bg + outline border.

### Dev handoff
- Props: `{ onTab, onGoExplore, onImport, onArchive }`.
- `onImport` opens an import sheet; sub-choice taps should pass the chosen mode (`'track' | 'proof' | 'manual'`) so the sheet pre-selects.
- Locked target: omit the card to test the no-target state — section flows as three rows directly under the greeting.

---

## 2. Explore v2 (`ExploreScreenV2.jsx → ExploreScreenV2`)

### Change vs v1
A single new component sits **between the search field and the filter chips**: `ImportEntryCard`.

- Width: full bleed within content padding.
- Visual: subtle green vertical gradient + green outline. **Distinct from neutral mountain cards** so it doesn't disappear, but never louder than the search bar.
- Copy: *已经走过了？把结果带回来* / *导入 GPX / FIT · 系统会自动匹配山*.
- Position: above the filter chip row, below search. This is the only legitimate non-mountain-card item in the list.

### Why here, not elsewhere
- **Not in the tab bar** — would conflict with 出发 (record).
- **Not in the top-right** — gets buried as a utility.
- **Not at the bottom of the list** — invisible to anyone who doesn't scroll past empty-state.
- **Above filters** = parallel to "browse mountains" without competing inside the list.

### Tokens
- Same radius 14 as mountain cards; height auto (~64px).
- Green tint: `linear-gradient(180deg, rgba(34,197,94,.08), rgba(34,197,94,.02))` + `rgba(34,197,94,.22)` border.
- Icon tile: 40×40, green-tinted, success-color upload glyph.

### Dev handoff
- New prop: `onImport`.
- Card click should open the same import sheet as Home intent 02 (consolidate into one flow).

---

## 3. Explore not-found (`ExploreScreenV2.jsx → ExploreNotFound`)

### Trigger
- Search returns 0 results AFTER any filter set, OR after the user explicitly types a query that doesn't match.
- Persists the query string in the search field with a `清除` affordance — never silently clears.

### Hierarchy
1. Same TopBar + search field (with query echoed in fg color).
2. Calm illustration — single mono ridge SVG, dot for "missing peak", spaced em-dash mono caption. **No emoji, no big icon.**
3. Headline: *没找到这座山* (16/700).
4. Sub-copy in two sentences — second sentence is the reframe: *如果你已经走过它，可以直接把结果带回来。*
5. **Primary recovery — 导入轨迹记录** in green-tinted card (most prominent affordance).
6. **Secondary tier (2 rows)** — 继续搜索 · 暂存为未收录山行.
7. Quiet aside — `提交一座山的资料` link for power users.

### Why this order
- The user's expectation was *find a mountain*. The reframe to *bring back a result* is the most product-aligned answer to "we don't have it" — so it's primary.
- 继续搜索 is kept because most miss-typed queries can be saved by retry.
- 暂存为未收录山行 is the third option, not the first, because it creates a record outside the mountain index (more cleanup later).
- Submitting a mountain entry is a power-user action — quiet text link, not a card.

### Tokens
- Empty illustration: 120×64 SVG, single 1.5px stroke `--pt-outline` line, single `--pt-fg2` dot. No fill, no glow.
- Primary import card: stronger green than ExploreV2's entry card (`.10` → `.02` gradient, `.28` border) since it's the recovery action.
- Secondary rows: standard `IntentRow`-style tiles with 36px icon squares.
- Aside link: `--pt-fg2` body, `--pt-fg` linked phrase with 2px underline offset.

### Dev handoff
- Props: `{ onBack, onTab, onImport, onRetry, onStash, query }`.
- `onStash` creates an `ActivityRecord` with no mountainId (stashed as `未归属`); user can claim later from Activity Detail.
- `onImport` should pass the failed query into the import flow as a "likely target name" hint.
- Track in analytics: `explore.notfound.shown` with the query so we can prioritize new mountain entries.

---

## Cross-screen contract

The import sheet (not in this batch) accepts:
- `mode: 'track' | 'proof' | 'manual'` — pre-select sub-choice
- `suggestedMountainName?: string` — pre-fill the "which mountain?" field from a not-found query
- `originScreen: 'home' | 'explore' | 'notfound'` — for analytics + post-import return path

All three entry points (Home intent 02, Explore import card, Not-found primary) collapse into this single sheet. Do not fork the import flow per surface.

---

## Non-goals

- No "popular imports", "imports near you", or social-feed-style suggestions.
- No multi-step wizard before the import sheet — surface tap → sheet → done.
- No merging 2+ track files into one trip in v1; one file = one activity.
- Not-found screen does not show "did you mean…?" suggestions in v1; add only when corpus is rich enough to be useful.
