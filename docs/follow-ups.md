# Peak Trekker Follow-up 清单 + 项目交接 v0.8

> **单一 source of truth** · 跨 sprint / 跨对话的项目状态门户  
> 每个 sprint 启动/收尾必须更新本文档
> Last Updated: 2026-05-21 · 最新版本记录: v0.26

---

## 项目交接段（新对话/新接手者必读）

### 当前 main HEAD
`4c2417c`（Merge FU-11 · 2026-05-21）
> ⚠️ 此值每次 sprint merge 后必须由 Codex 同步更新

### 当前 Sprint
待启动（候选: FU-47(b) [P1 高优] / FU-52 [P2 cleanup] / FU-53 [P2 cleanup] / FU-51 [P1 上线门禁] / FU-49 [P2] / FU-46 [P2 高优] / FU-43 / FU-45 / FU-54 [P3 上线前] / community-acceptance / button-token-migration / app.spec / FU-30 / FU-2+FU-15 / FU-42）

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

#### V3 收尾 preflight 协议增强（v0.15 引入 / 当前 grandfather 豁免）

- Phase 3 / V3 preflight **应**执行 `npx playwright test` 全量跑，而非相关子集。
- 全量 e2e 内出现 pre-existing baseline failure 时按 FU-39 quarantine 范式: (1) main 独立复现验证 pre-existing; (2) 失败 case 加 test.fixme + reason 标记目标 FU; (3) 开新 FU（根因清晰单独 / 多 case umbrella）入 Active 段跟踪; (4) 整套 quarantine 后全量 e2e 通过 0 failure 才进 V3。
- **触发来源**: FU-13/14 sprint 漏跑全量致 FU-41 Phase 3 才暴露 64+ 项 baseline rot 累积。
- **Grandfather 豁免**: FU-46 closed 前此协议**暂不强制**。FU-41 P1 数据完整性 bug 不应被 baseline rot 拖延，acceptance gate 改为 "守卫单测 + lint + 强关联 spec"。
- **后续 sprint**: FU-46 高优先候选。FU-46 closed 后此协议正式 enforce。
- **用户成本约束（v0.15 补丁引入）**: 全量 `npx playwright test` 跑成本高，**即便协议正式 enforce 后仍需用户专门确认才执行**；Codex / Claude 不可在 V1 / V3 模板默认无声触发，也不可自主决定跑全量。强关联子集 spec（如 `tests/e2e/<feature>.spec.ts`）自跑不受此限。**触发来源**: 用户 v0.15 sprint 末明确 feedback（"额度很难支撑我们去重复的做这件事，除非它一定是必要的"）。
- **TS build preflight（v0.16 引入）**: 每个 sprint 的 preflight **必须**包含 `npm run build`。**触发来源**: FU-46 子 sprint 1 实战发现 2 个 pre-existing TypeScript build blocker（FU-13/14 ActivityDetailClient nextPhotos implicit any + FU-40 TrekClient 3 个 toast key 漏登 registry: trek_pause_persist_failed / trek_manual_refresh_cooldown / trek_resume_failed），均因之前 sprint preflight 不含 build 而长期潜伏。lint + node --test 不足以拦 TS strict mode 编译错误。**与全量 e2e gate 不同**: `npm run build` 成本相对低（< 2 分钟），不需用户专门确认。**如 build fail**: 立即 STOP 报告，按 fail-fast 协议。

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

## Active Follow-ups（24 条）

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

### FU-12 · share-track-preview 保留地理 aspect ratio

- **优先级**: P2
- **归属阶段**: V1.1+ 或阶段 6 后
- **状态**: 🟢 active

**背景**: 当前归一化把 lat/lng 拉伸填满 0-1 矩形，丢失真实地理 aspect ratio。导致部分模板（如已删除的 mono-film 轨迹层）出现轨迹被压扁。

**实施建议**: 归一化用统一 maxRange 保留 aspect ratio。

**涉及**: `src/lib/share-track-preview.ts`

**风险**: 影响 10 个模板，回归面大。本期不动，mono-film 通过删除轨迹层绕过。

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

### FU-30 · 档案页 / Profile 页 "山行"字段语义统一

- **优先级**: P2
- **归属阶段**: 阶段 3 后续 / 阶段 6 文档对齐
- **状态**: 🟢 active

**背景**: 视觉验证中发现 Archive 档案页与 Profile 页 "山行"数量可能出现 9 vs 8 的语义差异；当前 Profile 明确不计入 `completion_status='incomplete'`。

**实施建议**: 明确 "山行" 在 Profile / Archive 中是否都只计 complete，或 Archive 是否应分开展示 complete / incomplete，并同步 PRD/UI 文档。

**涉及**: `src/app/(main)/profile/page.tsx`、`src/app/(flow)/archive/*`、`docs/ui-interaction-spec.md`。

---

### FU-34 · 截图 fixture 库扩充 + CI 回归

- 优先级: P2 ongoing
- 归属阶段: 长期维护
- 状态: 🟢 active

背景: Pre-3.c 已收集 20 个 raw OCR fixture（覆盖 14 个 App），但仍有遗漏（高德地图 / 悦动圈 / 国外冷门 watch app 等）。每次新增 App / 新模式截图都应增 fixture + parser 校准。

实施建议:
- 用户反馈某截图识别失败 → 提取 raw OCR JSON → 加 fixture → 调 parser → 加单元测试
- CI 自动跑 fixture 测试，parser 退化立即阻断 merge

涉及: tests/fixtures/screenshots/raw-ocr/*.json + tests/screenshot-parser.test.ts

---

### FU-35 · 小米 v2-omni 多模态兜底接入

- 优先级: P2
- 归属阶段: V1.1+ 或腾讯免费额度耗尽后
- 状态: 🟢 active

背景: 腾讯云 OCR 配额超限或识别失败时，小米 v2-omni 多模态模型 (¥2.80/M input + ¥14.00/M output ≈ ¥0.011/截图) 作为兜底，比腾讯付费档 ¥0.10/次便宜约 9 倍。

实施建议:
- 新建 src/lib/screenshot/xiaomi-omni-adapter.ts
- 路由器降级链：腾讯 Basic → 腾讯 Accurate → 小米 v2-omni
- 配额账单整合到 FU-33 配额系统

涉及: 新 adapter + src/app/api/screenshot/recognize/route.ts 路由器升级 + 与 FU-33 联动

---

### FU-36 · §13.2 轨迹色彩重绘（多模态图像处理）

- 优先级: P2
- 归属阶段: V1.1+
- 状态: 🟢 active

背景: PRD §13.2 提及"轨迹色彩重绘"功能，需要图像处理能力把原 App 自带轨迹色（黄/红/绿）重绘为 Peak Trekker 品牌色。

实施建议:
- 多模态识别图像中轨迹位置（mask）
- 重新着色 + 输出新图替换原截图轨迹层
- 与 FU-35 小米 v2-omni 同链路（Vision capable model）

涉及: 新 image processing pipeline + 与 FU-35 共享多模态模型 client

---

### FU-37 · OCR vs 小米 v2-omni 对比测试方案

- 优先级: P3
- 归属阶段: 与 FU-35 联动启动
- 状态: 🟢 active

背景: FU-35 接入小米 v2-omni 前需评估其在我们实际 fixture 上的准确率与成本，决定是兜底还是反过来作为主路。

实施建议:
- 用同一组 fixture（FU-34 维护的 20+ 张）跑两路引擎
- 输出准确率对比表（每个字段：海拔 / 距离 / 时长 / 爬升 / 速度 / 日期 / 地点）
- 输出成本对比（按月预估）

涉及: 新 scripts/ocr-engine-benchmark.ts + benchmark 报告 doc

---

### FU-38 · 配速字段 (paceMinPerKm) 独立支持

- 优先级: P3
- 归属阶段: V1.1+
- 状态: 🟢 active

背景: COROS 健走 / 跑步 App 等只显示配速 (7'09"/km) 没有速度 (km/h)。Pre-3.c parser 守住"只提取不计算"底线，这类截图速度字段永远显示"未识别"。需新增独立 paceMinPerKm 字段。

实施建议:
- field-parser.ts 新增 paceMinPerKm 字段抽取（mm'ss"/km 锚点）
- 字段定义新增 paceMinPerKm: number | null
- ScreenshotClient confirm UI 加配速 toggle 区域（mm 'ss" /km 三段输入）
- 活动详情 / 分享模板按需展示配速

涉及:
- src/lib/screenshot/field-parser.ts
- src/app/(flow)/screenshot/ScreenshotClient.tsx
- 可能扩展 checkins schema (pace_min_per_km column)
- src/app/(flow)/activity/[id]/ActivityDetailClient.tsx

---

### FU-42 · checkins 审核机制语义澄清 + status gate 存废决策

- **优先级**: P2（业务方向 / 不阻塞）
- **归属阶段**: 阶段 5
- **状态**: 🟢 active

**背景**: FU-13/14 sprint 视觉验收用户质疑：当前业务模型下（用户自行上传轨迹 + 截图识别 + 用户对数据负责），为何 checkins 仍有 status 三态（pending/approved/rejected）和 application-layer "approved gate"？
status 字段是 schema/RLS/RPC 既有概念：
- checkins INSERT 默认 status TBD
- checkins.SELECT RLS 允许 status='approved' OR owner OR admin
- verify_summit_checkin RPC 改 status
- admin/checkin-review route 管理 status
- FU-13/14 UI 在 status!=='approved' 时 disable 编辑入口

**待澄清**:
- 当前用户上传 checkin 默认 status 是什么？(查 checkins INSERT 默认值)
- 哪些路径会进入 pending / rejected？(N2C / 截图识别 / import / 手动补签)
- 是否还需要保留审核流程？还是直接 owner = approved 默认通过？
- 若废弃审核：status 字段是否保留为 "owner-set" 状态语义 / 还是完全移除

**决策范围（需产品方拍板）**:
- 选 A: 保留 status 概念 + 明确触发条件 + UI gate 保留
- 选 B: 默认全 approved + 拆 UI gate + 简化 RLS（保留 status 字段但语义降级）
- 选 C: 完全移除 status 字段 + N2C / RPC / RLS / UI 全链路重构（大事）

**不在范围**: 本 FU 仅做决策 + audit + 出方案，不立即实施（实施可拆出新 FU）

**涉及（取决于决策）**:
- supabase/migrations/* (RLS / RPC 改动)
- src/app/api/admin/checkin-review/route.ts
- src/lib/trek-verify-helpers.ts
- src/app/(flow)/activity/[id]/ActivityDetailClient.tsx (gate 拆除)

**决策结论 (2026-05-21 FU-11 sprint Phase 4 后)**:
- 用户明确选 **C 方向 (完全移除 status 字段 + 全链路重构)**
- 业务认知: 当前 3 种活动来源 (用户上传轨迹 / 截图识别 / 应用记录) 业务上没有审核流程，"审核状态"语义在项目里不存在
- FU-11 sprint folding 进的子操作 (本 FU 视为已完成的部分): publish 路由 application-layer `.eq('status', 'approved')` filter 已拆除 (commit `b9203a0`); 类型 annotation 三态 union (`pending | approved | rejected`)
- 剩余 FU-42 实施 scope (待后续 sprint):
  - "手记 · 待审核通过后可编辑" 文案 (`ActivityDetailClient.tsx` 或相关组件)
  - `ActivityDetailClient` 其他 status 相关 UI gate (`isSummit` / `proofStatus` / 等)
  - `admin/checkin-review` route (整体废弃决策)
  - `verify_summit_checkin` RPC (整体废弃决策)
  - DB schema simplification (`DROP COLUMN checkins.status` 或语义降级 + RLS 简化)
  - RLS `checkins_select` policy 调整 (移除 `status='approved' OR` 分支，保留 `user_id` + admin)

---

### FU-43 · archive 卡片 hero 状态标签可读性增强

- **优先级**: P2
- **归属阶段**: 阶段 3 / 阶段 5
- **状态**: 🟢 active

**背景**: FU-13/14 sprint 视觉验收用户反馈，archive 页（山行档案）trip 列表卡片左上角 "已登顶/未登顶" + 右上角 "已留证/未留证" chip 叠在 hero 照片之上，当照片亮色或高对比度时 chip 文字看不清。

**现状**: src/app/(flow)/archive/ArchiveClient.tsx:534 / 560

**实施建议**:
- 卡片 hero 上方加固定渐变遮罩（如 linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 50%)）
- chip 背景 backdrop-filter blur + 半透明深色背景
- chip 文字加 text-shadow 兜底
- 不动 chip 逻辑或数据，仅视觉层增强

**涉及**:
- src/app/(flow)/archive/ArchiveClient.tsx
- src/app/components.css (新增 chip overlay 样式)

---

### FU-45 · admin-mountain-edit e2e baseline 失败：rich text 重复渲染

- **优先级**: P2
- **状态**: 🟢 active

**背景**: FU-41 sprint Phase 3 全量 e2e 暴露 admin-mountain-edit.spec.ts:111 失败：getByText('新的列表项 1', exact) strict-mode 命中 2 元素。main 独立复现 = pre-existing。

**失败 case 1 个**: admin can edit mountain description with rich text and it renders on mountain detail

**根因 Hypothesis**: rich text 编辑器双写 / preview + view 同时 render / React strict mode 双渲染 / 序列化 round-trip 重复。

**修复建议**: dev server 实测 DOM，是否真重复决定改 selector 还是修编辑器。

**涉及**: tests/e2e/admin-mountain-edit.spec.ts; 可能 src/app/admin/mountains/* 或 rich text 组件。

---

### FU-46 · e2e baseline rot 系统性清理（umbrella）

- **优先级**: P2（**高优** — 阻塞全量 e2e gate 启用）
- **状态**: 🟢 active

**背景**: FU-41 sprint Phase 3 全量 e2e 暴露 58 个 pre-existing failure（除 FU-44 / FU-45 之外），跨 8 个 spec 文件。main 独立复现确认全部 pre-existing，与 FU-41 commit 无因果。所有 case 已 test.fixme quarantine（commit 2e6a923），feature 分支 e2e 数学上 0 failure（除 Step 4 未跑完）。FU-46 子 sprint 1 已修 debug routes 3 个 quarantine case，inventory 58 → 55；子 sprint 2 已修 mountain-waypoints-display 5 个 case，inventory 55 → 50；子 sprint 3 已修 mountain-featured-posts 5 个 case，inventory 50 → 45；FU-44 close sprint 判定 activity-hero 5 cases 为 obsolete cleanup，overall baseline backlog 45 → 40；子 sprint 4 已修 community-final-polish 5 cases，overall baseline backlog 40 → 35。

**元层级 finding**: FU-13/14 / FU-40 / FU-33 / FU-1 等 sprint 仅跑相关子集 e2e 未全量，导致 baseline rot 多周期无感累积。v0.15 引入"V3 preflight 全量 e2e gate"协议但 FU-41 grandfather 豁免直到本 FU 修完。

**Inventory**（35 remaining cases / 3 active spec 文件；子 sprint 1 已修 3 cases，子 sprint 2 已修 5 cases，子 sprint 3 已修 5 cases，子 sprint 4 已修 5 cases；FU-44 activity-hero 5 cases 已按 obsolete cleanup 移除，不计入"已修"）:
- tests/e2e/app.spec.ts: 18 cases（含 trek/onboarding 流程偏差等）
- tests/e2e/button-token-migration.spec.ts: 6 cases
- tests/e2e/community-acceptance.spec.ts: 16 cases

**已修记录**:
- tests/e2e/debug-access.spec.ts: 2 cases ✓ 已修（子 sprint 1, commit 880f703 + 8c7dcaa）
  > 撤销说明：本 case 在 FU-46 子 sprint 4 重新加回 test.fixme，ProfileV2Client.tsx 中的 <ProfileLicenseProgressSection /> render 已删除，组件源文件保留待 FU-54 重设计。
- tests/e2e/debug-tokens.spec.ts: 1 case ✓ 已修（子 sprint 1, commit 8c7dcaa）
- tests/e2e/mountain-waypoints-display.spec.ts: 5 cases ✓ 已修（子 sprint 2, commit a7762fb）
- tests/e2e/mountain-featured-posts.spec.ts: 5 cases ✓ 已修（子 sprint 3, commit ba77bad；cheap win：子 sprint 2 `listActiveMountainsViaApi` selector fix 间接修好，本子 sprint 仅 unquarantine）
- tests/e2e/activity-hero.spec.ts: 5 cases 移除（FU-44 close, commit 4c20094；obsolete cleanup，不是已修：spec 绑定 redesign 前旧 Activity Detail surface-card 设计，已删除 spec + 孤儿组件链）
- tests/e2e/community-final-polish.spec.ts: 5 cases ✓ 已修（子 sprint 4, commit 5e69e33）

**额外 note**: main 上还有 1 个 tests/e2e/import-dedupe-flow.spec.ts case main-fail / feature-pass，疑似环境波动，不入 inventory。

**已知 flake 记账**: tests/e2e/debug-tokens.spec.ts 内 2 个 non-quarantined case (token preview buttons share exact size specs / icon button missing aria label) 在子 sprint 1 跑后出现 registerFreshUser auth/login navigation 60s timeout flake，同分支单 spec 重跑通过 confirmed flake，未 quarantine，作为已知 flake 跟踪。若未来反复出现再单独 case sprint 拆解 helper 重置。

**修复策略**:
- 按 spec 文件分组单 sprint 修（根因相似度组合）或全套独立 sprint
- 修一项移一项 quarantine（test.fixme → test）
- 全部 case 修完后关闭本 FU + 启用全量 e2e gate

**涉及**: 上述 8 个 spec 文件 + 对应业务代码（每个 case 根因决定）。

---

### FU-47 · 地图组件实施 (MapLibre + PMTiles 自托管)

- **优先级**: P1（docs §14 第 5 步实施门面缺失 + 用户验收发现）
- **归属阶段**: 阶段 4 / 阶段 5
- **状态**: 🟡 in-progress

**背景**: docs/map-weather-brief.md §4 / §5 / §14 第 5 步定义了"MapLibre GL JS + PMTiles / Protomaps 自托管 OSM 衍生底图 + 业务 GeoJSON 叠加层"地图方案（已与 Mapbox 方案对比后锁定，理由：大陆访问可控 / 长期 0 费用 / 无 Attribution 限制）。入册时代码层 grep MapLibre / pmtiles / protomaps 0 hit；FU-47(a) 已补齐底图基建 + GeoJSON endpoint + debug demo，但 Mountain Detail / Trek / Activity 仍未接入真实业务页面。

**设计权威（实施时必须读 + 1:1 复刻视觉，不可自由发挥）**:
- design-system/ui_kits/mobile/WeatherMapModules.jsx 含 3 个地图组件 standalone 设计（line 252-595）:
  · RouteSnapshotMap (line 252) — Mountain Detail 路线地图，三态 ok / fallback / unavailable
  · ActivityRouteMap (line 342) — Activity Detail 完整轨迹 + 3-stat strip (距离/时长/最高海拔)
  · TrekReferenceMap (line 415) — Trek 轻量参考，含 progress / weak / offline 状态
- 共享 atoms 在同文件：TopoMap (line 197) 等高线渲染基础 / MapWaypointStrip / ReferenceFootnote
- 配套 showcase frames：MountainDetailRouteUnavailable / MountainDetailRouteFallback / ActivityDetailRouteOnly / TrekReferenceShowcase 等

**业务价值**: 用户进 Mountain Detail 看路线/关键点位需真实地图理解地形；Trek 实时记录需轻量地图反馈位置；Activity Detail 轨迹快照需要真实地理 context。docs §3.1 已明确"地图职责"不承担专业导航，仅作轻量参考。

**子 sprint 进度**:
- (a) ✅ done: MapLibre + PMTiles 基建落地。最终 baseline 锁定 mountain-bbox local packs（30km × 30km 正方形 + z=9-12 四层 + dark flavor + 1:1 aspect-ratio container），Supabase Storage public object、`/api/mountains/geojson`、`/debug/map-prototype` demo page、10km 华山轨迹验证均完成（merge `0fd292d`）。
- (b) 🟢 next candidate: Mountain Detail + Activity 实际接入 mountain-bbox PMTiles。按 (a) baseline 方案接入真实 `RouteSnapshotMap` / `ActivityRouteMap`，并设计 300 山峰 PMTiles 自动生成 + 上传 pipeline。
- (c) 🟢 pending: Trek 轻量参考地图接入 `TrekReferenceMap`，仍遵守"轨迹记录是核心，地图是辅助"定位。

**实施建议**（按 docs §14 第 5 步分解，可拆 3 子 sprint）:
- (a) ✅ 已完成：MapLibre GL JS 依赖引入 + Protomaps PMTiles 自托管（Supabase Storage public object）+ 业务 GeoJSON 输出接口 + debug demo 验证
- (b) Mountain Detail + Activity 地图层接入：1:1 复刻 RouteSnapshotMap / ActivityRouteMap 设计（含 fallback / unavailable 状态）+ GeoJSON 山峰位置 / 路线 / 关键点位 / 风险点叠加 + per-mountain PMTiles pipeline
- (c) Trek 轻量交互接入：1:1 复刻 TrekReferenceMap 设计，保持浅 zoom / 轻参考 / 不做专业导航

**不在 scope**:
- 不做专业导航 / 离线 / 路径纠偏
- 不接天地图主底图（仅可选影像层，本 FU 内不接）
- Share Engine 继续走 SVG 静态轨迹（docs §5.1 已定）
- Explore / Community 不引入重地图（docs §5.1 已定）

**涉及**:
- 新增 src/components/map/ 地图组件层（MapLibre wrapper + 三个组件 RouteSnapshotMap / ActivityRouteMap / TrekReferenceMap）
- 新增 src/lib/map/* GeoJSON output service
- src/app/(main)/explore/[id]/page.tsx 接入 Mountain Detail 地图
- src/app/(flow)/trek/* 接入 Trek 轻量地图
- src/components/activity/ActivityRouteMap.tsx 重写为 MapLibre（替换当前 SVG）
- 部署 PMTiles assets 到 Cloudflare / Supabase storage / 等

---

### FU-49 · (main)/explore/[id] mountain detail + MountainCard 孤儿组件 obsolete cleanup

- **优先级**: P2（dead code 清理，不阻塞业务）
- **归属阶段**: 阶段 5 / 阶段 6
- **状态**: 🟢 active

**背景**: FU-48 sprint 实施前调研发现 `src/app/(main)/explore/[id]/page.tsx` + `src/components/ui/MountainUI.tsx` 中的 MountainCard / MountainCardLarge 跳 `/explore/<id>` 是孤儿状态：
- ExploreMountainCard (`src/components/ui/ExploreMountainCard.tsx:69`) 跳 `/mountain/<id>` 是用户实际访问主路径，已 import 在 `(main)/explore/ExploreClient.tsx`
- MountainCard / MountainCardLarge in `MountainUI.tsx` grep 0 hit 业务 import，是孤儿组件
- `(main)/explore/[id]/page.tsx` 仅 e2e spec / 孤儿卡片假设入口，无真实用户访问

与 FU-44 close (activity-hero obsolete cleanup) 同范式。

**实施建议**:
- 删除 `(main)/explore/[id]/page.tsx`
- 删除 MountainCard / MountainCardLarge from `MountainUI.tsx`（grep 验证无外部 import）
- 删除仅旧版引用的 dead CSS
- **关键依赖**: `mountain-waypoints-display.spec.ts` (FU-46 子 sprint 2 已修) + `mountain-featured-posts.spec.ts` (FU-46 子 sprint 3 已修) 走 `/explore/<id>`，需:
  · 选 (a): 改 spec URL 为 `/mountain/<id>`，验证 testid 在新版 `(flow)/mountain/[id]/MountainDetailClient.tsx` 是否齐全（waypoint-display-* / mountain-featured-posts-section / etc）— 大概率部分缺失需补 testid
  · 选 (b): 这两个 spec 也 obsolete cleanup（标 FU-49 删除），与 FU-44 activity-hero 同范式 — 但 FU-46 inventory 完成进度回退（-10 cases）
  · 选 (c): 添加 `/explore/<id>` → `/mountain/<id>` redirect，保留 spec 路径但页面不存在 — 最小改动但有 magic
  · 具体方向由 V1 Phase 1 探索决定

**涉及**:
- `src/app/(main)/explore/[id]/page.tsx` 删除
- `src/components/ui/MountainUI.tsx` MountainCard + MountainCardLarge 删除
- 可能 `src/app/components.css` 删除关联 dead CSS
- `tests/e2e/mountain-waypoints-display.spec.ts` 改 URL 或 obsolete
- `tests/e2e/mountain-featured-posts.spec.ts` 改 URL 或 obsolete

---

### FU-51 · 上线前山峰信息完整性 + 天气 tier 分级 + 刷新逻辑联合校验

- **优先级**: P1（上线门禁项 — 阻塞正式上线，但当前阶段不实施）
- **归属阶段**: 上线准备 / 阶段 6
- **状态**: 🟢 active

**背景**: 当前阶段山峰数据 (mountains 表) 处于待完善状态，每座山的 `weather_priority_tier` 级别未根据真实热度数据分配（FU-50 Phase 4 验收时所有 20 座山均为 tier=C 默认值，未做合理分级）。FU-50 Phase 4 验收前讨论中明确：当前不纠结 tier 准确性，作为上线前联合校验项处理。

后端 cache + tier 逻辑已就绪（FU-48 / FU-50 验证）:
- src/lib/weather/weather-core.ts TIER_CONFIG (S/A/B/C 1h/6h/24h/24h 刷新)
- mountains 表 weather_priority_tier 字段
- weather_cache 表 + stale-while-revalidate 策略

但 tier 实际分配 + 数据完整性 + 监控未做。

**联合校验三项**:

1. **山峰信息完整性 audit**:
   - 所有 mountains 行核心字段非空: latitude / longitude / altitude / difficulty / min_license / description / cover_image
   - 跑 SQL audit 报告缺字段山峰清单
   - 运营 / admin 补录缺失字段
   - 验收: 0 行缺失

2. **weather_priority_tier 分级合理性**:
   - 按 docs/map-weather-brief.md §9.3 推荐配比分配:
     · S 层 25 座 (核心热门)
     · A 层 75 座 (常规活跃)
     · B 层 250 座 (长尾)
     · C 层 其余 (按需)
   - 根据近 7 天 / 30 天访问数据计算热度
   - 实施热度升降级任务 (cron / scheduled task per docs §9.5)
   - 验收: 配比与 docs 一致 + tier 字段全部填充

3. **天气刷新逻辑实际生效校验**:
   - cache 命中率监控（埋点 / log）
   - QWeather 调用频率监控（防止误超免费额度）
   - 跑一次完整生产场景 (访问主流山峰) 验证 cache 命中行为
   - 添加 dashboard / metric 或简单 log 报告
   - 验收: 月度调用预估 ≤ docs §9.3 估算的 34,500 次

**实施依据**: docs/map-weather-brief.md §9 (400 山缓存策略) + §9.5 (热度升降级) + §15.2 (天气验收)。

**触发来源**: FU-50 Phase 4 验收讨论 — 用户判断 tier 准确性当前阶段不实施，作为上线前联合校验项独立跟踪。

**涉及**:
- supabase mountains 表数据补录（运营 / admin）
- 可能 supabase scheduled task / cron 实现 tier 升降级
- src/lib/weather/* 监控埋点（metric / log）
- docs/release-checklist.md 上线 checklist 加入这三项

**不在 scope（已就绪，FU-48 / FU-50 已落地）**:
- 不动 weather-core / cache 实现
- 不动 TIER_CONFIG 阈值（docs §9.3 已锁定）
- 不重写 QWeather adapter

**实施时机**: 不立即启动，作为上线门禁项跟踪。所有功能性 sprint 完成 / 接近上线时启动。

---

### FU-52 · PMTiles 实验包 cleanup + 全国主包保留决策

- **优先级**: P2（存储治理 / FU-47(a) 副产物）
- **归属阶段**: 阶段 5 / 地图基建后续
- **状态**: 🟢 active

**背景**: FU-47(a) Phase 4 为验证地图产品方向，临时生成并上传多组 PMTiles 实验包：v5 6 组合 mountain-bbox candidate、v7 `z=11-12` 双层、v8 `z=9-12` baseline，以及早期 `z=7` / `z=8` 中国 bbox 全国主包。用户已明确 V3 不删除旧 PMTiles，cleanup 独立跟踪。

**实施建议**:
- 盘点 Supabase Storage `map-tiles/basemap/` 下所有实验对象 + `/tmp/peak-trekker-maptiles/` 本地候选文件
- 保留 v8 baseline `huashan-bbox30-z9-12.pmtiles`
- 删除或 archive v5/v7 已否决候选包
- 单独评估 `china-z7-20260519.pmtiles` / `china-z8*` 是否仍保留作 Explore 兜底 / 全国概览，否则清理
- 清理前输出对象清单 + 文件大小 + 删除计划，执行后 Range/public URL 验证

**不在 scope**:
- 不改变 FU-47(a) 已锁定的 mountain-bbox baseline
- 不接入 Mountain Detail / Trek / Activity
- 不删除未经过用户确认的远程对象

**涉及**:
- Supabase Storage `map-tiles` bucket
- `/tmp/peak-trekker-maptiles/` 本地实验产物（系统临时目录，是否清理由执行时确认）
- docs/follow-ups.md cleanup 记账

---

### FU-53 · SharePosterButton (legacy) obsolete cleanup

- **优先级**: P2
- **归属阶段**: FU-44 范式 / 阶段 6 后续 cleanup
- **状态**: 🟢 active

**背景**: 老版"分享 sheet"组件 `src/components/ui/SharePosterButton.tsx` 已被 `/share` 路由的新分享编辑器（`src/app/(flow)/share/ShareClient.tsx`）取代，但调用方未清理：
- `src/app/(main)/share-card-lab/page.tsx`（debug 入口）
- `src/components/profile/ProfileCommunitySections.tsx:185`（"分享素材 / 默认先给你最适合直接发出的推荐预览"）

**实施建议**:
- 删除 `SharePosterButton.tsx` + 所有 import 引用
- 改 `ProfileCommunitySections.tsx:185` 走新 `/share` 或移除入口
- 删 `share-card-lab` debug 页面（或改造为 `ShareClient` 演示）
- 跑 grep 确认 `SharePosterButton` 0 hit

**触发来源**: FU-46 子 sprint 4 Phase 4 视觉 review（Issue 1）

**涉及**: `SharePosterButton.tsx` + `share-card-lab/page.tsx` + `ProfileCommunitySections.tsx`

---

### FU-54 · ProfileLicenseProgressSection 重设计

- **优先级**: P3 上线前
- **归属阶段**: 阶段 6 后 / 上线前
- **状态**: 🟢 active

**背景**: FU-46 子 sprint 4 in-sprint patch 删除了 `ProfileV2Client.tsx` 中的 `<ProfileLicenseProgressSection />` render（该 render 在子 sprint 1 commit `880f703` 为通过 e2e case 误恢复，但用户业务上不要这个模块）。源文件 `src/components/profile/ProfileLicenseProgressSection.tsx` 保留，用户希望重设计后再上线。

**实施建议**:
- 与用户对齐重设计目标（执照进度展示形态 / 等级阈值口径 / 资格判定逻辑 / 入口位置）
- 重新设计后 render 回 `ProfileV2Client.tsx`
- 解除 `tests/e2e/debug-access.spec.ts:108` profile license progress 的 `test.fixme`（同时按新设计校准 spec assertions）

**触发来源**: FU-46 子 sprint 4 Phase 4 视觉 review（Issue 2）

**涉及**: `ProfileLicenseProgressSection.tsx` + `ProfileV2Client.tsx` + `debug-access.spec.ts:108`

---

## Known Issues

### Known Issue · checkin 数据字段写入路径异常 (2026-05-21 FU-11 sprint 期间发现)

- **现象**: 某些 checkin 数据 (如 activity `7707122f-bebe-4b04-b904-1ad4397b706a`) 的 `checkin.distance_meters` / `checkin.elevation_gain_meters` / `checkin.max_elevation_meters` 字段被写入 0 而非 null；`checkin.duration_seconds` 被写入 60 (1 分钟)。同条 checkin 关联的 session 数据真实 (`distance_m=8300m` / `ascent_m=1465m` / 时长 3h)。
- **关联现象**: Activity Detail 优先用 checkin 字段 → 显示 `0m / 1m / -- / --`；FU-11 sprint 已加入口 gate 隐藏脏数据活动 publish UI，Activity Detail 数据展示保持真实异常以便用户看到数据问题。
- **待 root cause 调查**: trek 服务定时写入 / N2C close action / `verify_summit_checkin` RPC 等写入路径中哪一条产生了 0/60 异常值；是否其他 source type (用户上传 / 截图识别) 也有类似问题。
- **处理方向**: 后续 sprint 单独调查 (体量未定，可能开新 FU 或并入 FU-42 整体废除 status + 字段写入完整性审计)。

---

## Closed Follow-ups（30 条）

### FU-11 ✅ 活动详情底部按钮悬浮 + 主次互换 (含 in-sprint patch: publish 路由 status filter 拆除 / 数据健康度 gate)

- **关闭原因**: footer 改 fixed bottom + safe-area + backdrop blur + border-top + 主次互换 (左 `SecondaryButton` "发布到山友圈" / 右 `PrimaryButton as="a"` "生成分享")；`ActivityInlineActions` 加 `canPublishToCommunity` gate (`mountain.id !== null && hasMeaningfulActivityData`)；未关联山峰 / 脏数据活动 footer 只显示"生成分享"全宽；publish 路由 application-layer status filter 拆除 (FU-42 子操作 folding)；Activity Detail 数据展示保持原 fallback chain 真实异常。
- **关闭 commit**: `6c0b0e8` / `b9203a0`
- **关闭时间**: 2026-05-21

---

### FU-1 ✅ 同一份轨迹文件去重（防伪造）

- **关闭原因**: checkins 新增 track_content_hash + 用户级 partial unique index；parse 路由 200 + dup payload 早提示；confirm 路由服务端重算 hash + unique violation 兜底 race；ImportPreview dup banner + 查看已存在活动 CTA；跨用户允许 / 截图源 / Trek realtime 不在 scope（NULL 不触发约束）
- **关闭 commit**: `665b0cc`
- **关闭时间**: 2026-05-17

---

### FU-3 ✅ Profile 最高海拔选项 B

- **关闭原因**: A1 修复时落地（决策 1 选项 B - GPS 实测海拔优先 fallback 山峰海拔）
- **关闭 commit**: `8ad4906`
- **关闭时间**: 2026-05-13

---

### FU-7 ✅ 历史 lint debt 清理

- **关闭原因**: Pre-3.c 顺手落地（eslint.config.mjs globalIgnores 屏蔽 .claude / design-system / Peak Trekker Design System / playwright-report / output 五个非生产目录，npm run lint 0 errors / 13 warnings）
- **关闭 commit**: `7f3bbd0`
- **关闭时间**: 2026-05-16

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

### FU-17 ✅ approach_alert 距离 0m 时状态语义切换

- **关闭原因**: FU-24+17 合并 sprint 落地（SUMMIT_READY_RADIUS_M=100 + CTA 文案 ≤100m "我已登顶" / >100m "继续靠近峰顶" disabled + 服务端 verify_summit_checkin max(existing, 300m) 兜底）。原 3 段状态 plan 略调为 2 段 + CTA 文案升级，体验等价且状态机不增复杂度
- **关闭 commit**: `395d16a`
- **关闭时间**: 2026-05-17

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

### FU-24 ✅ Trek 刷新/重连恢复 elapsedSeconds

- **关闭原因**: FU-24+17 合并 sprint 落地（get_in_progress_trek_session 24h freshness gate + restoreActiveTrekSession 还原 sessionId/mountainId/elapsed/distance/ascent/trackRef/lastGps；entry validation gate 修正；startTrackingRuntime 共享 helper；含 1 个 in-sprint 补丁修 C 手动刷新 hang）
- **关闭 commit**: `f65d1b4`
- **关闭时间**: 2026-05-17

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

### FU-32 ✅ 分享编辑器兜底轨迹去除

- **关闭原因**: Pre-3.b.1 落地（删除分享模板 hardcoded fallback 轨迹；空轨迹不画假路线，单点显示真实 marker，多点显示真实路线；server PNG 与 client preview 一致）
- **关闭 commit**: `52f4970`
- **关闭时间**: 2026-05-15

---

### FU-33 ✅ Pre-3.c.1 微 sprint（OCR 配额系统 + 双接口路由）

- **关闭原因**: Pre-3.c.1 落地（screenshot_quota 表 + service-role-only RPC + Basic→Accurate fallback + 顶部 QuotaBar + UpgradeSheet placeholder；首月 5 / 续月 2 / 付费 30 产品规则按 user_id × month_key 计数；含 1 个 in-sprint patch 修 RPC ambiguous column bug；mock 测试盲区候选未来独立 sprint 补 RPC 集成测试）
- **关闭 commit**: `c01095d`
- **关闭时间**: 2026-05-17

---

### FU-39 ✅ activity-photo-linkage E2E 在干净环境下失败

- **关闭原因**: H1 命中（Next dev --webpack 标志触发 __webpack_modules__ runtime 错误，PreStart → tracking 状态转换时页面崩溃）。最小修复 = playwright.config.ts 移除 --webpack。activity-photo-linkage / screenshot-recognition 两个 spec 双 PASS，无回归。
- **关闭 commit**: `ff24596`
- **关闭时间**: 2026-05-16

---

### FU-40 ✅ Trek 退出自动暂停 + 服务端持久化

- **关闭原因**: FU-40 sprint 落地（schema 加 paused_at + paused_elapsed_seconds + status CHECK 扩展 'paused'；pause/resume actions 含幂等 + 原子 UPDATE + 24h freshness；resume 时补偿 started_at；TrekClient handleBack + popstate guard + restore paused 分支；finish_incomplete_trek 23505 幂等防御。含 2 个 in-sprint 补丁：formatElapsedHMS + elapsedTimerRef 独立修 H:MM:SS 显示与 tick 不走；finishInFlightRef + 按钮 guard 修双发 duplicate INSERT）
- **关闭 commit**: `428e2e5`
- **关闭时间**: 2026-05-18
- **已知 follow-up note（不开 FU，未来 housekeeping 时收紧）**: pause_elapsed_seconds 服务端 clamp 用 24h 硬上限而非 LEAST(input, server-elapsed)；理论上恶意客户端可传虚高值显示自己虚假 elapsed，但仅影响自身展示不污染他人数据

---

### FU-13 ✅ 活动详情"手记"功能补齐

- **关闭原因**: FU-13 + FU-14 合并 sprint 落地。MemoryNote inline 编辑 + 2000 字 normalize 计数 + approved gate UI + 取消恢复 + 保存 toast + router.refresh()。后端 update_activity_note action 早已实现，本 sprint 仅前端接入 + 顺手修复 hidden RLS write-gap（service-role 兜底）。
- **关闭 commit**: `09e1c5f`
- **关闭时间**: 2026-05-18

---

### FU-14 ✅ 活动详情"照片补传"功能补齐

- **关闭原因**: FU-13 + FU-14 合并 sprint 落地。PhotoStrip 接入 file input + 总数校验 + 上传进度 + 9 张上限 toast feedback。后端 add_activity_images action 早已实现，本 sprint 仅前端接入。含 2 个 in-sprint 补丁：删除硬编码 mock label（"13:24·山顶"等假数据）+ 已 9/9 张点按钮的 toast 反馈（aria-disabled + onClick 分支）。3 张展示限制 + 无大图查看 + 无删除入口写入 FU-31 描述补强（不在本 sprint scope）。
- **关闭 commit**: `5d80c69`
- **关闭时间**: 2026-05-18

---

### FU-41 ✅ checkins RLS write-gap 系统审计 + 剩余 path 修复

- **关闭原因**: FU-41 sprint 落地。修 3 处 user client checkins.update silent no-op（admin review 主 update 第 78 行 + fallback admin_note update 第 87 行 + trek poster persistence 第 1257 行），service-role 兜底范式延续（与 FU-13/14 fix 19dde9a 同范式）。新增静态守卫单测防再发（grep .from('checkins').update( 全树扫描 + admin client 邻近检测 + 豁免 marker syntax）。不改 RLS（defense-in-depth 保持）。canAccessAdminTools allowlist-only admin（profiles.is_admin=false）之前 silent no-op，本 sprint 后已正常持久化。Sprint 副产物：实战发现 e2e baseline rot 累积 → 入 FU-44/45/46 跟踪 + v0.15 引入全量 e2e gate 协议（grandfather 豁免到 FU-46 修完）。
- **关闭 commit**: `e178f91`
- **关闭时间**: 2026-05-18

---

### FU-44 ✅ activity-hero e2e baseline obsolete + orphan cleanup

- **关闭原因**: FU-44 close sprint 判定 `tests/e2e/activity-hero.spec.ts` 为 obsolete：该 spec 测的是 redesign 前旧 surface-card 设计 ActivityDetail，redesign 后 `/activity/[id]` 已切到新 token design，`qaHero` / `activity-hero` / `data-hero-source` 在新版无对应业务代码。已删除 obsolete spec + 孤儿组件链（`src/components/activity/ActivityDetailClient.tsx`、`ActivityDetailHero.tsx`、`ActivityRoutePanel.tsx`）+ 仅旧组件使用的 dead CSS。原 FU-44 quarantine 时误诊为 "explore vs mountain URL 偏差"，实际 spec URL `/activity/${checkinId}` 与业务一致，真实根因为 spec selector 集留在旧设计。
- **关闭 commit**: `4c20094`
- **关闭时间**: 2026-05-19

---

### FU-31 ✅ 活动详情多图（最多 9 张）展示 + 单张大图查看 + 单张删除

- **关闭原因**: FU-31 sprint 落地。PhotoStrip 重设计支持 1-9 张照片完整展示（1 全宽 / 2 双列 / 3 hero mosaic / 4 2x2 等分 / 5-9 自适应 3 列网格末行靠左），新增 lightbox 大图查看（左右切换 + 键盘 ←→Esc + 移动端滑动 + 缩略图条 + N/total 计数），单张删除（lightbox 内删除按钮 + window.confirm 二次确认 + 删除中锁定）。新后端 action delete_activity_image (POST /api/activity/actions JSON)：owner + status='approved' + field-policy gate；checkin_assets DELETE 用 user client（RLS 已允许 owner via checkins join）；checkins.photo_url 同步切换用 service-role admin client（与 FU-13/14/41 同范式）；storage.objects best-effort remove（data URL / 非 public URL 跳过）。ViewModel 调整含 assetId / isLegacyCover 处理 uniquePhotos legacy-photo 去重边界。含 1 个 in-sprint 视觉补丁 efc7748 修 8 个 UI/UX 缺陷（4 个 PhotoStrip 网格 + 4 个 Lightbox 排版）。测试基线 +1 e2e (activity-photo-gallery.spec.ts) + 1 unit (getActivityPhotoDeleteValidation)。
- **关闭 commit**: `af944a4`
- **关闭时间**: 2026-05-19

---

### FU-48 ✅ 天气组件前端真实接入 + 新 UI 改造（daily-only 折中版）

- **关闭原因**: FU-48 sprint 落地 daily-only 折中版。当前真实主入口 `/mountain/[id]` 改为前端调用 `GET /api/weather/[mountainId]`，新增 client `WeatherSection` + `weather-view-model` helper，覆盖 loading / live / stale / unavailable 三态与 retry；UI 按 `WeatherMapModules.jsx` WeatherBlock 复刻核心结构，但基于当前 `WeatherResponse` 字段不做 hourly bar chart / visibility KPI / 假数据。出发窗口规则：stale、风速 ≥39 km/h、今日降水 ≥5 mm → 需复核，否则可出发；降水按 mm 处理。遗留 `(main)/explore/[id]` 静态天气与孤儿 MountainCard 清理另开 FU-49 跟踪。
- **关闭 commit**: `5294a9d`
- **关闭时间**: 2026-05-19

---

### FU-50 ✅ 出发窗口分级判定规则增强 (三态 + 6 维度)

- **关闭原因**: FU-50 sprint 落地三态分级 + 6 维度评估替换 FU-48 daily-only 实施版简化规则。三态 (`can_depart` / `needs_evaluation` / `not_recommended`) + 文案"可出发 / 建议评估 / 不建议出发"；6 维度（体感温度 / 风速 / 降水 / 描述 / 海拔加权 / stale）+ max 聚合算法；海拔 3000-5000m 任一中等异常升级 🔴 / 海拔 ≥ 5000m 默认 🟠 + 红色自然风险升 🔴 / stale 不参与海拔升级；描述同时匹配 `current.description + forecast[0].description` 红橙关键词，红优先。Phase 4 用户反向校验真实库 10 座山规则计算 100% PASS（含 FU-48 漏洞场景：慕士塔格峰 7546m / -17°C / 中雪从"可出发"正确切到"不建议出发"）+ 三态截图视觉 PASS。**已知后续优化（不阻塞）**: 描述橙色关键词列表未含"毛毛雨 / 强毛毛雨 / 阵雨"等中等降水描述，未来可补全（玉龙雪山 review 行 #6 即触此 finding，本 sprint 仅靠降水维度兜底）。
- **关闭 commit**: `7a02dca`
- **关闭时间**: 2026-05-19

---

### FU-47(a) ✅ MapLibre + PMTiles mountain-bbox 底图基建

- **关闭原因**: FU-47(a) 子 sprint 落地 MapLibre + PMTiles 自托管底图基建。先完成中国 bbox z=7 Supabase Storage 主包 + `/api/mountains/geojson` + `/debug/map-prototype` 基线；Phase 4 经 v3/v4/v5/v7/v8 多轮候选实验验证后，用户视觉验收 PASS 并锁定 production Mountain Detail 基线：mountain-bbox local packs（30km × 30km 正方形 + z=9-12 四层 + dark flavor + 1:1 aspect-ratio container）。最终华山 baseline 包 `huashan-bbox30-z9-12.pmtiles` 为 634.2 KiB / mountain，300 山峰累积估算 206.15 MiB（含 z=7 主包 20.4 MB）。关键设计决策：default dark + 保留 `?flavor=` debug override；dynamic `fitZoom = cameraForBounds(bbox).zoom` clamp ≤ 12；`setMaxBounds` 使用 post-fit envelope（用户 v7 Q&A 已批准）；1:1 容器匹配正方形 bbox，避免 production 卡片上下空白；保留 10km 华山示例轨迹用于尺度验证。旧实验 PMTiles（v5 6 候选 + v7 z=11-12 + z=7/z=8 全国主包）暂留 Supabase Storage，拆 FU-52 cleanup 跟踪。
- **关闭 commit**: `0fd292d`
- **关闭时间**: 2026-05-20

---

> **历史跳号编号**：FU-26 在 Pre-3.a sprint 中编号跳号未实际引入；未来新增 FU 不复用此编号，按当前最大编号 +1 顺序分配。

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
3. **更新 main HEAD**：merge 完成后把顶部"当前 main HEAD"改为本次 sprint 的 merge commit sha（**不是** docs 收尾 commit sha；docs commit 因 self-ref 限制无法引用自己的 sha，且 merge commit 语义上更准确代表 sprint 边界）
4. **更新当前 Sprint**：下一个 sprint 启动前清空或标"待启动"
5. **更新版本记录**：底部追加版本条目
6. 这一组改动作为最后一个 commit: `docs(follow-ups): close FU-XX, add FU-YY, bump head <sha> (<Sprint>)`

### V3 收尾机械化检查清单（强制执行）

每次 sprint V3 收尾时，提交 follow-ups.md commit 前必须逐项确认：

- [ ] Active FU 标题数字 = Active 列表实际条目数（grep -E "^### (FU-|Issue-)" 验证）
- [ ] Closed FU 标题数字 = Closed 列表实际条目数
- [ ] awk 自动统计实际 entry 数交叉验证（命令：见本文件末"机械化校验脚本"）
- [ ] 顶部"当前 main HEAD"已更新为本次 sprint 的 merge commit sha
- [ ] 顶部"当前 Sprint"已更新（标"待启动"或下个 sprint 名 + 并行情况）
- [ ] 版本记录追加 v0.X 条目（含日期 + 关闭 FU 清单 + 新增 FU 清单 + sprint 范围）
- [ ] 每条新关闭 FU 含 commit hash + 关闭日期 + 一句话原因
- [ ] 新增 FU 编号严格连续（不复用跳号编号 FU-26）

任一项不通过 → 修正后再提交 follow-ups.md commit。

引入背景：Pre-3.c V3 收尾发现 v0.5 加 FU-31 时标题没同步（应 17 写 16），导致 v0.7 收尾算术错误（按过期 16 算出 22，实际 23）。本机械化清单防再发生。

### 并行 sprint 处理规范（v0.8 起生效）

当两个或多个 sprint 同时进行（从同一 main HEAD 分出独立分支）：

1. 两 sprint 各自 V3 收尾时按相同 V3 流程
2. 后 merge 的 sprint 在 V3 收尾前必须：
   - git fetch origin main
   - git rebase origin/main（或在 feature 分支 merge main into self）
   - 解决 docs/follow-ups.md 冲突时保留先 sprint 的所有变更 + 追加自己 sprint 的变更
3. 后 sprint 的"当前 main HEAD"字段在 rebase 后才能定值
4. 两 sprint 引入的新 FU 编号必须互不重叠（先启动 sprint 占编号 X，后启动 sprint 用 X+N，N≥1）
5. 协调建议：复杂度高 / 修复优先级高的 sprint 先 merge，给后者留缓冲
6. 复制规范：发送给 Codex 的指令必须放单一 fenced code block（v0.6 起强制，v0.8 起写入本文件）

### 跨对话交接时

如对话长度接近上限或主动切换新对话：
- 当前 Claude 在最后一条消息明确说"切换新对话，新对话请读取 transcript + docs/follow-ups.md + docs/target-prd.md"
- 不需要额外的"上下文摘要文档"——本文件 + transcript 已足够

---

## 版本记录

### v0.26（2026-05-21）

FU-11 · 活动详情底部按钮悬浮 + 主次互换 收尾 (含 2 个 in-sprint patch + folding FU-42 子操作)

- 解除 FU-11 sprint 主体: footer 改 `position: fixed` + `safe-area-inset-bottom` + `backdrop-filter: blur(18px)` + border-top + 渐变背景；按钮主次互换 (左 `SecondaryButton` "发布到山友圈" / 右 `PrimaryButton as="a"` "生成分享")；HelpLink + hint 跟随 fixed footer；`activity-detail-page` 加 `--act-actions-footer-height: 148px` 让出底部空间；toast 上移到 footer 上方；commit `6c0b0e8`
- in-sprint patch: publish 路由 `src/app/(main)/community/publish/[checkinId]/page.tsx` 删除 application-layer `.eq('status', 'approved')` filter，类型 annotation 改三态 union (folding FU-42 选 C 方向子操作)；commit `b9203a0`
- in-sprint patch (含在 commit `6c0b0e8`): `ActivityInlineActions` 加 `canPublishToCommunity` gate，条件 `mountain.id !== null && hasMeaningfulActivityData`；`hasMeaningfulActivityData` 基于 Activity Detail 已计算 metrics 字段 (`distanceKm > 0 || ascentM > 0 || durationSeconds > 60`)；未关联山峰 / 脏数据活动 footer 只显示"生成分享"全宽 (CSS `.act-actions__button:only-child { grid-column: 1 / -1; }`)；HelpLink + hint 也隐藏
- Activity Detail 数据展示保持 main 原 fallback chain (脏数据活动仍显示 `0m / 1m / --`)，让用户看到真实异常
- FU-42 决策结论记录: 用户选 C 方向 (完全移除 status)；剩余实施 scope 后续 sprint 处理
- Known Issue 注脚: checkin 数据字段写入路径异常 (写入 0 / 60 异常值)，待后续 sprint root cause
- 计数: Active 25 → 24 (FU-11 closed) / Closed 29 → 30
- main merge: `4c2417c`
- preflight: lint 0e/13w · node --test 246p · build PASS · 子 spec screenshot-recognition-flow 2 passed
- 用户 Phase 4 浏览器视觉验收: PASS (含 5 轮 in-sprint patch 全部覆盖)

### v0.25（2026-05-21）

FU-46 子 sprint 4 · community-final-polish baseline rot 收尾

- 解除 `tests/e2e/community-final-polish.spec.ts` 5 个 `test.fixme`（CommunityCard v2 token + threshold metadata + tags chips + 3-line clamp + 详情链接；CommunityDetail post-shell 单壳 + source card 外置；components.css v2 styles incremental）— commit `5e69e33`
- in-sprint patch: 删除 `ProfileV2Client.tsx` 中误恢复的 `<ProfileLicenseProgressSection />` render（误恢复源自子 sprint 1 commit `880f703`）；`tests/e2e/debug-access.spec.ts:108` profile license progress case 重新 `test.fixme`，reason `"licensed-progress hidden pending redesign · FU-54"`；组件源文件保留 — commit `e7fbaf5`
- 新增 FU-53（SharePosterButton legacy obsolete cleanup，P2，FU-44 范式）
- 新增 FU-54（ProfileLicenseProgressSection 重设计，P3 上线前）
- FU-46 inventory: 40 cases → 35 cases（剩余 3 spec: app.spec 18 / button-token-migration 6 / community-acceptance 16，可按子 sprint 5/6/7 续修）
- 子 sprint 1 已修记录加 debug-access:108 撤销说明注脚
- 计数: Active 23 → 25（+FU-53 +FU-54，FU-46 仍 active）/ Closed 29 不变
- main merge: `cff778f`
- preflight: lint 0e/13w · node --test 246p · build PASS · 子 spec community-final-polish 5p · debug-access 1 skipped + 2 passed
- 用户 Phase 4 浏览器视觉验收: PASS（Profile 375px 无 license progress 模块 / 无 horizontal overflow / 真实数据账号 14 山行 5077m 2 省份渲染正常）

**v0.24 — 2026-05-20**: FU-47(a) MapLibre + PMTiles 自托管底图基建完整落地。

**实施**: 新增 MapLibre GL JS + PMTiles + Protomaps basemap dependencies；新增 `src/lib/map/*` 山峰 GeoJSON transform + `GET /api/mountains/geojson`（service-role 读 mountains + HTTP cache）；新增 `/debug/map-prototype` QA demo page，包含 Supabase Storage public PMTiles、20+ mountains 点位、hover/click 山峰信息、MapLibre navigation control、10km 华山示例轨迹、动态 zoom review panel。

**PMTiles strategy lock**: Phase 4 从全国 bbox z=7/z=8 对比，收敛到 mountain-bbox local packs。最终 baseline 为 30km × 30km 正方形 bbox + z=9-12 四层 + dark flavor + 1:1 aspect-ratio container。华山基线包 `huashan-bbox30-z9-12.pmtiles` 实测 634.2 KiB / mountain；300 山峰累积估算 206.15 MiB（含 z=7 主包 20.4 MB）。

**关键设计决策**: default dark flavor 与 Peak Trekker 深色 UI 对齐；保留 `?flavor=` debug override；`fitZoom = cameraForBounds(bbox).zoom` 并 clamp ≤ 12；zoom 上限固定 z=12 避免 overzoom 模糊；pan bounds 使用 post-fit envelope（用户 v7 Q&A 已批准）而不是 raw bbox，保证 375px 下完整 bbox 可见；1:1 地图容器匹配 30km 正方形 bbox，避免 production Mountain Detail 卡片上下空白。

**验证链路**: v3/v4 验证 z=7 vs z=8 + 真实轨迹尺度；v5 验证 25/30/50km × z=12/13 六组合；v7 验证 30km × z=11-12 双层 + 动态 fitZoom；v8 最终切 z=9-12 四层 + 1:1 容器。用户 Phase 4 视觉验收原话："整体样式我都验收过了，没有任何问题"。

**后续拆分**: FU-47 父项保持 active/in-progress，后续 (b) 接 Mountain Detail + Activity（含 300 山峰 PMTiles 自动生成 + 上传 pipeline），(c) 接 Trek 轻量参考地图。新增 FU-52 跟踪 PMTiles 实验包 cleanup + z=7/z=8 全国主包是否保留作 Explore 兜底。

测试基线 +N（mountain GeoJSON unit + map prototype e2e）。**Active 22 → 23**（FU-47 父项保留 + 新增 FU-52）；**Closed 28 → 29**（+FU-47(a) 子 sprint）。

v0.8 机械化清单第十六次实战。

**v0.23 — 2026-05-19**: FU-50 出发窗口分级判定规则增强完整落地。

**实施**: 新增 src/lib/weather/weather-view-model.ts `DeparturePolicy` 类型 + 6 维度判定 + max 聚合 + 海拔加权 + buildDeparturePolicy 函数。WeatherSection 三色 chip（绿 success / 橙 warning / 红 error）+ 三文案。规则依据：户外登山常识（蒲福风级 + 气象降水标准 + 失温阈值 + 高原反应海拔分级）。

**反向校验**: Phase 4 用 Codex Supabase 插件查 20 座山 + 选 10 座（6 ≥5000m + 3 座 3000-5000m 加权验证 + 1 座 <3000m 对照）+ 调本地 /api/weather/[mountainId] 真实数据 + 跑 buildDeparturePolicy 计算 + 输出 markdown 表。10 行规则计算 Claude review + 用户视觉验收 100% PASS。

**FU-48 漏洞已修验证**: 慕士塔格峰 7546m / -17°C / 中雪从"可出发"→"不建议出发"（体感 ≤-10 + 描述含中雪 + 海拔默认 🟠）；梅里雪山 6740m / 2°C / 中雪从"可出发"→"不建议出发"（描述含中雪触发，证明 description 维度 FU-48 漏洞的核心修复）。

**协议合规化**: 严格遵守 codex-no-self-visual-acceptance — Phase 3 后 STOP 不自报 PASS；Phase 4 准备 review package 仅给证据；用户 review 后 Claude 单独发 V3 指令；Codex 仅在 V3 指令后 push + merge。**首次完全符合新协议的 sprint 闭环**。

**协议补强 finding**: Phase 4 Step 2 一度出现当前会话未暴露 Supabase SQL tool 的情况；用户重新触发 `@supabase` 后 Codex Supabase 插件恢复并完成查询。未创建 `scripts/_temp_fu50_audit.ts` fallback 脚本，未使用第三方 REST fallback。

**FU-48 视觉验收 post-merge PASS 追认**: FU-48 sprint Codex 跳过用户视觉验收直接 push merge 是协议违反，本次 FU-48 经用户 manual smoke (样式 + 数据 OK) PASS 追认；规则简化漏洞由 FU-50 独立修复（已合规）。

**新增 FU-51 (P1 上线门禁项)**: 跟踪山峰 tier 准确性 + 信息完整性 + 刷新逻辑生效联合校验。当前 mountains 表 20 座全 tier=C 是默认值，docs §9.3 推荐配比 (S 25 / A 75 / B 250 / C 其余) 上线前需补。

**已知后续优化**: 描述橙色关键词补"毛毛雨 / 强毛毛雨 / 阵雨"系列（不阻塞，FU-50 closed 注脚记录）。

测试基线 +N（六维度单元测试 + 三态 e2e mock 断言）。**Active 22 → 22**（关 FU-50 -1 + 加 FU-51 +1 = 净 0）；**Closed 27 → 28**（+FU-50）。

v0.8 机械化清单第十五次实战。

**v0.22 — 2026-05-19**: FU-48 天气组件前端真实接入 daily-only 折中版落地。

**范围决策**: 用户与 Claude 调研确认 backend `WeatherResponse` 当前缺 hourly forecast / visibility 字段，本 sprint 选 C daily-only 折中，只做前端真实接入，不扩 backend / schema / provider。实施范围改为当前真实主入口 `/mountain/[id]`，遗留 `/explore/[id]` 不在本 sprint 修改。

**前端**: `/mountain/[id]` 天气区从服务端直接读 `weather_cache` 改为 client `WeatherSection` 调 `GET /api/weather/[mountainId]`。新增 `src/lib/weather/weather-view-model.ts` 将 API response 转为 daily-only ViewModel，新增 `src/components/mountain/WeatherSection.tsx` 实现 loading / live / stale / unavailable + retry。移除旧内联 HourBar 模拟、visibility placeholder、缓存直读天气 props。CSS 新增 `.mountain-weather-*`，保留 `.weather-reminder-*` 供遗留 `/explore/[id]` 使用。

**daily-only UI**: 复刻 `design-system/ui_kits/mobile/WeatherMapModules.jsx` WeatherBlock 的 current row / 出发窗口 chip / 今日明日 forecast row / 风与降水 KPI / risk note / reference footnote；不渲染 hourly bar chart，不渲染 visibility KPI，不制造假数据。

**规则**: stale 只由 `WeatherResponse.stale === true` 控制；风速 ≥39 km/h 或今日降水 ≥5 mm 或 stale → "需复核"，否则 "可出发"；`forecast.precipitation` 按降水量 mm 展示，不按概率。

**测试与视觉验收**: `npm run lint` PASS（0 errors / 13 warnings）；node tests 242 pass；`npm run build` PASS；`npx playwright test tests/e2e/mountain-weather-section.spec.ts` 4/4 PASS。375px 视觉自查覆盖 live / stale / unavailable / loading：`scrollWidth=375`，天气卡片与 fixed CTA 无重叠，未出现能见度或小时柱文本。

**新增 FU**: FU-49 跟踪 `(main)/explore/[id]` legacy mountain detail + MountainCard / MountainCardLarge 孤儿组件 obsolete cleanup。Active 21 → 21（关 FU-48 + 加 FU-49 净 0）；Closed 26 → 27。

**v0.21 — 2026-05-19**: docs 补丁 - 补 FU-47 地图组件实施 (MapLibre + PMTiles) + FU-48 天气组件前端真实接入入 Active 段。

**触发来源**: FU-31 V3 收尾后用户对 19 个 Active FU 全景反应发现两项需求漏入册 — docs/map-weather-brief.md §14 第 4 / 5 步定义的地图 + 天气前端接入在 follow-ups.md 没有对应 FU 跟踪。

**接入状态调研**:
- 地图：MapLibre / PMTiles / Protomaps grep 0 hit，Mountain Detail 仅 MapPlaceholder 静态占位，完全没实施
- 天气：后端 / API / schema / cache migration 全部完整，但 Mountain Detail 前端用 getWeatherGuidance() 本地静态文案，没调 /api/weather/[mountainId]

**地图方案对比**: 与 Mapbox 商业 SaaS 方案对比后锁定原方案 MapLibre + PMTiles 自托管（理由：大陆访问可控 / 长期 0 费用 / 无 Attribution 限制 / 无供应商锁定 + 与 docs §4 一致）。

**视觉权威**: design-system/ui_kits/mobile/WeatherMapModules.jsx 已有 597 行 standalone 设计含 4 组件（WeatherBlock / RouteSnapshotMap / ActivityRouteMap / TrekReferenceMap）+ 各状态完整覆盖，FU-47 / FU-48 实施 V1 阶段必须明确 1:1 复刻不可自由发挥。

两 FU 均标 P1 优先级（用户体感重要 + docs 已规划但实施 gap）。

零代码改动，仅 docs commit。Active 19 → 21；Closed 不变。

**v0.20 — 2026-05-19**: FU-31 活动详情多图 9 张 + lightbox + 单张删除完整落地。补齐 FU-13/14 sprint 视觉验收发现的 3 项遗漏（4+ 张展示 / 大图查看 / 单张删除）。

**前端**: PhotoStrip 重设计支持 1-9 张展示（1 全宽 / 2 双列 / 3 hero mosaic / 4 2x2 / 5-9 自适应 3 列），lightbox 局部实现含键盘 + 移动端滑动 + 缩略图条 + 二次确认，未 approved gate disable 删除入口。CSS 新增 .act-photos__layout--{four,grid} + .act-lightbox* 完整样式。

**后端**: 新 action delete_activity_image (POST /api/activity/actions JSON)：owner / status / field-policy gate → user client 删 checkin_assets (RLS owner allowed) → 若 cover 用 admin client 同步 photo_url → storage best-effort remove。data URL / 非 public URL 跳过 storage 删除。

**ViewModel 调整**: ActivityPhotoViewModel 增 assetId / isLegacyCover 处理 uniquePhotos() legacy photo_url + same-URL asset dedupe 边界（首图可能 id='legacy-photo' 但真实 asset 被隐藏，删除目标优先级：assetId 命中 → legacy-photo + photoUrl 兜底）。

**Sprint 副产物 — 视觉验收**: 实施后视觉验收发现 8 个 UI/UX 缺陷（4 PhotoStrip 网格 / 4 Lightbox 排版）。in-sprint 补丁 efc7748 修正：PhotoStrip 不预留空 slot + 4 张去 hero mosaic + 末行靠左；Lightbox 改 fixed close right-top + safe-area / 切换按钮 absolute 悬浮图片左右中间 / 删除按钮 toolbar row 独立不覆盖图片 / 图片区 place-items center 解决单张大空白。

**双盲对比记账（Plan 阶段）**: Codex Phase 1 调研抓到 Claude 漏掉的 2 处深层风险（uniquePhotos legacy-photo dedupe 边界 + storage objects best-effort remove），Claude 学到未来调研要追 ViewModel 转换层 + 第三方资源边界。

**协议遵守**: v0.16 含 build / v0.15 不全量 e2e 用户成本约束 / codex-autonomy-no-prefill Phase 1 让 Codex 自由探索 + Plan 阶段双盲对比。

测试基线 +2（1 e2e + 1 unit helper）。Active 20 → 19；Closed 25 → 26。

v0.8 机械化清单第十三次实战。首次 feature 类 sprint（不是 baseline rot 清理），UI 改动 + 后端 + ViewModel + lightbox 完整链路。

**v0.19 — 2026-05-19**: FU-44 close · activity-hero obsolete + orphan cleanup 完成。用户决策路径 C：`tests/e2e/activity-hero.spec.ts` 5 cases 不再修，宣告 obsolete 并删除。根因修正：FU-44 quarantine 时误诊为 "explore vs mountain URL 偏差"，实际 spec 访问 `/activity/${checkinId}` 与业务路径一致；真正问题是 spec 绑定 redesign 前旧 surface-card Activity Detail 的 `qaHero` / `activity-hero` / `data-hero-source` / `activity-route-section` selector 集，而当前 `/activity/[id]` 已切到 FU-13/14 接入手记/补传的新 token design ActivityDetail。清理内容：删除 obsolete spec，删除无人引用的旧组件链 `src/components/activity/ActivityDetailClient.tsx` + `ActivityDetailHero.tsx` + `ActivityRoutePanel.tsx`，并清掉仅旧 hero/panel 使用的 dead CSS；保留新版 `(flow)/activity/[id]` 与仍在使用的 `ActivityRouteMap` / `.act-route*`。验证：`rg` 确认旧 selector / component import 归零；`npm run lint` 0 errors / 13 warnings；node test 236 pass；`npm run build` PASS；遵守 v0.15 用户成本约束，不跑 e2e。FU-46 baseline accounting 移除 activity-hero 5 obsolete cases（不是"已修"），inventory 45 → 40。Active 21 → 20；Closed 24 → 25。

**v0.18 — 2026-05-19**: FU-46 子 sprint 3 · mountain-featured-posts cheap win 验证完成。解除 `tests/e2e/mountain-featured-posts.spec.ts` 5 个 quarantine case。根因不是山友经验业务实现缺失，而是子 sprint 2 已修复的共享测试辅助 `listActiveMountainsViaApi()` selector drift 传递生效：Explore 列表卡片当前使用 `/mountain/<id>` 链接，helper 已兼容 `/mountain/<id>` 与 `/explore/<id>` 两种路径后，本 spec 的 `山友经验` section、featured card、跳转、admin feature/unfeature 5 条路径全部恢复。修复策略：仅移除目标 spec 5 个 `test.fixme`，不改业务代码 / schema / RLS。验证：cheap-win 预跑目标单 spec 5/5 PASS；正式 preflight `npm run lint` 0 errors / 13 warnings，node test 236 pass，`npm run build` PASS，目标单 spec 5/5 PASS（3.1m）。FU-46 inventory 50 → 45 cases。遵守 v0.15 用户成本约束，不跑全量 e2e。Active / Closed 数字均不变（FU-46 umbrella 未关）。

**v0.17 — 2026-05-19**: FU-46 子 sprint 2 · mountain-waypoints-display baseline rot 修复完成。解除 `tests/e2e/mountain-waypoints-display.spec.ts` 5 个 quarantine case。根因确认是测试辅助 `listActiveMountainsViaApi()` 仍只读取 `a[href^="/explore/"]`，但当前 Explore 列表卡片已渲染 `/mountain/<id>` 链接；`/explore/[id]` 页面本身仍存在并已接入 WaypointsSection，WaypointsSection testid / admin waypoints API / `mountain_waypoints` schema 均无扩 scope 问题。修复策略：helper 优先读取 `data-testid="explore-mountain-card"`，兼容 `/mountain/<id>` 与 `/explore/<id>` 两种路径；移除目标 spec 5 个 `test.fixme`。验证：lint 0 errors / 13 warnings，node test 236 pass，`npm run build` PASS，目标单 spec 5/5 PASS。FU-46 inventory 55 → 50 cases。遵守 v0.15 用户成本约束，不跑全量 e2e。v0.8 机械化清单第十次实战。Active / Closed 数字均不变（FU-46 umbrella 未关）。

**v0.16 — 2026-05-19**: FU-46 子 sprint 1 · debug routes baseline rot 修复完成。3 个 quarantine case 修通: (1) debug-access:108 profile license progress — 业务 regress 修复（ProfileV2Client 恢复 ProfileLicenseProgressSection 渲染 + profile-records-server.ts 带 sourceType + 阈值 1000/2000/4000m × 3 count 计算 qualifiedForNext）; (2) debug-access:129 + debug-tokens:119 prod non-admin guard — Assumption #1 验证 page-level guard 正确方向，本身没破，被 pre-existing TS build blocker 阻挡的 false negative，修 blocker 后 guard 自动通过。

**顺手修 2 个 pre-existing TS build blocker**: ActivityDetailClient nextPhotos implicit any (caf96e4, FU-13/14 sprint 引入) + TrekClient 3 个 toast key 漏登 registry (1f1beee, FU-40 sprint 引入 trek_pause_persist_failed / trek_manual_refresh_cooldown / trek_resume_failed)。**历史成因**: FU-40 / FU-13/14 / FU-41 sprint preflight 都不含 `npm run build`，TS strict mode 编译错误一直潜伏，本子 sprint 跑 prod-mode case 触发 build 才暴露 — 与 e2e baseline rot 同性质 silent rot。

**协议增强（v0.16 引入）**: 工作流段加 "TS build preflight" 条款 — 每个 sprint preflight 强制 `npm run build`，与全量 e2e gate 不同（成本低不需用户确认）。

**已知 flake 记账**: sprint 末实测 debug-tokens.spec.ts 内 2 个 non-quarantined case (token preview / icon button missing aria) 出现 registerFreshUser auth/login navigation timeout flake，同分支重跑通过 confirmed flake，与子 sprint 1 修复 3 个 quarantine target 无关，未引入 regression。归 FU-46 umbrella 已知 flake 跟踪。

**FU-46 inventory**: 58 → 55 cases。**首子 sprint 范式确立**: 单 spec 子集验证 + 不全量 e2e + 用户成本约束 + 顺手 unblock pre-existing build blocker（与 baseline rot 同性质 silent rot）+ 同 spec non-target flake 不阻塞 V3。

v0.8 机械化清单第九次实战。Active / Closed 数字均不变（FU-46 umbrella 未关）。

**v0.15 — 2026-05-18**: FU-41 RLS write-gap 系统审计 + 剩余 path 修复完成。修 3 处 user client checkins.update silent no-op（admin review 主 update + fallback admin_note update + trek poster persistence），service-role 兜底范式延续（与 FU-13/14 fix 19dde9a 同范式）。新增静态守卫单测防再发。不改 RLS。canAccessAdminTools allowlist-only admin（profiles.is_admin=false）之前 silent no-op 改不动审批状态 / trek poster 永不持久化，本 sprint 后已修。

**Sprint 副产物 — baseline rot 暴露**: Phase 3 全量 e2e 暴露 64 个 pre-existing baseline failure（main 64 / feature 58 + FU-44 5 + FU-45 1 = 64 + 1 main-only 环境波动），全部 main 独立复现验证与 FU-41 commit 无因果。按 FU-39 quarantine 范式逐项隔离: FU-44 (activity-hero URL 路由偏差) 5 cases / FU-45 (admin-mountain-edit rich text 重复 strict-mode) 1 case / FU-46 (umbrella, 8 spec 文件 / 58 cases)。

**元层级 finding**: FU-13/14 / FU-40 / FU-33 等 sprint 仅跑相关子集 e2e，rot 多周期累积无感。v0.15 引入"V3 preflight 全量 e2e gate"协议但 grandfather 豁免直到 FU-46 修完。**用户路径决策（路 A）**: FU-41 acceptance gate 改为守卫单测 + lint + 强关联 spec (admin/trek/checkins) 通过，跳过全量 0-failure 验证（数学上 quarantine 完整可信，Step 4 未重跑）。

**P1 status**: FU-41 关闭后 P1 维持全清（FU-13 之后 P1 唯一新增即 FU-41，本 sprint 关闭后再次全清）。

**测试基线**: +1（守卫单测）。Active 19 → 21（+3 -1）；Closed 23 → 24（+1）。

**注**: v0.8 机械化清单第八次实战。首次"sprint 内连续 STOP + 策略调整 + 收尾 grandfather 豁免"案例。

**v0.14 — 2026-05-18**：FU-13 + FU-14 合并 sprint 完成。活动详情手记 + 照片补传功能接入。**重大 finding：hidden RLS write-gap** —— checkins.UPDATE RLS policy 早已 admin-only（推测早期 RLS hardening sprint 锁死），普通 owner 走 user client 写 0 行但无 error，route 假装成功。原 finding "后端 update_activity_note / add_activity_images 已上线" 误判：route.ts 代码层确实写完，但生产 RLS 让所有 owner 写入静默失败，bug 一直潜伏（早期使用方仅孤儿文件 src/components/activity/ActivityDetailClient.tsx，无人 import）到 FU-13/14 接入 UI 才被 e2e 实测暴露。修复策略：service-role 兜底（与 FU-33 OCR quota Server-only 范式一致），gate 通过后切 admin client；不改 RLS（defense-in-depth 保持）。配套 audit 暴露剩余 callsite（admin review allowlist gap + trek poster silent no-op）入 FU-41 跟踪。2 个 in-sprint 补丁：(1) 删除 PhotoStrip 硬编码 mock label "13:24·山顶/08:48·C1/06:12·出发后"（与照片内容无关的假数据，沿用历史 mock 残留）；(2) 已 9/9 张点按钮的 toast feedback（aria-disabled + onClick 分支替代真 disabled，与"待审核通过后"toast 同范式）。视觉验收用户反馈促成 3 个新 FU：FU-41 RLS write-gap 系统审计（P1，源自 sprint 内 audit）；FU-42 审核机制语义澄清（P2，源自用户质疑业务必要性）；FU-43 archive 卡片标签可读性（P2，源自验收发现）。FU-31 描述补强 3 项（4+ 张展示 + 大图查看 + 单张删除）。测试基线 +4（活动 validation 3 单元 + 1 e2e）。Active 18 → 19；Closed 21 → 23。**注：v0.8 机械化清单第七次实战 + 首次"后端已实现"假设被实战推翻 + 单 sprint 开 3 个新 FU 的高净增量记录。**

**v0.13 — 2026-05-18**：FU-40 Trek 退出自动暂停 + 服务端持久化完成。schema 加 paused_at + paused_elapsed_seconds + status CHECK 扩展；pause/resume 两个新 server action 含幂等 + 原子 UPDATE + 补偿 started_at 算法；client handleBack + popstate guard + restore paused 分支。含 2 个 in-sprint 补丁：(1) formatElapsedHMS H:MM:SS 3 段显示 + elapsedTimerRef 与 GPS runtime cleanup 解耦修 Bug 1+2（HH:MM 吞秒 + restore 后 tick 不走）；(2) finish_incomplete_trek 23505 catch + re-fetch idempotent + 客户端 finishInFlightRef guard + 按钮 loading/disabled 修 pause→finish→back duplicate INSERT 红框。已知 follow-up note：pause_elapsed_seconds 用 24h 硬 clamp 而非 LEAST(input, server-elapsed)，仅影响用户自身展示，未来 housekeeping 可收紧。Active 19 → 18；Closed 20 → 21。**里程碑：所有 P1 阻塞项全部清完**（Pre-3.a/FU-18/19/20/21/22/23/25 + FU-1/24/17/40 全闭，MVP 主路稳定，可以专注 P2 用户体验补齐节奏）。

> 注：本版数字含历史漂移修正——v0.7 (Pre-3.c V3 commit 6ef50f8) 标题数从 15→16 但只补了 FU-7 一个 closed entry，缺 Pre-3.c 自身 closed heading。本版不回填 Pre-3.c entry（其落地物已由 FU-33..39 active 段 + commits 充分反映），仅校正数字与实际数 21 对齐。Active 数字本次同样为 18，与实际一致，不需修正。

**v0.12 — 2026-05-17**：FU-24 + FU-17 合并 sprint 完成。Trek 韧性 + 登顶 UX 综合修复 ABCD 4 项：(A) elapsedSeconds 从 started_at 恢复 + 24h freshness gate；(B) 状态机直接进 tracking 不踢回选山 + entry validation gate 修正；(C) 手动刷新按钮 + 2500ms timeout + snapshot fallback 防 hang（含 1 个 in-sprint 补丁修 live 态 requestCurrentGpsPosition 与 watchPosition 并发竞争）；(D) 登顶范围 CTA ≤100m "我已登顶" + 服务端 300m 兜底。FU-17 原 3 段状态 plan 略调为 2 段 + CTA 文案升级（状态机不增复杂度，体验等价）。startTrackingRuntime 抽共享 helper 避免 stale callback 时序污染。测试基线 217 → 222 (+5)。新增 FU-40 Trek 退出自动暂停 active（已锁紧跟启动）。所有 P1 阻塞项接近清完（FU-24/1/Pre-3.a 全闭，FU-40 待启）。Active 20 → 19；Closed 19 → 21。

**v0.11 — 2026-05-17**：FU-1 同一份轨迹文件去重（防伪造）完成。checkins 新增 track_content_hash 列 + 用户级 partial unique index（NULL 不冲突）+ SHA-256 normalize hash helper（6 位经纬度 / 整数海拔 / ISO 时间，无效 / 缺失字段归一化空字符串）+ parse 路由 200 + dup payload 早提示 + confirm 路由服务端重算 hash + unique violation race-safe 兜底 + ImportPreview dup banner + 查看已存在活动 CTA + 4 unit / 静态 / e2e + GPX ele 变种 fixture。视觉验收 PASS（dup 触发正确 / 跳活动详情正确 / pre-commit 微调 banner 上下间距）。跨用户允许同一 hash（共享 gpx 团队场景）；截图源 / Trek realtime 不在 scope（NULL 不触发约束）。Active 21 → 20；Closed 18 → 19。

**v0.10 — 2026-05-17**：FU-33 Pre-3.c.1 OCR 配额系统完成。3 个 migration（create + advisor harden + in-sprint patch fix RPC ambiguous column）+ 双接口 Basic→Accurate fallback + service-role-only RPC + QuotaBar UI + UpgradeSheet placeholder。视觉验收 PASS（5/5→0/5 配额递减 / 耗尽走 sheet / 文案完整）。记账 mock 测试盲区：单元/e2e 都未走真实 RPC 导致 ambiguous column 在视觉验收才暴露，候选未来独立 sprint 补 RPC 集成测试覆盖。Active 22 → 21；Closed 17 → 18。

**v0.9 — 2026-05-16**：FU-39 Trek e2e 稳定性修复完成。H1 命中：Next dev --webpack 标志触发 webpack runtime 错误，导致 activity-photo-linkage.spec 在 PreStart → tracking 状态转换时崩溃。最小修复 = playwright.config.ts 单行移除 --webpack，恢复 e2e gate 可信度。零 src / helper 改动（H2/H3/H4/H5 因 H1 一击即中而未触发）。Active 23 → 22；Closed 16 → 17。下个候选 sprint：FU-33 Pre-3.c.1 OCR 配额（V1 已下达）。

**v0.8 — 2026-05-16**：docs/follow-ups.md 治理 sprint。FU-26 跳号正式标注；新增 V3 收尾机械化检查清单（防 Pre-3.c 发现的标题漂移再现）；新增并行 sprint 协调规范（形式化 FU-39 + FU-33 并行启动协议）；澄清"当前 main HEAD"字段指 sprint merge commit 而非自指 docs commit。驳回外部审查两项无效建议（不补已完整记账的 closed FU；不回填 intentional 跳号 v0.2/v0.3）。零 FU 变更（Active 23 / Closed 16 不动）。

**v0.7 — 2026-05-16**：Pre-3.c 完成（截图识别端到端链路打通）。Parser 重构（+1191 行）+ 20 个真实 OCR fixture + 3-segment 时长 UI + Pre-3.c 自身 e2e (screenshot-recognition-flow) 通过。视觉验证 PASS（两步路 15.53 + COROS 健走 6.81 两张关键 fixture）。顺手关 FU-7 历史 lint debt + 补 e2e ALLOW_TREK_DEV_BYPASS infra 漏配。隔离 Pre-3.b activity-photo-linkage e2e latent 失败到 FU-39（trek 代码本 sprint 零接触，与 Pre-3.c 无因果关系）。新增 FU-33 ~ FU-39 active（OCR 配额系统 / fixture 库扩充 / 小米 v2-omni 兜底 / §13.2 轨迹色重绘 / 引擎对比测试 / 配速字段 / Trek e2e 修复）。同时修正历史标题漂移：原 "Active 16" 在 v0.5 加 FU-31 后未同步实际为 17，本版正式以 "Active 23 / Closed 16" 反映真实计数。下个候选 sprint：FU-33 Pre-3.c.1 或 FU-39 Trek e2e 稳定性。

**v0.6 — 2026-05-15**：Pre-3.b.1 微 sprint 完成；FU-32 分享编辑器兜底轨迹去除关闭；顺带修 Satori 服务端 PNG 多点轨迹渲染边界。

**v0.5 — 2026-05-15**：Pre-3.b 完成；Trek 完成页 C1 简化 + FU-27/28/29 关闭；活动详情照片联动打通；新增 FU-31（活动详情多图上传完整实装）与 FU-32（分享编辑器兜底轨迹去除）active。

**v0.4 — 2026-05-15**：Pre-3.a 三轮+四轮全部完成；修复 entry validation 副作用 + watchPosition 残留 callback + photo-upload + schema 部署 + fallback 字符串硬化；新增 Open-Meteo 海拔接入；关闭 Issue-3 + FU-18/19/20/21/22/23/25；新增 FU-24/27/28/29/30 active；引入 E2E 自测和 schema migration 推送协作规范。

**v0.1 — 2026-05-14**：首次创建。盘点 19 条活跃 follow-up + 3 条已关闭。引入 Pre-3.a Trek 流程稳定性 Sprint 范围。建立 V1/V2/V3 工作流 + 项目交接段 + 维护规范。

### 机械化校验脚本

每次 V3 收尾必须运行下面命令，并与 Active / Closed 标题数字对比：

```bash
awk '/^## Active Follow-ups/{a=1;b=0;ac=0;next} /^## Closed Follow-ups/{a=0;b=1;cc=0;next} /^## /{a=0;b=0;next} a==1 && /^### FU-/{ac++} b==1 && /^### FU-/{cc++} END{print "Active actual:", ac; print "Closed actual:", cc}' docs/follow-ups.md
```
