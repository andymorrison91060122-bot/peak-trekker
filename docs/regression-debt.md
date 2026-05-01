# Regression Debt

本表记录当前已确认但未在主开发流中修复的回归问题、实现债和环境债。
按上线前优先级分为三层：**P0 上线前必修**、**冻结 · 本轮不处理**、**P1 后续重构**。

文档优先级参见 `product-mainline-alignment.md` 第 2 节。
本文件重排原则参见 `release-priority-matrix.md` P0 定义（主线可信度 + 上线前必须收口）。

---

# P0 · 上线前必修

以下条目影响主线可信度，必须在正式发布前收口。每条已映射到执行总纲对应的 N 任务。

## Admin Checkin Review 缺权限校验

> 关联：N1 权限 / RLS / 后台治理

- Date: 2026-04-19
- Status: 新增
- Background:
  `/api/admin/checkin-review` 没有 `canAccessAdminTools` 校验，理论上任何已登录用户都可能调用审核接口。
- Recommended follow-up:
  为 `checkin-review` route 补 admin 权限 guard，并与 community moderation route 的访问控制对齐。

## Checkins 表缺 UPDATE RLS Policy

> 关联：N1 权限 / RLS / 后台治理

- Date: 2026-04-19
- Status: 新增
- Background:
  `supabase-init.sql` 目前只定义了 `checkins_select` 和 `checkins_insert`，没有 `checkins_update` policy；审核接口中的 `.update()` 可能依赖未入库的环境配置。
- Recommended follow-up:
  在 `supabase-init.sql` 中补 `UPDATE` policy，并限制只有 admin 角色可以更新 `status` / `review_note` / `admin_note`。

## `/trek` 的 `verify_summit_checkin` 稳定性

> 关联：N2 Trek 核验稳定性

- Date: 2026-04-19
- Status: 已有但此前未记入本表
- Background:
  `/trek` 主链路仍依赖 `verify_summit_checkin` 完成 summit 核验，逻辑同时覆盖本地 session、服务端 session、轨迹点不足、峰顶半径判断、重复 checkin 去重等多种分支。
- Evidence:
  `src/app/(main)/trek/page.tsx` 通过 action 调用 `verify_summit_checkin`；具体判定逻辑集中在 `src/app/api/trek/actions/route.ts` 的 `verify_summit_checkin` 分支。
- Debt statement:
  当前核验逻辑分支较多，且受轨迹点数量、时长、山峰归属、session 来源影响，后续若继续扩展 QA helper / 本地 session 能力，需要单独做稳定性回归。
- Progress:
  已部分修复（N2-B 阶段 1，2026-04-30）：local session 已限定在 `ALLOW_LOCAL_TREK_SESSION=true` 的环境，`TREK_RULES` 已拆 client/server。剩余 P0-3（事务一致性）和 P1-1/P1-2 留 N2-C。
- Recommended follow-up:
  为本地 session、重复提交、边界半径、短时长、缺失 mountainId 等场景建立更系统的 API 和 E2E 覆盖。

## 真实上传链路 / 存储桶环境验证

> 关联：N3 真实上传链路 / bucket 环境验证

- Date: 2026-04-19
- Status: 已有但此前未记入本表
- Background:
  当前 `/api/trek/photo-upload` 为保证本地可用，直接将图片写入 `public/checkin-photos/checkins/...`；这解决了当前环境 bucket 缺失时的可用性问题，但不等于真实对象存储链路已完成验证。
- Evidence:
  `src/app/api/trek/photo-upload/route.ts` 使用本地文件系统写入 `/public/checkin-photos/...`；仓库内仍同时存在面向 `checkin-photos` bucket 的上传/公开 URL 逻辑。
- Debt statement:
  当前“本地 public 兜底”和“真实 Supabase bucket 链路”并存，生产环境的 bucket 权限、公开地址、回源策略没有在当前批次内完成端到端验证。
- Progress:
  已修复（N3，2026-05-01）：`checkin-photos` 与 `avatars` 的新上传链路改为 Supabase Storage public bucket；路径统一为 `checkins/{user_id}/...` 与 `{user_id}/...`，并移除本地文件系统写入 fallback。`mountain-media` 为 admin-only bucket，未纳入本批次。
- Recommended follow-up:
  在正式存储环境中补做一次真实上传、公开访问、社区发布复用、头像/活动图片共存策略的完整环境验收。

---

# 冻结 · 本轮不处理

以下条目已评估为本轮不修复，原因记录在条目内。

## 分享图模板布局缺陷（冻结 - 待后续处理）

### 背景
在批次 1 补丁的 P1-C 任务中，为了解决分享图长引文文案溢出问题，调整了 `/api/poster/route.ts` 的 SVG 模板布局。修复长引文溢出的同时引入了新的视觉 bug，多轮尝试修复未成功。

冻结时间：2026-04-19

### 未解决的 bug

#### Bug 1：trek_snapshot（途中分享图）内部间距过大
- 位置：`SHARE STORY` 标签 → 引文正文首行之间
- 现象：标签和正文被撑出异常大的垂直空白
- 期望行为：两者间距应为 `8-12px`（同区块紧凑节奏）
- 影响：视觉不协调，看起来像两个独立区块

#### Bug 2：summit_card（登顶分享图）跨区块间距过小
- 位置：上方数据模块（累计爬升 / 活动时长）→ 引文区之间
- 现象：引文区上移过头，已侵入并遮挡数据模块的视觉范围
- 期望行为：两者间距应 `>= 24px`（跨区块明确分隔）
- 影响：重要数据被引文遮挡

### 根因推测
- SVG 模板中 y 坐标可能用了同一个 spacing 变量控制两处不同语义的间距（同区块 vs 跨区块）
- 引文区的起始 y 可能是硬编码而非基于上方模块底部动态计算
- 多引文长度 × 3 种模板的组合导致布局参数难以用单一规则覆盖全部情况

### 冻结决策理由
- 分享图是次级功能，不影响核心登山记录 / 社区流程
- 多轮修复尝试（至少 3 轮）未能稳定解决，投入产出比低
- 根本原因可能是 SVG 模板架构本身的限制，需要重构而非小修
- 决定优先推进其他批次的功能

### 后续处理建议
未来解冻这块时，建议采取以下方案之一：
1. 重构 poster 模板为基于“区块流布局”的计算方式：
   - 定义 `section-gap`（跨区块）和 `inner-gap`（区块内）两个常量
   - 每个区块基于前一个区块的 `bottom + section-gap` 动态定位
   - 不让同一个 spacing 变量控制两种语义
2. 或考虑改用 satori / HTML-to-image 等更成熟的方案生成分享图，避免手动计算 SVG 坐标

### 验收条件（解冻时使用）
- `trek_snapshot` 的标签底边 → 引文首行顶边 差值在 `[8px, 12px]`
- `summit_card` 的数据模块底边 → 引文区顶边 差值 `>= 24px`
- 覆盖全部 `20` 条引文 × `3` 个模板组合，全部通过

---

# P1 · 后续重构

以下条目不阻塞上线，但应在后续批次中收敛。

## E2E baseline failures after N2-B Stage 1 attribution

- Date: 2026-05-01
- Status: 新增
- Background:
  N2-B 阶段 1 将 Trek server 核验阈值固定后，已对 `province-rankings` 与 `community immediate publish` 的 trek fixture 做归因和修复。全量 e2e 仍有 9 个失败，均落在 admin 文案、profile 测试数据、community media / publish / delete 回归链路，不属于本批 Trek local-session / `TREK_RULES` 拆分引入的红灯。
- Evidence:
  `ALLOW_LOCAL_TREK_SESSION=true npx playwright test --reporter=list --max-failures=20` 输出 `105 passed / 9 failed`。
- Failing tests:
  - `tests/e2e/admin-waypoints.spec.ts:138` — admin mountain detail read-only basic info copy expects old placeholder text.
  - `tests/e2e/button-token-migration.spec.ts:226` — profile identity header expects `探险者...` username but current fixture renders `qa-community...`.
  - `tests/e2e/community-acceptance.spec.ts:999` — community feed/profile share cards cannot find seeded single-image card.
  - `tests/e2e/community-acceptance.spec.ts:1078` — community detail multi-image controls expected `5`, received `0`.
  - `tests/e2e/community-acceptance.spec.ts:1166` — delayed publish path cannot find `稍后再说`.
  - `tests/e2e/community-acceptance.spec.ts:1195` — profile embedded preview card not found for multi-image post.
  - `tests/e2e/community-acceptance.spec.ts:1308` — profile records poster re-share button not found.
  - `tests/e2e/community-delete-regression.spec.ts:8` — published community content not visible before delete flow.
  - `tests/e2e/community-regression.spec.ts:33` — community regression cannot find profile `分享到山友圈` link.
- Recommended follow-up:
  单独发起 e2e baseline cleanup 批次，优先分离 admin copy drift、profile fixture username drift、community publish/card seed drift，避免继续阻塞 Trek 稳定性批次。

## Community Detail Multi-Image Controls

- Date: 2026-04-18
- Status: 已有
- Failing test:
  `npm run test:e2e -- tests/e2e/community-acceptance.spec.ts -g "community detail keeps post-first media hierarchy for single and multi image posts and only shows the activity entry to the owner"`
- Symptom:
  community detail multi-image case expects `5` `[data-gallery-control]` nodes, but receives `0`.
- Scope check:
  reproduced in an isolated copy of the workspace after restoring `src/app/(main)/community/[postId]/page.tsx` to its pre-WP2.1 layout, so the failure is not caused by the WP2.1 action-area migration itself.
- Likely next focus:
  inspect `CommunityMediaGallery` detail-mode control rendering and/or the seeded multi-image asset shape used by the acceptance helper.

## Community / Poster Typecheck Debt

- Date: 2026-04-19
- Status: 已有但此前未记入本表
- Background:
  community 与 poster 相关链路为了兼容当前 schema 和不同环境的字段差异，已经引入多处宽类型与兼容分支。
- Evidence:
  `src/app/api/poster/route.ts` 中存在 `checkinSelectVariants`、`Record<string, unknown>`、`unknown` 级别的结果解析与 schema compatibility fallback；`src/lib/community.ts` 也承担了较多运行时 normalize / fallback 逻辑。
- Debt statement:
  当前 community / poster 模块的类型边界仍然偏宽，类型系统没有完全表达真实数据形状，后续 schema 变动时更容易把问题拖到运行时。
- Recommended follow-up:
  在 schema 稳定后，收敛 poster/community 读取模型，减少 `unknown` / 宽结果转换，把兼容分支压缩到更小的边界层。

## Poster / 分享缩略图性能

- Date: 2026-04-19
- Status: 已有但此前未记入本表
- Background:
  分享图与社区封面仍大量依赖 `/api/poster` 动态生成，poster 还承担 demo、classic card、overlay、photo composite 等多种模式。
- Evidence:
  `src/app/api/poster/route.ts` 体量较大，`SharePosterButton`、community fallback poster、poster preview 等入口都会触发该链路；当前未见专门的性能预算或缓存专项记录。
- Debt statement:
  poster 生成与缩略图回退目前以“功能可用”为主，生成时延、重复生成开销、预览与分享场景的缓存策略仍未专项优化。
- Recommended follow-up:
  后续单独评估 poster 生成耗时、社区列表缩略图使用率、预生成/缓存策略和 demo 路径的隔离方式。

## Poster SVG 模板未完全 Token 化

- Date: 2026-04-19
- Status: 已有但此前未记入本表
- Background:
  当前 UI 层已经推进 token 化，但 poster SVG 仍保留较多硬编码色值与布局常量。
- Evidence:
  `docs/color-debt.md` 已单独记录多处 `src/app/api/poster/route.ts` 的硬编码颜色；poster 模板本身也仍使用独立的 SVG 常量体系。
- Debt statement:
  poster 模板还没有完全纳入 UI token 体系，视觉一致性与后续维护成本都高于普通页面组件。
- Recommended follow-up:
  后续若继续投资分享图模块，应评估 poster 专用 token 层，或直接迁移到更适合流式布局与样式复用的生成方案。
