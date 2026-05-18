# Peak Trekker Follow-up 清单 + 项目交接 v0.8

> **单一 source of truth** · 跨 sprint / 跨对话的项目状态门户  
> 每个 sprint 启动/收尾必须更新本文档

---

## 项目交接段（新对话/新接手者必读）

### 当前 main HEAD
`9286e1922fac0a65`（Merge FU-44 close · 2026-05-19）
> ⚠️ 此值每次 sprint merge 后必须由 Codex 同步更新

### 当前 Sprint
**待启动（候选: FU-46 [P2 高优] 仍在首 / FU-31 [P2] / FU-43 [P2] / FU-45 [P2] / community-final-polish / community-acceptance / button-token-migration / app.spec / FU-30 / FU-2+FU-15 / FU-11 / FU-42）**

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

## Active Follow-ups（20 条）

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

### FU-31 · 活动详情多图（最多 9 张）展示 + 单张大图查看 + 单张删除

- **优先级**: P2
- **归属阶段**: 阶段 3 / 阶段 5
- **状态**: 🟢 active

**背景**: FU-14 落地后用户可上传至 9 张照片，但当前 PhotoStrip 仅展示前 3 张（act-photos__layout 现有限制）。FU-13/14 sprint 视觉验收用户明确反馈：
1. 上传超过 3 张后剩余照片无法在 UI 查看
2. 当前缩略图无法点击放大查看大图
3. 9 张上限达到后没有删除入口（仅文字提示 "删掉一张才能补传"，但无实际操作路径）

**实施建议**:
- 4+ 张展示方案候选: 横滑列表 / 网格 + "查看全部" 弹窗 / 单独详情子页
- 大图查看: 点缩略图打开 lightbox，支持左右切换
- 单张删除: lightbox 内提供删除按钮，调新 endpoint DELETE checkin_asset（owner gate via RLS join），若删除的是 photo_url 对应 asset 则后端同步切换 photo_url 到剩余首张或置 NULL
- 后端 RLS 已允许 owner DELETE checkin_assets（FU-13/14 audit 确认）

**涉及**:
- `src/app/(flow)/activity/[id]/ActivityDetailClient.tsx` (PhotoStrip 重设计)
- `src/app/api/activity/actions/route.ts` (新 delete_activity_image action)
- `src/app/components.css` (lightbox 样式)

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

**背景**: FU-41 sprint Phase 3 全量 e2e 暴露 58 个 pre-existing failure（除 FU-44 / FU-45 之外），跨 8 个 spec 文件。main 独立复现确认全部 pre-existing，与 FU-41 commit 无因果。所有 case 已 test.fixme quarantine（commit 2e6a923），feature 分支 e2e 数学上 0 failure（除 Step 4 未跑完）。FU-46 子 sprint 1 已修 debug routes 3 个 quarantine case，inventory 58 → 55；子 sprint 2 已修 mountain-waypoints-display 5 个 case，inventory 55 → 50；子 sprint 3 已修 mountain-featured-posts 5 个 case，inventory 50 → 45；FU-44 close sprint 判定 activity-hero 5 cases 为 obsolete cleanup，overall baseline backlog 45 → 40。

**元层级 finding**: FU-13/14 / FU-40 / FU-33 / FU-1 等 sprint 仅跑相关子集 e2e 未全量，导致 baseline rot 多周期无感累积。v0.15 引入"V3 preflight 全量 e2e gate"协议但 FU-41 grandfather 豁免直到本 FU 修完。

**Inventory**（40 remaining cases / 4 active spec 文件；子 sprint 1 已修 3 cases，子 sprint 2 已修 5 cases，子 sprint 3 已修 5 cases；FU-44 activity-hero 5 cases 已按 obsolete cleanup 移除，不计入"已修"）:
- tests/e2e/app.spec.ts: 18 cases（含 trek/onboarding 流程偏差等）
- tests/e2e/button-token-migration.spec.ts: 6 cases
- tests/e2e/community-acceptance.spec.ts: 16 cases
- tests/e2e/community-final-polish.spec.ts: 5 cases

**已修记录**:
- tests/e2e/debug-access.spec.ts: 2 cases ✓ 已修（子 sprint 1, commit 880f703 + 8c7dcaa）
- tests/e2e/debug-tokens.spec.ts: 1 case ✓ 已修（子 sprint 1, commit 8c7dcaa）
- tests/e2e/mountain-waypoints-display.spec.ts: 5 cases ✓ 已修（子 sprint 2, commit a7762fb）
- tests/e2e/mountain-featured-posts.spec.ts: 5 cases ✓ 已修（子 sprint 3, commit ba77bad；cheap win：子 sprint 2 `listActiveMountainsViaApi` selector fix 间接修好，本子 sprint 仅 unquarantine）
- tests/e2e/activity-hero.spec.ts: 5 cases 移除（FU-44 close, commit 4c20094；obsolete cleanup，不是已修：spec 绑定 redesign 前旧 Activity Detail surface-card 设计，已删除 spec + 孤儿组件链）

**额外 note**: main 上还有 1 个 tests/e2e/import-dedupe-flow.spec.ts case main-fail / feature-pass，疑似环境波动，不入 inventory。

**已知 flake 记账**: tests/e2e/debug-tokens.spec.ts 内 2 个 non-quarantined case (token preview buttons share exact size specs / icon button missing aria label) 在子 sprint 1 跑后出现 registerFreshUser auth/login navigation 60s timeout flake，同分支单 spec 重跑通过 confirmed flake，未 quarantine，作为已知 flake 跟踪。若未来反复出现再单独 case sprint 拆解 helper 重置。

**修复策略**:
- 按 spec 文件分组单 sprint 修（根因相似度组合）或全套独立 sprint
- 修一项移一项 quarantine（test.fixme → test）
- 全部 case 修完后关闭本 FU + 启用全量 e2e gate

**涉及**: 上述 8 个 spec 文件 + 对应业务代码（每个 case 根因决定）。

---

## Closed Follow-ups（25 条）

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
