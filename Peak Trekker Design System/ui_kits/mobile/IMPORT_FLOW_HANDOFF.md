# Import Flow — Handoff

10 screens covering the full import experience: entry → upload (4 states) → preview → match → no-match → success, plus a standalone FAQ help page.

---

## Flow shape

```
Home intent 02 ─┐
Explore import  ├─→ ImportEntry → ImportUpload* → ImportPreview → ImportMatch ──→ ImportSuccess
Explore notfnd  ┘                  │                                 │
                                   error → retry                     └─ no match → ImportNoMatch
                                                                                       │
                                                                                       ├─ stash → ImportSuccess (as 未收录)
                                                                                       ├─ search → manual mountain picker
                                                                                       └─ later  → archive (待整理)
```

Step counter: **01 → 04** in the chrome (Entry / Upload / Preview / Match). No-match keeps `04` to signal it's the same step, just a different outcome.

---

## 1. ImportEntry

- Two-line headline + plain-language explanation. No marketing language.
- Format card lists `GPX · KML · FIT · TCX` as mono chips — concrete, future-extensible.
- Brief examples of source apps (Garmin / 高驰 / 健康 / 两步路 / Strava) — orients power users without being a full table.
- "导入后会做的事" — three numbered rows explain the pipeline. Builds trust by showing the result *before* the user uploads anything.
- Primary CTA: **上传轨迹文件**. Secondary text link: **查看导入说明** → opens `ImportFAQ`.

## 2. ImportUpload* (4 states)

All four share `UploadFrame` (StatusBar + back chevron + "02 / 04" + title). Differences are in the body.

### Empty (`ImportUploadEmpty`)
- Dashed drop zone (illustration only — taps trigger picker).
- Two source rows beneath: 健康 (iOS only) · 云端 / 第三方 App.
- Footer: 从「文件」中选择 (primary).

### Selected (`ImportUploadSelected`)
- Filled card showing filename, size, format chip.
- Status row: green dot + "文件可读 · 等待解析".
- Privacy note: *解析仅在你的设备上完成 · 文件不会被上传* — this is a real trust lever, keep it.
- Footer: 开始解析 (primary).

### Parsing (`ImportUploadParsing`)
- Same file card but with progress bar (animates to 64% then holds — synthetic for the static frame).
- Step list beneath shows pipeline: 读取文件 / 提取轨迹点 / 计算距离与爬升 / 匹配山峰. Done steps get a green check; pending steps get a hollow ring.
- No footer — user waits.

### Error (`ImportUploadError`)
- Red-tinted card with format reason. Filename echoed in mono at bottom with `UNSUPPORTED` tag.
- "常见问题" tip card below — addresses the 3 most common causes (zip / format / empty track).
- Footer: 选择其他文件 (primary) + 重试解析 (text link).

## 3. ImportPreview

- Top: route preview = SVG elevation profile with green line + faded fill + summit dot annotated with peak meters. **Not a map** — keeps the product principle (maps are supportive, not core).
- Min/max/distance labels in mono under the chart.
- 4 stat tiles: 距离 / 时长 / 累计爬升 / 最高点. Last two use the success accent color (altitude = hero metric).
- Time card: 出发 → 结束 with chevron between. Mono dates.
- Footer: 继续 (primary) + 查看完整轨迹 (text link → expanded chart modal, not in this batch).

## 4. ImportMatch

- Title: *看起来是这座山*. Sub-copy explains the basis: position + summit altitude.
- Match rows show: thumbnail, name + 最匹配 tag (only on top result), region · alt, **similarity %** in mono on the right (green ≥80%).
- Selection model: tap to select; selected row gets green tint + green border. Default selection = top match.
- Dashed "都不是，自己找" row → manual search.
- Footer: 确认是这一座 (primary).

### Confidence thresholds (recommended)
- ≥ 90% → auto-show as best, primary green
- 60-89% → show as candidate, neutral
- < 60% → fall through to `ImportNoMatch` (don't show low-quality guesses)

## 5. ImportNoMatch

- Title: *还没找到对应的山*. Sub-copy is the **anxiety-reducer**: *你的轨迹完整保存好了。只是暂时没匹配到收录的山峰 — 这没关系，可以稍后再处理。*
- Quiet illustration: same lone-ridge motif as Explore not-found — visual continuity for "we don't have it" moments.
- Three options, ordered by recommendation:
  1. **作为未收录山行保存** — green-tinted, primary recovery. Goes to `ImportSuccess` flagged 未收录.
  2. **手动搜索关联山峰** — neutral. For users who know exactly where they were.
  3. **稍后再处理** — neutral. Goes to archive with `pending` flag.
- All three are non-destructive — the imported track is already safe.

## 6. ImportSuccess

- Big green check, not a confetti moment. Headline: *已带回档案*. Sub: mountain + date + archive count ("第 7 条记录") — reinforces the archive metaphor.
- Mini result card: name + region + altitude (hero green) + 3-stat row.
- "接下来" — 4 actions in a 2×2 grid. **生成分享** is the primary one (gradient bg). The others (补照片 / 写一句话 / 查看活动) are equal-weight neutral cards.
- Why no primary footer button: the user just succeeded; we don't want to dictate the next step. Each card is its own commitment.

## 7. ImportFAQ

- Standalone page accessible from `ImportEntry` and (suggested) Profile → 帮助.
- Sections:
  - 我可以从哪里导出轨迹 (concrete app list)
  - **3-step illustrated walkthrough** with placeholder hatched boxes (`截图占位 · STEP N`) — replace with real screenshots later
  - 支持哪些文件格式
  - 导入后会发生什么 (privacy + pipeline)
  - 匹配不到山峰怎么办
- Bottom: support email card. Friendly tone, low-key, doesn't promise instant turnaround.

---

## Tokens / patterns

- **Step header**: 36px back chevron / mono "NN / NN" counter / 36px spacer. Title (22/700) sits below with 18px top margin. Reusable as `FlowHeader`.
- **CTA footer**: absolute-bottom, 14px top padding, 22px bottom safe-area, gradient fade from transparent to `--pt-bg` (30% point). Primary fills width. Optional text link below at 13px `--pt-fg2`.
- **Confidence pill (match row)**: green ≥80, neutral fg below.
- **Privacy + safety messaging** is consistent across screens — *文件不会被上传 / 完整保存好了 / 不会丢失*. Keep these phrases verbatim.

---

## Routing contract (matches Home/Explore handoff)

`onImport` from any of the three entry points opens `ImportEntry` with:
```ts
{
  mode?: 'track' | 'proof' | 'manual';
  suggestedMountainName?: string;   // pre-fill into match's manual fallback
  originScreen: 'home' | 'explore' | 'notfound';
}
```

Post-success `onView` returns to `ActivityDetailV2` with the new record id. `onShare` jumps directly to `ShareScreenV2`.

---

## Non-goals

- No multi-file batch import in v1.
- No track editing (trim, splice) inside this flow — that belongs in Activity Detail.
- No live map preview during parsing — the SVG elevation profile is the canonical preview.
- No "did you mean" mountain suggestions in the not-found state until corpus is rich enough to be helpful.
