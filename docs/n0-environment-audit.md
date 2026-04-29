# N0 环境与 Schema 闭环诊断报告

诊断时间：2026-04-29T11:50:33Z
执行人：Codex
任务批次：N0（仅诊断）

---

## 总览

* 环境是否可工作的程度：部分受阻
* P0 必修问题数量：4（按 `docs/regression-debt.md` P0 条目计；另发现 B2-2 / B2-4 / N4 相关环境缺口）
* 后续可推进任务：N1 部分就绪；N2 部分就绪；N3 受 storage bucket 阻塞；N4 受 schema 与 env 阻塞
* 关键 blocker：运行时 Supabase schema 与仓库 `supabase-init.sql` 不一致，且 `checkin-photos` bucket 缺失。

---

## 维度 A · Migrations

连通性预检结果：

| Endpoint | HTTP 状态 | 结论 |
|---|---:|---|
| REST `/rest/v1/` | 401 | TLS / HTTP 层正常 |
| Storage `/storage/v1/bucket` | 400 | TLS / HTTP 层正常 |

仓库 migration 状态：

| 文件 | 本地存在 | 远端应用状态 | 备注 |
|---|---|---|---|
| `supabase-init.sql` | 是 | 无法直接确认 | 仓库内唯一 SQL 初始化文件。 |
| `supabase/migrations/` | 否 | 不适用 | 仓库内未发现 Supabase migrations 目录。 |

远端 migration metadata：

| 查询目标 | 结果 | 备注 |
|---|---|---|
| `supabase_migrations.schema_migrations` via PostgREST schema profile | 无法查询 | 返回 `PGRST106`：仅暴露 `public`、`graphql_public` schema。 |

运行时 drift 证据：

* `supabase-init.sql` 包含 `ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;`
* 运行时 `posts.is_featured` 查询返回 `42703 column posts.is_featured does not exist`
* `supabase-init.sql` 包含 `ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS review_note TEXT;`
* 运行时 `checkins.review_note` 查询返回 `42703 column checkins.review_note does not exist`

结论：不能通过当前只读通道确认远端已应用 migration 列表；但已确认运行时 schema 与仓库初始化 SQL 存在不一致。

---

## 维度 B · 环境变量

本表只显示 set / missing，不显示实际值。

| 变量名 | 是否配置 | 用途 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | set | 服务端 admin / service-role 访问 |
| `NEXT_PUBLIC_SUPABASE_URL` | set | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | set | Supabase anon client |
| `ADMIN_EMAILS` | set | 后台权限 allowlist |
| `QWEATHER_API_KEY` | missing | 后续天气主源 |
| `NEXT_PUBLIC_QWEATHER_API_KEY` | missing | 天气 key 候选命名 |
| `QWEATHER_KEY` | missing | 天气 key 候选命名 |
| `WEATHER_API_KEY` | missing | 天气 key 候选命名 |
| `NEXT_PUBLIC_STORAGE_PUBLIC_URL` | missing | storage 公开 URL 候选配置 |
| `STORAGE_PUBLIC_URL` | missing | storage 公开 URL 候选配置 |
| `SUPABASE_STORAGE_URL` | missing | storage 公开 URL 候选配置 |

结论：Supabase 运行所需三项已配置；QWeather / weather key 未配置；未发现 storage public URL 类 env。

---

## 维度 C · Schema 字段

| 检查项 | 判断 | 证据 / 影响 |
|---|---|---|
| `posts.is_featured` | 缺失 | REST 查询返回 `42703 column posts.is_featured does not exist`；B2-2 精选攻略无法依赖真实字段。 |
| `mountain_waypoints` 表 | 存在 | OpenAPI definitions 暴露该表，REST `select=*` 返回样例行。 |
| `mountain_waypoints` 结构 | 部分存在 | 运行时字段为 `id, mountain_id, type, name, description, elevation, sort_order, created_at`；`title`、`updated_at` 不存在。 |
| `mountain_waypoints` 外键 | 存在 | OpenAPI 标记 `mountain_id` 外键到 `mountains.id`。 |
| `mountain_waypoints` 索引 | 未能远端确认 | PostgREST 不暴露 index metadata；本地 `supabase-init.sql` 定义 `idx_waypoints_mountain`。 |
| `mountain_waypoints` RLS | 部分可确认 | 本地 SQL 只定义 `waypoints_select`；远端 policy metadata 未暴露。 |
| `checkins` RLS policy 列表 | 未能远端确认 | `pg_catalog.pg_policies` 未暴露；本地 SQL 只定义 `checkins_select` 与 `checkins_insert`，未见 `UPDATE` policy。 |
| `checkins.review_note` | 缺失 | REST 查询返回 `42703 column checkins.review_note does not exist`。 |
| `checkins.admin_note` | 存在 | REST `select=id,status,admin_note` 成功。 |
| `mountains.latitude` / `longitude` | 存在 | OpenAPI definitions 暴露 `latitude`、`longitude`。 |
| `mountains.elevation` | 缺失 | REST 查询返回 `42703 column mountains.elevation does not exist`；运行时使用的是 `altitude`。 |
| `mountains.altitude` | 存在 | OpenAPI definitions 暴露 `altitude`。 |
| `mountains.weather_priority_tier` | 缺失 | REST 查询返回 `42703 column mountains.weather_priority_tier does not exist`。 |
| `mountains.weather_enabled` | 缺失 | 同上，weather 扩展字段不存在。 |
| `mountains.weather_zone_id` | 缺失 | 同上，weather zone 字段不存在。 |
| `weather_cache` 表 | 缺失 | REST 查询返回 `PGRST205 Could not find the table 'public.weather_cache' in the schema cache`。 |
| `mountains.gallery_images` | 存在 | OpenAPI definitions 暴露 `gallery_images jsonb`。 |

结论：B2-4 的基础表存在且与当前代码字段 `name` 对齐；B2-2 的 `posts.is_featured` 和 N4 天气缓存/分层字段缺失；N1 的 checkins UPDATE policy 远端未能直接确认，但本地 SQL 没有该 policy。

---

## 维度 D · Storage Bucket

远端 bucket 列表：

| Bucket | public | 备注 |
|---|---|---|
| `mountain-media` | true | 存在，适合山峰 cover/gallery 公开 URL。 |

缺失 bucket：

| Bucket | 判断 | 影响 |
|---|---|---|
| `checkin-photos` | 缺失 | 活动图片、社区图片、头像 fallback 当前会遇到 bucket missing。 |
| `avatars` | 缺失 | `ProfileAvatarUploader` 会先尝试 `avatars`，再 fallback 到 `checkin-photos`；两者都不可用。 |

当前 fallback / storage 使用状态：

| 路径 | 当前行为 |
|---|---|
| `src/app/api/trek/photo-upload/route.ts` | 写入本地 `public/checkin-photos/checkins/...`，返回本地 public 路径。 |
| `src/app/api/activity/actions/route.ts` | 使用 Supabase Storage `checkin-photos` bucket 上传 `activity-assets/...`。 |
| `src/app/(main)/community/publish/[checkinId]/PublishEditorClient.tsx` | 使用 Supabase Storage `checkin-photos` bucket 上传 community 图片/视频。 |
| `src/components/profile/ProfileAvatarUploader.tsx` | 先上传 `avatars`，遇缺失/权限类问题后尝试 `checkin-photos`。 |
| `src/lib/mountain-storage.ts` | 使用 `mountain-media` bucket，远端存在且 public。 |

结论：山峰媒体 bucket 已可用；真实 checkin/community/profile 上传链路所需 bucket 缺失，N3 受阻。

---

## 维度 E · 功能真实运行状态

### B2-2 精选攻略

结论：部分可运行，但真实字段路径不完整。

依据：

* 后台界面存在：`src/app/admin/community/page.tsx` + `AdminCommunityClient.tsx`
* 管理动作走 `POST /api/admin/community-moderation`
* 该路由包含 `canAccessAdminTools` 权限校验
* `feature` / `unfeature` 动作优先用 service-role client 更新 `posts.is_featured`
* 运行时 `posts.is_featured` 缺失，因此真实字段更新会失败
* 代码对 schema compatibility error 有 comment fallback：向 `comments` 插入 feature/unfeature mutation
* Mountain Detail 通过 `listFeaturedPostsByMountain()` 读取 featured posts；当 `is_featured` 查询 schema error 时，会 fallback 到普通 posts + feature mutation comments

判断：有兼容 fallback，但不是目标 schema 闭环；N1/B2-2 后续仍需要补齐 `posts.is_featured` 或明确改为 comment mutation 模型。

### B2-4 山峰点位 CRUD

结论：表存在，代码路径存在，但 HTTP 方法不是 RESTful GET/POST/PATCH/DELETE 齐全。

依据：

* `/api/admin/waypoints` 路由存在
* 该路由仅导出 `POST`
* `POST` 内通过 `action: list | add | update | delete` multiplex 四类动作
* 路由包含 `canAccessAdminTools` 权限校验
* helper 使用 service-role client 执行 add/update/delete
* 运行时 `mountain_waypoints` 字段为 `name`，与当前代码 `WaypointInput.name` 对齐

判断：B2-4 的数据表与当前实现可对上；如果验收标准要求真实 `GET / POST / PATCH / DELETE` 方法齐全，则当前不满足。

### Admin Checkin Review

结论：P0 风险仍成立。

依据：

* `/api/admin/checkin-review` 路由存在，仅导出 `POST`
* 该路由未调用 `canAccessAdminTools` 或等价 admin guard
* 路由使用 `createSupabaseServerClient()`，不是 service-role admin client
* 路由尝试 `.update({ status, review_note })`，遇 `review_note` error 时 fallback 到 `admin_note`
* 运行时 `checkins.review_note` 缺失，`admin_note` 存在
* 本地 `supabase-init.sql` 只见 `checkins_select` 和 `checkins_insert`，未见 `checkins_update`

判断：权限 guard 缺失 + UPDATE policy 未确认/本地缺失，符合 `regression-debt.md` P0 的 N1 范围。

---

## 维度 F · Playwright 失败分类

执行命令：

```bash
npm run test:e2e -- tests/e2e/community-acceptance.spec.ts 2>&1 | tee /tmp/n0-playwright-output.txt
```

结果摘要：17 个用例中 10 passed，7 failed。注意：由于命令通过 `tee` 管道运行，shell 进程返回码不代表 Playwright 结果；以输出摘要为准。

| 测试名 | 失败类型 | 简短原因 |
|---|---|---|
| `community feed shows altitude-first gps metrics and sanitizes system-generated titles in feed and detail` | 测试自身 / 环境时序 | `page.goto('/explore')` 180s timeout，未进入断言主体。 |
| `community stays bound to valid records and blocks foreign/private access` | 测试自身 / 环境时序 | 等待 `/api/community/actions` create response 超时。 |
| `community feed and profile-share cards keep single-image, multi-image, and no-image previews contained on 375` | 代码失败 / 数据未呈现 | seeded 单图卡片在 feed 中不可见。 |
| `community detail keeps post-first media hierarchy for single and multi image posts and only shows the activity entry to the owner` | 环境 / Auth 流程 | 注册后仍停在 `/auth/login?from=/profile`，未进入 profile。 |
| `community delayed publish path stays record-bound after leaving editor and returning later` | 代码失败 | publish editor 中找不到 `稍后再说` 链接。 |
| `publish and profile embedded previews stay inside their containers when multiple images are present` | 代码失败 / 数据未呈现 | profile share card 未出现。 |
| `profile records expose poster re-share and publish editor keeps the generated poster as the initial cover` | 代码失败 | `#profile-records` 中找不到 `再次分享海报` 按钮。 |

补充观察：

* 前 6 个 share / publish / upload 相关用例通过。
* `community publish editor tolerates weak network and upload failures with clear feedback` 通过，说明缺 bucket 场景至少有一部分 UI feedback 覆盖。
* 已知 P1 `Community Detail Multi-Image Controls` 相关用例仍失败，但本次实际失败点先卡在 Auth redirect。

---

## 后续修复批次建议

基于本次诊断，建议后续批次的优先级和顺序。

* N1（权限 / RLS）：就绪。优先处理 `/api/admin/checkin-review` admin guard、checkins UPDATE policy、`review_note` 字段 drift。
* N2（Trek 核验）：部分就绪。代码路径可读，测试可跑；但 checkins 字段 / UPDATE/RLS drift 可能污染核验后续沉淀结果。
* N3（上传链路）：受 bucket blocker 阻塞。需要先决定并创建/配置 `checkin-photos` 与 `avatars`，再验证 activity/community/profile 上传链路。
* N4（地图天气后端）：受 schema/env blocker 阻塞。需要补齐 QWeather env、`mountains.elevation` 或明确继续使用 `altitude`，以及 weather tier/cache schema。

建议顺序：

1. N1：权限 guard + RLS / checkins review schema drift。
2. N3：真实上传 bucket 与公开访问策略。
3. B2-2 schema：`posts.is_featured` 真实字段或正式 fallback 模型二选一。
4. B2-4 验收口径：确认是否接受 single POST action API，还是要拆 RESTful 方法。
5. N2：在 N1/N3 环境稳定后做 Trek 核验专项回归。
6. N4：天气后端 schema/env 作为独立批次推进。

---

## 本次诊断中未能确认的事项

* 远端 `supabase_migrations.schema_migrations` 已应用列表：PostgREST 不暴露 `supabase_migrations` schema，当前只读通道无法确认。
* 远端 RLS policy 真实列表：PostgREST 不暴露 `pg_catalog.pg_policies`，当前只读通道无法确认。
* `mountain_waypoints` 远端索引列表：当前只读通道未暴露 index metadata。
* B2-4 CRUD 的写入真实可用性：本任务禁止 INSERT / UPDATE / DELETE，因此未做真实 add/update/delete。
* `checkin-photos` / `avatars` 创建后的权限策略：bucket 当前不存在，无法验证 policy。
* 全量 Playwright 套件：本次按任务建议运行代表性 `community-acceptance.spec.ts` 子集，未跑全量套件。
