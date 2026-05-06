# Community / 山友圈 — Handoff

12 frames (72–83). Consumption side only — composition is already shipped via `ShareCommunityCompose` (frame 39). This module covers the **read** half: feed, detail, and a curated module embedded in Mountain Detail.

## Files

| File | Purpose |
|---|---|
| `Community.jsx` | All atoms, cards, screens, and frame compositions |

## Architecture

### Three surfaces, one shared spine

1. **Community Feed** (`/community`) — the tab. Reverse-chronological list, pull-to-refresh, infinite scroll, end marker.
2. **Community Detail** (`/community/:postId`) — the post page. Two viewer modes: `is_authored_by_me` (you see "查看活动详情 · 仅自己可见") vs other (you see the like CTA only).
3. **Curated module** (embedded in Mountain Detail, between **关键点位与风险** and **天气参考**). Not a feed — admin-curated 1–3 posts representing the best on-the-mountain advice.

### Shared atoms (single source of truth)

- `<MountainBindRow>` — pill chip with the bound mountain. **Mandatory** on every post. This is the load-bearing element that says "real trip, not a tweet."
- `<ActivityStatStrip>` — the four-cell stat strip (海拔 / 距离 / 爬升 / 用时). Two densities (`dense` flag) — full on feed/detail, dense on curated.
- `<AuthorStrip>` — avatar + name + relative time + optional kebab. Same layout in feed card and detail header.
- `<LikeButton>` — outline ❤ → filled green ❤, count beside. Single-tap toggles, optimistic.
- `<MediaBlock>` — handles 0/1/2/3+ images with the asymmetric 3+ grid (large left, two stacked right, `+N` overlay on the third when >3).

## Data contract (for `Apple_dev`)

```ts
type Post = {
  id: string;
  author: { id: string; name: string; avatar_url: string };
  created_at: string;             // ISO; UI renders 相对时间
  bound_activity_id: string;       // hard FK — composer cannot create a post without one
  bound_mountain: {                // denormalised for feed efficiency
    id: string; name: string; region: string; photo_url?: string;
  };
  body: string;                    // 0–500 chars. Empty allowed iff media.length > 0.
  media: { url: string; w: number; h: number }[];   // 0–9
  activity_stats: {                // snapshotted at publish time, NOT recomputed
    alt: number;                   // 海拔 m, summit altitude
    dist_km: number;
    climb_m: number;
    duration: string;              // "8h12" — pre-formatted, source of truth is server
  };
  likes_count: number;
  liked_by_me: boolean;
  is_authored_by_me: boolean;      // computed server-side from session
  is_curated_for_mountain: boolean; // admin flag, surfaces in curated module
};
```

**Why `bound_activity_id` is non-null:** the entire product depends on this. Composer (`ShareCommunityCompose`, frame 39) is only reachable from an Activity; backend rejects posts without it.

**`activity_stats` is a snapshot:** if the user later edits the Activity (e.g. retroactively trims the GPS), the post stat strip does **not** update. Posts are immutable records of what was said. Document this in the API spec.

## States covered

### Feed (frames 72–77)
- 72: populated — 4 posts + end marker
- 73: top of list — first 2 posts, hero spacing
- 74: empty — first-time community visit, no posts on the network *(future: localised by region)*
- 75: loading skeleton — 3 cards, structurally identical to real card
- 76: card variants overview — 5 states on one phone (text+1, text+3, text-only, liked, mine+menu)
- 77: kebab open — anchored popover, **viewer-vs-author menu items differ** (举报 / 查看活动详情 + 删除)

### Detail (frames 78–81)
- 78: viewer (other) — sticky like CTA, no activity link
- 79: viewer (author) — "查看活动详情 · 仅自己可见" deep link, like CTA replaced by `· 你的发布 ·` label
- 80: multi-image gallery — full-bleed swipeable, `1 / 3` counter, dot indicator
- 81: text-only — no gallery section at all (not "empty" — section omitted)

### Curated module (frames 82–83)
- 82: 3 curated posts in Mountain Detail, between 风险 and 天气
- 83: 1 curated + the "no curated" branch (entire module hidden — **not** a placeholder)

## Visual rules — what's different about Community

This is the **only** place in the product where:
1. Cards have a 2px green left-edge accent (`CuratedPostCard` only — distinguishes admin-selected content from feed)
2. `+N` photo overlay pattern (3+ image grid)
3. Asymmetric image layout (1.4fr / 1fr split)

Everywhere else: standard outlined cards, consistent radii, no accent edges. Don't borrow these patterns into other modules.

## Voice / copy guarantees

All voice rules from the parent system apply. Specifically reviewed for this module:
- ✗ no `亲` / `家人们` / `宝子`
- ✗ no exclamation marks in body or empty states
- ✗ no emoji in copy (the heart icon is interaction, not emoji)
- ✗ no "我们" / "你" preachy framing
- ✓ relative time in CN (`2 小时前`, `昨天`, full date past 7d)
- ✓ summit altitude is the visual anchor (mono, green, large) — **not** likes count

Empty state on frame 74:
> 还没有人发布山行
> 山友圈里只有真实走过的山。
> 去找一座你想去的山,从那里开始。

This is the tonal floor for the module. No "Be the first to share!" energy. No exclamation. No prompting.

## Interaction notes for engineering

- **Like is optimistic, idempotent.** Double-tap on the card image also likes (per spec, common pattern). Reconciler keeps server count + local delta.
- **Kebab popover** dismisses on outside tap, on scroll, and on any other kebab tap (only one open at a time). Use a single global popover state in the feed list, not per-card.
- **Mountain bind chip** taps through to Mountain Detail, **not** to a filtered feed of that mountain. (Filtered feeds may come later; not in scope.)
- **Author bind chip** — author name + avatar do NOT tap into a profile in v1. Profiles come later. Style as static text.
- **Curated module fetch** — `GET /mountains/:id/community?curated=true&limit=3`. If empty, server returns `[]` and the module simply does not render. No "no curated posts yet" empty state is shown to users — this is a content decision: silence is better than apology.
- **"看更多山友记录" CTA** — only renders when `totalCount > 3`. Tapping routes to `/community?mountain=:id` (filtered feed — open question whether to ship in v1, but UI is ready).

## Open questions for product

1. **Filtered feed by mountain** — UI hooks are in place (`看更多山友记录` CTA). Ship in v1 or push to v1.1?
2. **Curation tooling** — admin sets `is_curated_for_mountain` how? CMS, or implicit (top N by likes after 7d)?
3. **Activity edit propagation** — confirmed: `activity_stats` snapshot is final. Should we surface "edited" indicator on the source Activity if the user later changes it? (Default: no.)
4. **Like notifications** — out of scope here. Push to NotificationFlow when that ships.

## Frames are review-ready

All 12 frames are populated with realistic, finished copy in CN. No lorem, no emoji-as-content, no "Sample" labels. Reviewers can read the actual product.
