# Peak Trekker Follow-up 清单 + 项目交接 v0.5

> **单一 source of truth** · 跨 sprint / 跨对话的项目状态门户  
> 每个 sprint 启动/收尾必须更新本文档

---

## 项目交接段（新对话/新接手者必读）

### 当前 main HEAD
`1ecae28`（Merge Pre-3.b Trek complete page + activity photo linkage · 2026-05-15）  
> ⚠️ 此值每次 sprint merge 后必须由 Codex 同步更新

### 当前 Sprint
**Pre-3.b 已完成（2026-05-15），下一步 3.c**  
覆盖范围: C1 + FU-27 + FU-28 + FU-29（已关闭）

### 关键文档地图
| 文档 | 用途 |
|------|------|
| `docs/follow-ups.md` | **本文件** · FU 清单 + 当前状态 + 工作流规范 |
| `docs/target-prd.md` v0.4 | 产品 PRD（路径 B 锁定）|
| `docs/product-mainline-alignment.md` v0.3 | 主线对齐 |
| `docs/release-priority-matrix.md` v0.3 | 发布优先级 |
| `docs/ui-interaction-spec.md` v0.4 | UI 交互规范 |
| `docs/acceptance-checklist.md` v0.4 | 验收清单 |
| `docs/type-system.md` | 字号体系（8-token + Layer 2 protected list）|
| `docs/regression-debt.md` | 回归债（SVG 模板冻结项等）|
| `docs/color-debt.md` | 配色债 |
| `docs/mountain-content-spec.md` | 山峰物料规范 |
| `docs/map-weather-brief.md` | 地图/天气接入策略 (QWeather 主源 + Open-Meteo 备份) |

### 工作流模式（Claude + Codex 协作）

**V1 启动指令**（完整一次性）：
- 任务背景 + 范围（做/不做）+ Phase 1 探索 + Phase 2 设计 + Phase 3 实施
- 包含: commit 拆分 / 分支命名 / 视觉验证 / preflight 防御 / 失败处理 / 报告要求
- **Phase 0（强制）**：读本文件确认目标 FU 状态 + 改 🟡 in-progress
- **Phase 收尾（强制）**：更新本文件（关闭 FU + 加新 FU + 更新 main HEAD）

**V2 Plan 审核**：一句话级别（"Plan 通过，按 plan 执行" 或 "Plan 有 X 处问题"）

**V3 Merge 收尾**：代码块格式（commit 拆分 + push + merge + 清理分支 + 更新本文件）

### 协作规范要点
- 每任务一分支一组 commit；commit message body 必须标注关联 FU
- Plan 阶段禁止改代码 / 数据库 / commit
- 视觉验证用户手动登录（magic link 不通）
- 任何测试/build 失败立即停下报告，不绕过
- destructive 操作走 plan 阶段先审 + 事务包裹 + archive 备份 + post-verify
- 远程分支 push 后保留作为审计 trail，只清理本地分支
- Codex 在 V1 plan 阶段必须包含 E2E 自测环节（Playwright 脚本 + 跑通报告 + 截图）；单元测试静态字符串 grep 不能替代运行时行为验证
- 每次涉及 schema 改动的 sprint，V3 收尾必须包含"migration 已推送到远程 Supabase"的验证步骤（Codex 用 Supabase 插件主动推送 + service role 查 information_schema 验证）

### 新对话/接手指引
新对话开始时只需读取以下三个来源即可 onboard：
1. 最近 transcript（`/mnt/transcripts/` 下最新文件）
2. **本文件** `docs/follow-ups.md`（当前状态 + 工作流）
3. `docs/target-prd.md`（产品规划）

无需 review 所有历史 commit，本文件维护的是项目最新状态切面。

---

## 状态说明
- 🟢 active: 待处理
- 🟡 in-progress: 当前 sprint 处理中
- ✅ closed: 已落地，关闭原因记账

## 优先级说明
- **P0** 阻塞当前 sprint
- **P1** 阻塞 MVP 上线
- **P2** 上线后可优化
- **P3** 长期演进 / V1.1+

---

## Active Follow-ups（17 条）

### FU-1 · 同一份轨迹文件去重（防伪造）

- **优先级**: P1
- **归属阶段**: 下个 sprint（阶段 3 之后）
- **状态**: 🟢 active

**背景**: 当前同一份 GPX/FIT 文件可以被多次上传产生多条 checkin，存在伪造留证风险。

**实施建议**:
- 计算上传文件的内容 hash（SHA-256 of normalized track_points）
- `checkins` 表加 `track_content_hash` 字段 + unique index per user
- 上传时检测重复 hash，已存在则返回"该轨迹已上传过"

**涉及**:
- `src/app/api/import/parse/route.ts`
- `src/app/api/import/confirm/route.ts`
- schema migration

---

### FU-2 · ui-spec 留证语义文档对齐

- **优先级**: P2
- **归属阶段**: 阶段 6 文档对齐
- **状态**: 🟢 active

**背景**: A1 决策"已留证 = mountain_id IS NOT NULL"语义在 `docs/ui-interaction-spec.md` 中可能仍有不一致表述（如旧的 verification_status / verified_at 引用）。

**实施建议**: grep `verification_status / verified_at / 已留证` 全文，统一为 mountain_id 语义口径。

---

### FU-4 · mountains 华山 vs 西岳华山南峰子峰拆分

- **优先级**: P2
- **归属阶段**: 阶段 6 后 / 物料补全
- **状态**: 🟢 active

**背景**: mountains 表里同时存在两条记录：
- 华山（id `216508c9-ffca-4164-8010-534d8650ee64`, 34.4869, 110.0877, 2154m）
- 西岳华山南峰（id `7ab4cca8-a681-4f1e-94bc-9032d16d41f7`, 34.4731, 110.0864, 2154m）

altitude 相同但坐标差 1.5km，应该是父子关系（华山为父景区，南峰为最高峰子峰），不是独立两座山。用户选错会用错坐标。

**实施建议**: 评估后选一个方向：
- 合并为一条（保留 id, 删除冗余）
- 拆分为父子关系（加 parent_id 字段）
- 删除其一

**涉及**: mountains 表 + 可能影响已有 checkin 引用。

---

### FU-5 · premium-vertical-story 路线层后补

- **优先级**: P2
- **归属阶段**: 阶段 5+ 或独立小任务
- **状态**: 🟢 active

**背景**: PRD v0.4 锁定 vertical-story 路线层延后实现，当前模板无路线层只有静态 ridge fallback。

**实施建议**: 在 vertical-story 模板加 TrailSvg 渲染层 + 适配 vertical 布局。

**涉及**: `src/lib/share-templates/premium-vertical-story.tsx`

---

### FU-6 · UGC 山峰收录机制

- **优先级**: P2 长期
- **归属阶段**: V1.1+
- **状态**: 🟢 active

**背景**: 当前 mountains 表是策划预录的 20 座名山，用户上传非预录山峰只能"不关联山峰"。需要 UGC 收录流程让用户提交新山峰候选 → 运营审核 → 入库。

**实施建议**:
- 新建 `mountain_requests` 表
- 用户在"申请收录山峰"按钮真实写入 request
- 运营后台审核 + 入库

**涉及**: 需要后台管理系统，工作量较大，列长期方向。

---

### FU-7 · 历史 lint debt 清理

- **优先级**: P2
- **归属阶段**: 阶段 6
- **状态**: 🟢 active

**背景**: 全量 `npm run lint` 在 `Peak Trekker Design System/` + `playwright-report/` 等历史目录有错误。建议加 `.eslintignore` 屏蔽这些非生产代码目录。

**实施建议**: 加 `.eslintignore` 或 `eslint.config.mjs` 的 ignores 列表。

---

### FU-10 · "申请收录山峰" toast 占位反馈

- **优先级**: P2
- **归属阶段**: A2 增量小任务
- **状态**: 🟢 active

**背景**: A2 距离校验阻断态 + "附近无山"空态都有"申请收录山峰"按钮，当前点击只跳 FAQ。用户期望按钮文案是"应用型"，点完后发起申请。

**实施建议**:
- 点击按钮 → 显示 toast："已收到您的山峰反馈，正式收录流程上线后会优先核实并录入。"
- 保留 FAQ 入口（toast 显示后跳，或 toast 内嵌"了解收录流程"链接）

**涉及**: `src/app/(flow)/import/ImportClient.tsx`

**验收**: 375×812 截图点击按钮后 toast 显示，FAQ 行为不变。

---

### FU-11 · 活动详情底部按钮悬浮 + 主次互换

- **优先级**: P2
- **归属阶段**: 阶段 3 子任务
- **状态**: 🟢 active

**背景**: 活动详情页底部"生成分享 + 发布到山友圈"两个按钮平铺在内容流末尾（不悬浮），且主次颠倒。

**实施建议**:
- 底部操作栏改 sticky bottom
- 主次互换：生成分享 = 绿色 primary，发布到山友圈 = 次级深色

**涉及**: `src/app/(flow)/activity/[id]/ActivityDetailClient.tsx`

---

### FU-12 · share-track-preview 保留地理 aspect ratio

- **优先级**: P2
- **归属阶段**: V1.1+ 或阶段 6 后
- **状态**: 🟢 active

**背景**: 当前归一化把 lat/lng 拉伸填满 0-1 矩形，丢失真实地理 aspect ratio。导致部分模板（如已删除的 mono-film 轨迹层）出现轨迹被压扁。

**实施建议**: 归一化用统一 maxRange 保留 aspect ratio。

**涉及**: `src/lib/share-track-preview.ts`

**风险**: 影响 10 个模板，回归面大。本期不动，mono-film 通过删除轨迹层绕过。

---

### FU-13 · 活动详情"手记"功能补齐

- **优先级**: P2
- **归属阶段**: 阶段 3 / 阶段 5
- **状态**: 🟢 active

**背景**: 活动详情页"这次山行，你想记住什么？写一句"按钮当前是占位（"手记功能即将上线"）。

**实施建议**: 
- MVP 简单实现：纯文本输入 → 保存到 `checkins.notes` 字段
- 250 字数限制，一次性写入 + 后续可编辑

**涉及**: `src/app/(flow)/activity/[id]/ActivityDetailClient.tsx` + 可能 schema migration

---

### FU-14 · 活动详情"照片补传"功能补齐

- **优先级**: P2
- **归属阶段**: 阶段 3 / 阶段 5
- **状态**: 🟢 active

**背景**: 活动详情页"补一张照片"按钮当前是占位（"照片补传功能即将上线"）。

**实施建议**:
- 复用 Trek 流程的拍照上传逻辑
- 上传到 `checkin_assets` 表

**涉及**: `src/app/(flow)/activity/[id]/ActivityDetailClient.tsx` + 可能复用 `src/app/api/trek/photo-upload/route.ts`

---

### FU-15 · Live 阶段 GPS 弱信号"暂用上次值"文案修正

- **优先级**: P2
- **归属阶段**: 阶段 3 后续 或独立任务
- **状态**: 🟢 active

**背景**: Live 阶段 gpsWeak 全屏 UI 显示"暂用上次值 + mountain.altitude 数值"。"暂用上次值"语义错误（实际是目标山峰标称海拔，不是用户测过的值）。

**实施建议**: 改为"目标山峰标称海拔"或"参考海拔（基于山峰库）"。

**涉及**: `src/app/(flow)/trek/TrekClient.tsx` live gpsWeak UI 文案

---

### FU-16 · mountains 坐标精度审计

- **优先级**: P3
- **归属阶段**: 阶段 5 或随 mountain 物料补全
- **状态**: 🟢 active

**背景**: 已确认是 WGS-84 坐标系（与 GPS 一致）。但 19 座山的坐标点可能不是真实峰顶（如华山指向景区中心而非南峰落雁峰，误差约 400-500m）。会影响"登顶检测距离阈值"。

**实施建议**: 物料完善时校准每座山的"峰顶坐标"为真实最高点。

---

### FU-17 · approach_alert 距离 0m 时状态语义切换

- **优先级**: P2
- **归属阶段**: 阶段 3 后续
- **状态**: 🟢 active

**背景**: 当前 GPS 距离 0m（已到数据库坐标点）时仍显示"临近峰顶 · 距离峰顶 0m"，体验割裂。

**实施建议**: 三段式状态：
- 距离 > 100m: approach_alert "临近峰顶"
- 距离 ≤ 100m 但未确认: **"已到达峰顶 · 准备留证"** + 主 CTA 升级为"拍照留证"
- 拍照完成: summit_verified "登顶成功"

---

### FU-24 · Trek 刷新/重连恢复 elapsedSeconds

- **优先级**: P1
- **归属阶段**: 下个 sprint / 独立稳定性任务
- **状态**: 🟢 active

**背景**: 用户在 Trek 过程中可能因网络不好刷新页面；真实徒步旅程应连续，elapsedSeconds 不应每次刷新后归零。

**实施建议**:
- mount 时检测 in-progress `trek_sessions`
- 从服务端 `started_at` 恢复 elapsedSeconds = now - started_at
- 后续如需精确暂停恢复，服务端补 `paused_seconds` / pause intervals

**涉及**: `src/app/(flow)/trek/TrekClient.tsx` + `trek_sessions` schema / API。

---

### FU-30 · 档案页 / Profile 页 "山行"字段语义统一

- **优先级**: P2
- **归属阶段**: 阶段 3 后续 / 阶段 6 文档对齐
- **状态**: 🟢 active

**背景**: 视觉验证中发现 Archive 档案页与 Profile 页 "山行"数量可能出现 9 vs 8 的语义差异；当前 Profile 明确不计入 `completion_status='incomplete'`。

**实施建议**: 明确 "山行" 在 Profile / Archive 中是否都只计 complete，或 Archive 是否应分开展示 complete / incomplete，并同步 PRD/UI 文档。

**涉及**: `src/app/(main)/profile/page.tsx`、`src/app/(flow)/archive/*`、`docs/ui-interaction-spec.md`。

---

### FU-31 · 活动详情多图上传完整实装

- **优先级**: P2
- **归属阶段**: 与 FU-14 合并或独立 sprint
- **状态**: 🟢 active

**背景**: 用户希望活动详情最多支持 9 张图，首张为登顶留证，后续可补传。当前数据库 `checkin_assets` 与 loader 的 `uniquePhotos(checkin.photo_url, assets)` 已能合并多源，但前端 UI 只展示 `slice(0, 3)`，且"补一张照片"仍是占位。

**实施建议**:
- 活动详情照片 UI 升级到最多 9 张（例如 3×3 grid）
- 实装补传入口，复用 Trek photo upload 到 Supabase Storage，并写入 `checkin_assets`
- 首张始终保留为 `checkins.photo_url`（登顶留证）

**涉及**: `src/app/(flow)/activity/[id]/ActivityDetailClient.tsx`、`checkin_assets`、`src/app/api/trek/photo-upload/route.ts` 或新 activity photo upload API。

---

### FU-32 · 分享编辑器兜底轨迹去除

- **优先级**: P1
- **归属阶段**: 独立小 sprint 或 7.8.d
- **状态**: 🟢 active

**背景**: testMode 单点或真实轨迹缺失/极少时，分享编辑器仍显示 hardcoded 假轨迹。当前 `share-track-preview.ts` 在少于 2 个有效点时返回 `null`，模板再用 `DEFAULT_*_PATH` 兜底，导致"假完整轨迹"。

**实施建议**:
- grep 10 个分享模板中的 `DEFAULT_*_PATH` / hardcoded route fallback
- 删除模板默认假轨迹兜底
- 真实轨迹缺失或单点时不渲染轨迹；单点可只显示中心起终点圆点

**涉及**: `src/lib/share-templates/shared.tsx`、`src/lib/share-templates/*`、`src/lib/share-track-preview.ts`。

---

## Closed Follow-ups（14 条）

### FU-3 ✅ Profile 最高海拔选项 B

- **关闭原因**: A1 修复时落地（决策 1 选项 B - GPS 实测海拔优先 fallback 山峰海拔）
- **关闭 commit**: `8ad4906`
- **关闭时间**: 2026-05-13

---

### FU-8 ✅ Archive tab selected style 不一致

- **关闭原因**: 7.8.c 落地（统一 tab selected style helper + 静态回归断言）
- **关闭 commit**: `e4de169`
- **关闭时间**: 2026-05-14

---

### FU-9 ✅ 服务端 PNG 端到端真实轨迹验证

- **关闭原因**: 7.8.c 落地（抽出 share-render-png helper + 用 satori + Resvg 实际渲染 PNG + sharp 验证元数据/像素）
- **关闭 commit**: `56e53ec`
- **关闭时间**: 2026-05-14

---

### Issue-3 ✅ Trek 准备页流程缺失

- **关闭原因**: Pre-3.a 落地（确认山峰后进入 PreStart 准备页；entry validation 不再污染 tracking 状态机）
- **关闭 commit**: `63981e6`
- **关闭时间**: 2026-05-15

---

### FU-18 ✅ Trek 登顶"继续"按钮失效（N2 残留）

- **关闭原因**: Pre-3.a 落地（approach_alert 继续按钮接入 SummitPhotoView，photo-upload 端到端通过）
- **关闭 commit**: `a52a88c`
- **关闭时间**: 2026-05-15

---

### FU-19 ✅ Trek tracking 状态计时器失效

- **关闭原因**: Pre-3.a 落地（tracking timer 改为状态驱动，并增加 activeSessionIdRef 防残留 callback 污染）
- **关闭 commit**: `8499d18`
- **关闭时间**: 2026-05-15

---

### FU-20 ✅ "结束并保存"实际未保存 + 缺 toast + 缺时长校验

- **关闭原因**: Pre-3.a 落地（finish_incomplete_trek 写入 incomplete checkin，短记录动态门槛 toast，远程 Supabase schema 已部署验证）
- **关闭 commit**: `27fba5a`
- **关闭时间**: 2026-05-15

---

### FU-21 ✅ Trek 启动时缺位置校验（100km 阈值）

- **关闭原因**: Pre-3.a 落地（入口 100km 校验失败 toast 后跳回 Explore，confirm/start 保留二次防御）
- **关闭 commit**: `63981e6`
- **关闭时间**: 2026-05-15

---

### FU-22 ✅ 海拔显示应基于真实 GPS 坐标

- **关闭原因**: Pre-3.a 落地（当前海拔语义拆分为 GPS altitude → Open-Meteo elevation → 采集中，不再 fallback 山峰标称海拔）
- **关闭 commit**: `ea853c6`
- **关闭时间**: 2026-05-15

---

### FU-23 ✅ 海拔字段接入坐标查询 API

- **关闭原因**: Pre-3.a 落地（新增 Open-Meteo Elevation API fallback，移动 50m 重查，AbortSignal 取消在途请求）
- **关闭 commit**: `ea853c6`
- **关闭时间**: 2026-05-15

---

### FU-25 ✅ 隐藏 Trek "暂时跳过 GPS"入口

- **关闭原因**: Pre-3.a 落地（Trek GPS 失败流程不再暴露跳过 GPS 入口，late-proof 页面本身保留）
- **关闭 commit**: `99a1c6d`
- **关闭时间**: 2026-05-15

---

### FU-27 ✅ SummitConfirmedView "留下峰顶记录"按钮冗余

- **关闭原因**: Pre-3.b 落地（SummitConfirmedView 仅保留生成分享与查看登山档案，不再显示已拍照后的冗余记录按钮）
- **关闭 commit**: `d25ebef`
- **关闭时间**: 2026-05-15

---

### FU-28 ✅ "保存这次登顶"按钮文案改"查看登山档案"

- **关闭原因**: Pre-3.b 落地（完成页次 CTA 改为查看登山档案，主 CTA 改为生成分享，避免误导用户以为尚未保存）
- **关闭 commit**: `1074626`
- **关闭时间**: 2026-05-15

---

### FU-29 ✅ 活动详情页照片联动 bug

- **关闭原因**: Pre-3.b 落地（verify_summit_checkin 用 server/admin client 持久化 `checkins.photo_url`，活动详情 loader 自动合并显示留证照）
- **关闭 commit**: `0c0afcd`
- **关闭时间**: 2026-05-15

---

## 维护规范

### 每个 sprint 启动时（Phase 0）

Codex 在 V1 指令的 Phase 0 必须执行：

1. 读取本文件 → 找到目标 FU 当前状态
2. 把目标 FU 状态从 🟢 active → 🟡 in-progress
3. 更新顶部"当前 Sprint"字段
4. 单独 commit: `docs(follow-ups): mark FU-XX as in-progress for <Sprint Name>`

### 每个 sprint 收尾时（Phase 收尾）

Codex 在视觉验证通过、merge 前必须执行：

1. **关闭已完成 FU**：状态改 ✅ closed + 记账：
   - 关闭原因（一句话）
   - 关闭 commit hash（merge commit 或主体 commit）
   - 关闭时间（YYYY-MM-DD）
2. **加入新发现 FU**：sprint 过程中发现的新问题加 active 列表
3. **更新 main HEAD**：merge 完成后把顶部"当前 main HEAD"改为最新 sha
4. **更新当前 Sprint**：下一个 sprint 启动前清空或标"待启动"
5. **更新版本记录**：底部追加版本条目
6. 这一组改动作为最后一个 commit: `docs(follow-ups): close FU-XX, add FU-YY, bump head <sha> (<Sprint>)`

### 跨对话交接时

如对话长度接近上限或主动切换新对话：
- 当前 Claude 在最后一条消息明确说"切换新对话，新对话请读取 transcript + docs/follow-ups.md + docs/target-prd.md"
- 不需要额外的"上下文摘要文档"——本文件 + transcript 已足够

---

## 版本记录

**v0.5 — 2026-05-15**：Pre-3.b 完成；Trek 完成页 C1 简化 + FU-27/28/29 关闭；活动详情照片联动打通；新增 FU-31（活动详情多图上传完整实装）与 FU-32（分享编辑器兜底轨迹去除）active。

**v0.4 — 2026-05-15**：Pre-3.a 三轮+四轮全部完成；修复 entry validation 副作用 + watchPosition 残留 callback + photo-upload + schema 部署 + fallback 字符串硬化；新增 Open-Meteo 海拔接入；关闭 Issue-3 + FU-18/19/20/21/22/23/25；新增 FU-24/27/28/29/30 active；引入 E2E 自测和 schema migration 推送协作规范。

**v0.1 — 2026-05-14**：首次创建。盘点 19 条活跃 follow-up + 3 条已关闭。引入 Pre-3.a Trek 流程稳定性 Sprint 范围。建立 V1/V2/V3 工作流 + 项目交接段 + 维护规范。
