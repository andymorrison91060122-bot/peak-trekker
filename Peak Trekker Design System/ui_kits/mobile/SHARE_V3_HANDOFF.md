# Share Flow v3 — Handoff

Extends `ShareScreenV2.jsx` with the missing post-generation surfaces. The editor stays
lightweight (template / 主画面 / 显示字段); everything else moves the user toward
**bringing the result back, then sharing it beautifully**.

## Files

| File | Exports |
|---|---|
| `ShareScreenV3.jsx` | `ShareScreenV3`, `ShareActionSheet`, `ShareEditorWithSheet`, `ShareSavedToast`, `ShareSuccess`, `ShareSavedSuccess`, `ShareCommunityPosted`, `ShareCommunityCompose` |

A reusable `<SharePoster>` is internal — used to render an identical 4:5 card at multiple
scales (full preview, sheet thumbnail, success receipt, compose attachment) so the user
sees the same artifact across the whole flow.

## Screens (index.html 35 – 40)

### 35 · Share Editor v3 — refined
Same atomic structure as v2, tightened:
- **Template** is now a 3-column grid of *visual* thumbnails (was a flat segmented row).
- **主画面** is a unified segmented control with iconography (照片 / 路线 / 海拔).
- **显示字段** is a chip row with live values (`海拔 6,178m`, `距离 12.4km`, …) instead
  of a switch list — denser, friendlier, copy-readable at a glance.
- Top-right swap: 4:5 aspect badge instead of a 保存 link (avoids the v2 problem of the
  flow ending on "save").
- Footer CTA: **生成分享** → opens the action sheet.

### 36 · Generated · Action Sheet
Bottom sheet, scrim + slide-up animation. Order is intentional:
1. **发布到山友圈** — full-width, accent-tinted card. The product's differentiator is
   weighted heaviest.
2. 2×2 grid of secondary actions: **保存图片 · 系统分享 · 复制链接 · 返回编辑**.
3. Tiny privacy note: shared links only show fields the user toggled on; raw GPS stays private.

The sheet renders the actual generated poster as a 64px thumbnail (not a generic icon),
so the user sees what they're about to send.

### 37 · Saved · Toast
Quiet inline confirmation — pill toast `已保存到相册 1080×1350` floats over the editor
for ~2s. Used after **保存图片** when the user wants to keep editing.

### 38 · Saved · Success (full screen)
Calm centered success: green check + ring, title "保存好了", a 132px receipt-sized
preview of the exact poster, and a footer CTA `看看下一座 / 再做一张`. Same layout
also drives:
- **39 · Community · Posted success** (kind=`community`, copy: 已发布到山友圈)
- **save kind** (kind=`save`)
- **system kind** (kind=`system`)

### 39 · Community · Compose
Prefilled lightweight compose, NOT a full editor:
- Author chip (avatar + 仅山友圈可见 · 24h 内可编辑)
- Auto-filled body text + auto-suggested tags (`#玉珠峰 #青海格尔木 #5000米以上`)
- **Attached share card** card — 88px scaled poster + meta + "更换样式 →" link back to
  the editor (so the user can refine without losing their draft)
- 2 toggle rows: 关联活动详情 (default on), @同行山友 (default off)
- Top-right `发布` link + sticky `发布到山友圈` CTA

### 40 · Community · Posted
Same success template as 38, kind=`community`. Mini receipt stamped
`PEAK TREKKER · POSTED · 9:42 AM` for delight.

## Visual rules followed

- All accent moments use `PTColors.success` (#6EE7A1) at 12 % / 32 % alpha — never solid
  green fills on dark UI.
- Numerics are IBM Plex Mono with `letter-spacing: .08–.22em` to match the rest of the kit.
- Sheet animation is 240 ms cubic-bezier(.2,.8,.2,1); toast is 260 ms.
- No new colors, no gradients beyond what `ShareScreenV2` already established.

## Open product questions

1. **复制链接** — included on the assumption that activity detail pages are publicly
   linkable. If they're login-walled, drop this tile from the sheet (the file's
   `SheetActionTile` for it can be removed in 1 line).
2. **24h 编辑窗口** — the compose row currently advertises this as policy. Confirm with
   product before shipping.
3. **@同行山友** — assumes Trek can record companions. Hide the toggle if that's not yet
   a backend concept.
4. The Compose's "更换样式" link currently no-ops; intended to push back into editor with
   the draft preserved. Needs a small persistence contract on the activity record.
