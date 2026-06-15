# Peak Trekker Follow-up 清单 + 项目交接 v0.9

> **单一 source of truth** · 跨 sprint / 跨对话的项目状态门户  
> 每个 sprint 启动/收尾必须更新本文档
> Last Updated: 2026-06-15 · 最新版本记录: v0.74

---

## 项目交接段（新对话/新接手者必读）

### 当前 main HEAD
`ee092bb`（Merge FU-100 screenshot route display normalization · 2026-06-15）
> ⚠️ 此值每次 sprint merge 后必须由 Codex 同步更新

### 当前 Sprint
待启动

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
- 每次涉及 schema 改动的 sprint，V3 收尾必须包含"migration 已推送到远程 Supabase"的验证步骤（Codex 用 Supabase 插件主动推送 + service role 查 information_schema 验证）。FU-64 已完成，暂停解除，migration 推送验证恢复，按正常发布审批执行。

#### V3 收尾 preflight 协议增强（v0.15 引入 / v0.31 正式撤销 (revoked)）

- **协议状态（v0.31）**: FU-46 close 后正式撤销 (revoked)。后续 sprint V3 preflight 不再默认或升级为全量 `npx playwright test`。
- **替代协议**: V3 preflight 含 lint + node test + build + 强关联子集 e2e + 用户视觉验收。
- **原因**: 全量 e2e 资源 / 时间成本与价值不对等；强关联子集 + 视觉验收已覆盖业务变更的实际验证需求。
- **历史归档**: FU-46 close 已作为 unique 收尾跑完整全量并清理 quarantine debt；不绑定未来 gate 启用。
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

## 2026-06-12 业务方向修订

- **省域排名**: 本期冻结。UI 已由 `PROVINCE_RANKING` flag 隐藏（`src/lib/feature-flags.ts`）；数据获取层止损归 FU-79 第一项；是否重启另议。Province Heat 归属叙事增强销项。
- **FU-69 DEM**: 不做，见 Closed FU-69。
- **商业化**: 第一期上线确定不收费；商业化思路登记为 FU-88 deferred，不占本期 Active。
- **执照区荣誉感终验（2026-04 悬置项）**: 已被 FU-54 重设计实质消化，销项。
- **微信真机分享终验**: 归 FU-81 上线技术收口门禁。

---

## Active Follow-ups（23 条）

### FU-36 · 轨迹自动初稿接入校准编辑器

- **优先级**: P2
- **归属阶段**: 校准编辑器增强 / V1.1+
- **状态**: 🟢 active

**背景**: 原 PRD §13.2「轨迹色彩重绘」的产品结果已达成：通过手动校准（livewire 吸附）+ `screenshot_route_shape` 持久化 + 品牌绿矢量重绘，四个消费面（分享编辑器 / 海报 / 档案勋章 / 活动卡）已上线（PR #1/#2/#4/#5/#6 链）。剩余唯一缺口是自动初稿：给校准编辑器喂一个可靠 draft 作为起点，降低用户手画成本。

**产品定位**: 增强而非必须。现有「手画 + 吸附」已满足基本诉求；自动 draft 只有在足够忠实时才进入生产。

**硬门槛**:
- draft 不够忠实（coverage / 形态不达标）不得上生产。
- 禁止把凭空捏造的线摆给用户确认。
- 若只能作为参考，必须作为可开关、淡显的 reference ghost，不进入海报几何。

**资产指针**:
- `scripts/fu36-mimo-draft-quality-checkpoint.ts`（untracked spike）
- `scripts/fu36-track-calib-checkpoint.ts`（untracked spike）
- `output/fu36-track-v1..v9-*`
- `output/fu36-mimo-draft-checkpoint-acceptance/`
- `output/fu36-historical-best-draft-audit/`

**保留承诺**:
- reference ghost A1.1: 可开关淡显参考层，不进海报几何。
- Sprint B confirm-first 确认页: 设计稿 `v3-confirm` 已存在，`draftRoute` seam 待建。
- 截图 speed 上限 `30` vs `50 km/h` 产品拍板未决；期间超界 optional 值静默 drop。

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

**互引更新**: per-mountain PMTiles 全量生成 + 上传 pipeline 归属已划 FU-77(c)，解除 FU-47 close 时对 FU-51 的委托；FU-51 只保留山峰信息完整性 / weather tier / refresh 逻辑联合校验。

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

### FU-68 · Verified-summit ceremonial altitude slot

- **优先级**: P2
- **归属阶段**: Share / Poster product refinement
- **状态**: 🟢 active

**背景**: FU-66 / A2 将分享海报 hero altitude 改为 measured-only，并统一从「峰顶海拔」改为「最高海拔」。catalog summit altitude 不再作为普通 poster hero fallback。2026-06-12 用户拍板：仪式感槽位要做，但必须按状态守门。

**实施建议**:
- 半边 A（必做对齐）: ✅ 已完成（PR #8 merge `8d7a798`）。`/api/poster` 对齐 A2 measured-only altitude：实测 `最高海拔`、真实 metrics、source semantics、移除 raw coordinates；R6 同步把 Profile archive「分享素材」入口改到 `/share` editor，并统一 share source mapping，修正 pre-existing `historical_photo` 被误标 GPS 的问题。
- 半边 B（设计先行）: summit-verified 专属 ceremonial slot 仍 Active。Claude Design 先挖坑位 / 标签形态 → 用户 review → 匹配样式实施。
- 仅 summit-verified checkins 可考虑展示 catalog `峰顶海拔`。
- Exposure audit（current-main 口径）: owner-or-public-post 404 gate 与 admin client 为 pre-existing；本 sprint 已移除 raw coordinates；剩余 exposure = public-post rows 可被持 id 访问者渲染 username / mountain / province / note，public cache 86400s；是否继续收紧属独立产品 / 安全决策。
- `/share` 对 `historical_photo` 暂用 neutral `UPLOADED` 是 anti-mislabel interim semantic，非最终产品文案；最终 PHOTO RECORD-style share treatment 归 Half-B 设计工作。
- `/api/poster` 本轮刻意保留 `historical_photo` 的 PHOTO RECORD 语义，因此与 `/share` surface 在此处阶段性不同。
- `/api/poster` deprecation follow-up: R6 后 `/api/poster` 的唯一生产消费面是 community cover fallback。新增 pre-existing production bug: Vercel PNG rasterization 缺 CJK font fallback，community fallback covers 生产环境中文会变 tofu（SVG 正确；`/api/share/render` 已通过 `loadShareFonts` 避免）。修复方向 = sharp 前嵌 font，或在 FU-85-era work 中整体替换 cover pipeline / 并入新 share pipeline。
- 未 verified / uploaded / screenshot_recognition 不得展示 catalog summit altitude 作为 hero

**验收**:
- 非 verified 活动不会展示 catalog summit altitude
- summit-verified 场景如启用，文案与数据来源明确
- `/share` 与 `/api/poster` 口径一致

---

### FU-75 · 品牌视觉统一体系

- **优先级**: P2
- **归属阶段**: 上线前产品品质
- **状态**: 🟢 active

**背景**: 2026-05-29 用户提出 logo 未定稿、品牌元素呈现复杂且无规范；2026-06-10 A2 验收再次指出成功页中央非品牌 logo。现状是 `--green-primary` / `--green-bright` / `--green-neon` 混用，品牌绿存在 `#6ee7a1`（share 模板 / 编辑器）与 `#7ef0b4`（ActivityRouteMap / 验收单）hex 分叉；`BrandFooter` 是唯一系统化品牌组件，logo 形态各处不一。

**实施建议**:
- logo 定稿（前置）
- 品牌元素清单 + 使用规范
- 全 App 盘点替换
- `docs/color-debt.md` re-audit（P0 层已失真，30+ 新硬编码未入册）
- 品牌绿 hex 统一

**互引**: `docs/color-debt.md`

---

### FU-76 · 动效系统 + 人文化文案

- **优先级**: P2
- **归属阶段**: 上线前产品品质
- **状态**: 🟢 active

**动效半边**: 建立动效 token（时长 / 缓动）与原则，做选型 spike（CSS-first vs 引库；包体积 / 低端机 / 大陆可达约束），再对关键节点分批落地：登顶确认、分享生成、转场、空态、加载。起点为 `docs/ui-interaction-spec.md` §12 微动效规范 + §4.9。现状：无动效库，`globals.css` 仅 1 个 `@keyframes`。

**文案半边（2026-06-12 用户确认并入）**:
- 人话化审查：从用户视角过全界面，把技术性 / 非面向用户的描述改为用户常规能听懂的语言（不必大白话，取度）。
- 人文温度：梳理需要人文化表达的节点，给精神激励，弱化纯工具感。
- 原 FU-70「轨迹达峰」中性标签并入此处，作为文案审查的一个具体节点。

---

### FU-77 · 300 山峰物料 pipeline

- **优先级**: P1
- **归属阶段**: 上线前数据物料
- **状态**: 🟢 active

**范围**: 300 山数据 / 物料生产（spec = `docs/mountain-content-spec.md`）。

**显式子项**:
- (a) `mountains` 上下线状态管理：schema 状态字段 + admin 开关，C 档山峰可前端隐藏。
- (b) 风险提示 / 路线参考专用字段：spec 必填，现无字段。
- (c) per-mountain PMTiles 全量生成 + 上传 pipeline：归属自 2026-06-12 起划入 FU-77，FU-51 条目已解除 FU-47 close 时的委托。
- (d) 吸收 FU-16 坐标精度审计：原 FU-16 关闭，随 300 山统一验收。
- (e) 山峰「节点」功能（登山口 / 营地，backlog）数据先行在此；FU-6 `mountain_requests` 审核 / 上新流程（backlog）按申请量触发。

---

### FU-78 · 中国大陆访问与基础设施评估

- **优先级**: P1
- **归属阶段**: 上线阻塞
- **状态**: 🟢 active

**背景**: 2026-05-30 用户提出（原 T1，旧编号被复用导致失踪）。Vercel + Supabase 均境外，大陆用户访问速度 / 可达性未验证。

**Phase 1（只读调研）**:
- 真机 / 大陆网络实测可达性与延迟
- 评估迁移选项（国内云 / CDN / 双部署）
- ICP 备案要求
- 成本
- 输出决策报告

**约束**: 上线前置，几乎所有线上工作的前提；外部服务先过大陆可达关。

---

### FU-79 · 全站性能审计

- **优先级**: P1
- **归属阶段**: 上线前
- **状态**: 🟢 active

**背景**: 2026-05-30 用户反馈每页都卡（原 T2，编号复用失踪）。

**第一项（✅ 已完成，止损性质）**: `PROVINCE_RANKING=false` 时数据获取层已接入 flag：
- `/explore`: 每次加载省域月榜查询从 2 次降为 0 次（当月 + 上月均跳过）。
- `/profile`: 每次加载用户省域贡献查询从 1 次降为 0 次。
- Flag-on 路径由静态测试钉住，仍调用原函数与原参数；落地 PR #7 / merge `f97016f3`。

**其余审计**:
- RSC 数据瀑布
- bundle 体积
- 图片优化
- 渲染阻塞审计

**原则**: 先测量后改。

---

### FU-80 · 线上稳定性与错误边界

- **优先级**: P2
- **归属阶段**: 稳定性 / 体验兜底
- **状态**: 🟢 active

**背景**: 2026-05-30 用户报 `/profile` 与山友圈 404（原 T3，编号复用失踪；可能已自愈，需复查确认并记录结论）。

**实施建议**:
- 全站 `error.tsx` / `not-found.tsx` 边界补齐。
- 中文友好文案，不裸露工程错误。
- dev console 6 条资源 403 验证一次；若为环境噪音，直接记录销项。

---

### FU-81 · 上线技术收口门禁

- **优先级**: P1
- **归属阶段**: 上线前执行（现在登记，上线窗口执行）
- **状态**: 🟢 active

**范围**: `docs/acceptance-checklist.md` §16 整章无人认领的统一收口。

**必须覆盖**:
- `verify_summit_checkin` 主链路专项回归
- 真实上传 + 存储 bucket 生产环境端到端验证
- poster 分享主链路稳定性
- env 配置审计
- 微信真机分享路径终验（2026-04 起悬置）
- `docs/acceptance-checklist.md` 全量回写（对齐 FU-42 / FU-61 之后现实 + 清理省域条目）

---

### FU-83 · 地图遗留债

- **优先级**: P3
- **归属阶段**: FU-47 系列书面承诺的独立项
- **状态**: 🟢 active

**范围**:
- ✅ (a) Activity `trackPoint` 超 mountain-bbox envelope 检测 + auto-fallback trace-only：PR #9 / merge `d20a5df` 已落地。策略 = mountain bbox 每轴扩 8%，raw valid points 中 >1% 超出扩展 bbox 才降级；`data-map-mode` 记录 `mountain-pmtiles` / `trace-only-no-asset` / `trace-only-map-error` / `trace-only-out-of-envelope` / `screenshot-shape`。
- `waypoints` 表加 `lat` / `lng`，解锁 Mountain Detail 状态(a)真实数据触发。
- MapLibre 24-layer allowlist 扩等高线等地形细节（独立 visual review）。
- ✅ (d) GPS trace fallback aspect-ratio distortion：PR #9 / merge `d20a5df` 已落地。新增 shared WGS-84 aspect-correct projector（`src/lib/geo-trace-projector.ts`），以 `cos(midLat)` + single range + centered letterbox 统一投影，服务 Activity trace-only / Trek reference fallback / Community detail preview；删除 dead `CommunityRouteVisualization.tsx`；`tests/fixtures/gpx/fu83-portrait-49609d3c.gpx` 固定 portrait ratio。before-state renders 可从 pre-merge main git history 复现。

**剩余 Active**:
- (b) `waypoints` lat/lng 数据化。
- (c) contour / terrain layer allowlist 扩展。

**DATA RESIDUE 记录**:
- FU-83 evidence run leftover `bf333b44-9931-4971-97e8-ada79af158a5` 已按用户授权删除。删除前五项验证通过：`source='screenshot_recognition'` / `verified_at=null` / `ranking_weight=0` / `track_points=[]` / posts refs `0`；计数对账 total `966 → 965`，`screenshot_recognition 1 → 0`，other-source `965 → 965`。

---

### FU-84 · 校准编辑器工程债

- **优先级**: P3
- **归属阶段**: 工程债
- **状态**: 🟢 active

**范围**:
- livewire 性能（FIX#6 #8）：拖动 throttle、worker evidence field 720² 重建复用。
- FIX#6 #10 剩余：`clamp` ×3 / `bbox-normalize` ×3 去重、`geometry.ts` 死导出清理、编辑器 `pathFromUnitPoints` 与 ActivityRouteMap `screenshotSegmentPath` 双份 SVG path builder 合一（lockstep 发散风险）。
- 拖拽态二级打磨残留：非活动点压暗 ~60%、hide-others-while-dragging（FU-74 未覆盖）。

---

### FU-85 · 分享/模板门面改造

- **优先级**: P1
- **归属阶段**: 产品主线（设计先行）
- **状态**: 🟢 active

**背景（2026-06-12 用户重述确认）**: 分享模板是核心卖点但藏得太深。把出发 tab 触发按钮改为分享模板门面：用户先浏览水印模板样例，再按手头素材三选一录入（截图上传 / 轨迹上传 / 真实记录）。无登山记录时，该界面引导先完成录入。

**流程**: Claude Design 先出整体方案 → 用户 review → 实施 sprint。

**守门约束**: community / share 路线预览接入 `screenshot_route_shape` 时，badge 必须按 source 守门，`screenshot_recognition` 来源禁显「GPS 真实轨迹」。

**互引**: 吸收 memory deferred task「导航分享门面」。

---

### FU-86 · 首页样式探索

- **优先级**: P2
- **归属阶段**: 设计先行，可保留现状
- **状态**: 🟢 active

**背景**: 现首页已做一部分但样式刻板。Claude Design 再出一套可能性作探索；无更好方案则保留现有 + 小修。

**Quick win 子项**: 探索页顶部「探索」二字标题移除。

---

### FU-87 · 档案馆化 + 记忆锚点

- **优先级**: P2
- **归属阶段**: 设计 gate
- **状态**: 🟢 active

**方向**: 我的记录档案馆化表达（一层记忆 / 二层事实 / 三层传播）+ 活动详情记忆锚点（代表图 / 关键时刻 / 一句话）。

**硬 gate（2026-06-12 用户拍板）**: 设计稿先行，达到「灵动 + 承载功能 + 人文 + 可用」才进实施；达不到则保留现状不做。

---

### FU-95 · 上线前死入口 / 假成功清理

- **优先级**: P2（before-launch）
- **归属阶段**: 上线前死面清理
- **状态**: 🟢 active

**定位**: 删除 / 隐藏 / 降级假入口，不补完整功能。打包处理以下「广告了不存在的能力」或语义 bug：

1. **late-proof 假成功壳**: `buildLateProofHref` 死代码（`src/lib/trek-gps-preflight.ts:49`，仅 URL 可达）、`LateProofClient` `setTimeout` 假成功不落库（`src/app/(flow)/late-proof/LateProofClient.tsx:617-625`）。下线前端壳（页面 + 死 href + 死 `handlePhotoCheckin` + `void` 抑制）；后端 `submit_historical_checkin` 保持休眠不删。
2. **无归属 / 事后认领死按钮**（DEBT-3≡4，同一条）: 「直接记为无归属·事后再认领」（`src/app/(flow)/trek/TrekClient.tsx:3729`）只 `showManualPlaceholder` toast（`:2036`）。删按钮 + 该 placeholder。
3. **GPS-weak 空按钮**: `<PrimaryButton onClick={()=>{}}>继续记录</PrimaryButton>`（`TrekClient.tsx:2644`）。底层行为本就对（信号回来自动续），删该假按钮或接成真动作。
4. **Profile「设置」死 toast**: `src/components/profile/ProfileV2Client.tsx:501` `{label:'设置',toast:'设置功能即将上线'}`。撤掉该行或降级；问题反馈行归 FU-97。
5. **historical_photo 误标 GPS（语义 bug 一并修）**: `src/lib/source-label-utils.ts:6-8` 把 `historical_photo` 映射成绿「GPS VERIFIED」。改成「UPLOADED / 用户自报」。当前因无产线无害，但属语义错，顺手修。
6. **Share flow 死付费 alert**: `src/app/(flow)/share/ShareClient.tsx:2350` `window.alert('付费功能即将上线')` 是未上线付费功能死路 alert；与 FU-94 截图付费墙同类，但 FU-94 仅处理截图侧，本项去掉 / 降级。注：`src/app/admin/analytics/AdminAnalyticsClient.tsx:441`「付费功能 Ranking」是 FU-59 内部 admin 分析面板，非用户面死付费，保留不动。

**边界**: 只删 / 隐藏 / 降级，不补任何完整功能。

---

### FU-96 · wakelock 记录可靠性增强

- **优先级**: P2
- **归属阶段**: 记录可靠性增强
- **状态**: 🟢 active

**背景 / 证据**: 长记录无 `navigator.wakeLock`（全仓 0 hits），息屏会增加掉点 / 停表风险。

**Scope**: 加 `useWakeLock`：locating / tracking 请求，finish / pause / abort 释放，`visibilitychange` 重取；guard 不支持环境。

**注**: WeChat webview / 老 iOS 不支持，只能缓解。**是否进上线窗口看 FU-93 修复后剩余风险**。

---

### FU-97 · 反馈通道

- **优先级**: P2
- **归属阶段**: 反馈入口 / 用户支持
- **状态**: 🟢 active（先登记，不做完整系统）

**背景 / 证据**: 问题反馈无路由 / API / 落库，`src/components/profile/ProfileV2Client.tsx:500` 是死 toast；FAQ `account.feedback` 已诚实标「准备中」。

**Scope（后续如需）**: 极简真实渠道（站内 sheet + `/api/feedback` + 表，或外链小程序 / 微信 / 邮箱）。

**边界**: 本轮**只登记不实施**。

---

### FU-98 · 省份编辑

- **优先级**: P3
- **归属阶段**: Profile 轻量资料编辑
- **状态**: 🟢 active

**背景**: 昵称已被 FU-90 修好可编辑；省份仍只读、无 picker / API（`profiles.province` 只展示）。

**Scope（后续迭代）**: 复用 FU-90 昵称 sheet 模式 + 省份 picker + 写 `profiles.province` + 同步改 FAQ。

**边界**: **MVP 初期不做**。

---

### FU-99 · auto-summit verify_and_record_checkin measured-field gap

- **优先级**: P3（数据一致性 / 非本轮上线阻塞）
- **归属阶段**: GPS summit verification / measured metrics persistence
- **状态**: 🟢 active

**背景 / 证据（FU-93 closeout 一手核 2026-06-15）**: `verify_and_record_checkin` 自动登顶验证路径不会把 linked `trek_sessions` 的 measured metrics 写入 `checkins.distance_meters` / `duration_seconds` / `elevation_gain_meters` / `max_elevation_meters` 等 measured columns。FU-93 修复后，server session metrics 已通过 `append_trek_points` 重算并持久化，但 summit-verified GPS checkin 仍保留 NULL measured columns。生产核验样本：checkin `492617f7-4a1b-42c6-bf9f-bf66541d038f` measured fields 为 NULL，而 linked session `50401e67-d9d6-44e3-9d86-f2ec90622537` 有 `distance_m=1488`、`track_points` 16。

**判断**: 这是 pre-existing RPC gap，不是 FU-93 regression。FU-93 的责任边界是让 `trek_sessions` track / metrics 正确、离线补传不丢点、finalize 不重复；checkin measured-field 写入缺口需单独处理。

**Scope（后续）**:
1. 修改 `verify_and_record_checkin` / 相关 RPC，使 auto-summit verified GPS checkin 创建时复制 recomputed session metrics 到 checkin measured columns。
2. 增加回归测试：summit-verified checkin 的 measured columns 与 linked session metrics 一致。
3. 评估是否需要 backfill 既有 summit-verified GPS checkins（若涉及生产写入，单独数据操作审批 + exact-id / count 对账）。

**边界**: 本次不实施；如改 DB function，走正常 migration + 发布审批。

---

### FU-101 · 全屏校准编辑器长图初始对焦（routeCenter）

- **优先级**: P2（校准体验 polish，非上线阻塞）
- **状态**: 🟢 active（仅登记，未实施）

**背景**: FU-100 实施期间发现全屏校准编辑器 open 时重置到整图中心 `zoom=1 / center=0.5,0.5`（`src/app/(flow)/screenshot/ScreenshotRouteCalibrationSection.tsx:~872`）；对"图高≫宽、地图在顶部"的长截图不友好（打开看到中间空白而非顶部路线区）。FU-100 只解决展示面 route-only 标准化、不含校准初始对焦，故单独登记。

**建议**: open 时对焦 `routeCenter()`（编辑器已有该函数，`src/app/(flow)/screenshot/ScreenshotRouteCalibrationSection.tsx:~221`）而非整图中心；保留原图比例 + 底图对齐不变。

**边界**: 仅校准编辑器初始视图，不动展示面 / 路线标准化。

---

### FU-91 · Supabase schema baseline / fresh-apply 能力恢复

- **优先级**: P3（非上线阻塞）
- **归属阶段**: 数据库运维卫生 / 灾备与环境初始化
- **状态**: 🟢 active

**背景**: FU-64 对账时发现——repo migration 假设了一个未入库的前置 baseline：核心表 `checkins` / `posts` / `profiles` / `checkin_assets` / `mountains` 由任何 repo migration 都未创建（首条 migration 即 `ALTER TABLE profiles` 假设其存在）。故当前 migration 集无法 fresh-apply-from-zero（新环境 / 灾备 / 本地全新 DB 会在第 1 条失败）。这是既有限制，FU-64 已对齐 drift 但未补 baseline。

**范围（Phase 1 只读分析先行）**:
1. 评估 `supabase db pull` 生成 baseline 的覆盖完整性：是否抓全 public 之外的对象——auth schema（尤其 auth.users 上的 handle_new_user trigger）、storage policy、RLS、function / trigger。
2. 决定方案：db pull 生成前置 baseline migration vs 重组 migration 史 vs 其他。
3. 恢复 fresh env / reset 能力的路径与验收标准。

**约束**: 禁止直接 db reset / db push；Phase 1 只读覆盖分析，方案经用户审核后再执行。MVP 单库不 reset，本项非上线阻塞。来源 FU-64，单独立项。

---

### FU-92 · onboarding_version 跨设备重复展示修复

- **优先级**: P3（非上线阻塞）
- **归属阶段**: onboarding / profile metadata hygiene
- **状态**: 🟢 active

**背景**: FU-90 Phase 2A 注册链路改为 `options.data` → `handle_new_user` trigger 持久化昵称 / 省份。实施中澄清：register 端原本的 `setIntroSeen` 只是本机 localStorage 抑制，未写 `profiles.onboarding_version`；新用户跨设备 / 清缓存后可能重复看到 onboarding。这不是 FU-90 2A/2B 回归，而是既有 onboarding 持久化缺口被昵称链路复核暴露。

**范围**:
- 复核 onboarding display gate：`onboarding_version`、localStorage、profile fetch / update 路径。
- 设计跨设备一致的完成态写入：用户完成 onboarding 后持久化到 `profiles.onboarding_version` 或等效 server-owned 字段。
- 明确新用户 / 旧用户 / 清缓存 / 换设备的预期行为。

**约束**: 不夹带进 FU-90；如需 schema / RLS / API 变更，单独 plan + 发布审批。

---

## Deferred Registration

### Deferred · FU-88 · 商业化专项

- **状态**: ⏸ deferred
- **归属阶段**: 下一大版本，不占本期 Active

**2026-06-12 用户拍板**: 第一期上线确定不收费。记录商业化思路备启动：
- 两个已识别卡点 = 商业化验证信号：截图识别次数限制的使用量 / 限免水印模板的使用量（admin 后台已有商业化场景数据收集）。
- 品牌相关商业化方向（更远期）。
- 启动时做专项讨论：基于产品形态盘可扩展功能点；若上架应用商店，评估直接作为付费软件（产品具备工具功能属性）。

---

## Known Issues

### Known Issue · checkin 数据字段写入路径异常 — 根因已查明 (2026-06-13)，修复待排期

- **状态**: 根因已查明 (2026-06-13)，修复待排期；是否升级正式 FU 或继续保持 Known Issue 待用户定。
- **原始记录 (FU-11, 2026-05-21)**: activity `7707122f-bebe-4b04-b904-1ad4397b706a` 被记录为 "0/0/0/60 脏 checkin + linked session 真实 8300m / 1465m / 3h"。
- **一手核实修正**: 截至 2026-06-13 只读核验，严格 `0/0/0/60 + linked session 真实数据` 签名在生产库为 0 条；`7707122f-bebe-4b04-b904-1ad4397b706a` 实为 0-session 弱 incomplete：checkin `0 / 0 / 0 / 63`，linked session 也是 `0 / 0 / 0`，2 个静止点，约 68s。代码侧无任何回写测量字段的 UPDATE 路径，故原始描述判定为 FU-11 记录时印象误记，保留历史但以本次核验为准。

| 子问题 | owner path | 截至 2026-06-13 只读核验规模 / 时间 | 是否仍在发生 | 判读 |
|--------|------------|--------------------------------------|--------------|------|
| A. RPC 测量字段缺口 | `/Users/liuhongyuan/Desktop/peak-trekker/supabase/migrations/20260522045459_drop_checkins_status_finalize_fu42.sql:94-121` | 截至 2026-06-13 只读核验，有 258 条 complete `realtime_gps` checkin 测量字段全 NULL，而 linked session 有真实测量值；截至 2026-06-13 只读核验，2026-05-30T04:18 后无新 GPS 打卡 | 代码缺口仍在；未来 server-session 登顶仍会产生 NULL checkin 测量字段 | `verify_and_record_checkin` INSERT 不含 `distance_meters` / `duration_seconds` / `elevation_gain_meters` / `max_elevation_meters` / `track_points`；数据没有被写坏，而是 checkin 层没有写入 |
| B. `finish_incomplete` 0 兜底 | `/Users/liuhongyuan/Desktop/peak-trekker/src/app/api/trek/actions/route.ts:105-108` | 截至 2026-06-13 只读核验，有 5 条 zero-triplet incomplete 行；截至 2026-06-13 只读核验，时间窗为 2026-05-14~2026-05-17 | 不判断为当前主路径仍发生；样本均为旧 incomplete | `finiteNumber(null) -> 0` 使 `?? body ?? 0` 兜底链失效，session 初始 0 状态被复制进 checkin；linked session 本身也是 0，非破坏真实数据 |
| C. `mountains.checkin_count` 漂移 | `/Users/liuhongyuan/Desktop/peak-trekker/supabase/migrations/20260506000000_stats_rpc_security_definer.sql:6-9` / `/Users/liuhongyuan/Desktop/peak-trekker/src/lib/trek-verify-helpers.ts:195-209` | 截至 2026-06-13 只读核验，泰山 -451 / 华山 -301 / 武当山 +7 | 机制性持续 | `increment_checkin_count` 是 best-effort +1 RPC，无触发器 / 重算 / 递减；recount 前需产品先定语义：全部 / complete / verified / publishable |

- **消费面影响**: A 的 258 条 NULL 在 Activity / Share / Poster / Archive 已被 session fallback 兜住；仅 Profile 行程列表海拔 degraded，因为 `/Users/liuhongyuan/Desktop/peak-trekker/src/lib/profile-records-server.ts` 不读 linked session。因此不是上线阻塞级。
- **修复约束：存量 vs 未来必须分开**:
  - **存量**: 截至 2026-06-13 只读核验，258 条可用一次性 UPDATE / backfill 从 linked session 修复，理论上不需要 schema migration；但这是 DB 批量写入，必须走数据操作批准 + 五项核验 + 前后对账。
  - **未来**: 写入缺口治本仍需改 `verify_and_record_checkin` RPC / 调用链，涉及 migration / DB function 变更；FU-64 已完成，drift 禁令解除，未来 RPC / DB function 修复走正常 migration + 发布审批。backfill 不治未来。
  - **5 条 zero-triplet**: linked session 也是 0，无法从现有数据恢复；三选一待定：保留弱记录 / 隐藏指标 / 清理。
- **优先级**: 修复排在 FU-78 / FU-79 之后；是否升级正式 FU 或继续保持 Known Issue 待用户定。
- **证据指针**: local evidence: `output/known-issue-0-60-investigation/report.md` (not committed)。

---

## Closed Follow-ups（80 条）

### FU-100 ✅ 截图路线展示标准化（route-only bbox fit）

- **关闭原因**: 截图路线展示标准化已落地并由用户 2026-06-15 视觉验收。PR #15 / branch `codex/fu100-route-display-normalization` / merge `ee092bb` 合入 1 个 FU-100 commit `eca2334`，改动文件限定为 `src/lib/share-track-preview.ts`、`src/components/activity/ActivityRouteMap.tsx`、`tests/share-track-preview.test.ts`、`tests/screenshot-confirm-static.test.ts`、`tests/e2e/screenshot-route-display-fu100.spec.ts`。
- **落地内容**: 截图路线展示从原图尺寸 / image-square 投影改为 route-only 自身 bbox 等比 fit 到固定容器：先恢复全部 drawable 点到原图像素坐标，先算全量路线 bbox，再 uniform scale / center，之后才 per-segment sampling，`accepted_gap` 不桥接。Activity 详情截图路线卡改固定 `343x343` / 1:1 frame，新增 `activityScreenshotCard` 轻量 profile（线宽 `3.4`、起点 `r=6`、终点 `r=7.5`，对齐普通 GPS 轨迹卡量级），并移除卡内重复「截图校准路线」角标，保留无障碍 `aria-label` 与区头「截图路线」标签。
- **边界**: 不迁移持久化数据，不改 `normalized_screenshot` 语义；不动 GPS route builder、不动全屏校准编辑器、不动已正确的校准内联 preview；share editor / success medallion / share templates / `/api/share/render` 通过共用 builder 自然受益。Degenerate guard 仅在源像素 bbox 对角线 `<= 1px` 时 restrained fallback，避免近重合路线爆成胖线 / 巨点。
- **验收 / 证据**: deterministic metrics 证明 640×4096 长图顶部路线 Activity projected bbox `widthFill 0.2531 → 1`，`heightFill 0.18 → 0.7111`；R1 视觉减重 metrics：oldActivity `lineWidth 8 / start 15 / end 21`，newActivity `lineWidth 3.4 / start 6 / end 7.5`，GPS control `lineWidth 3 / start 6 / end 6`。本地证据目录 `output/fu100-route-display-normalization/`（不入 git）。验证：`node --test --experimental-strip-types tests/share-track-preview.test.ts tests/screenshot-confirm-static.test.ts` 31 pass / 0 fail；`npx playwright test tests/e2e/screenshot-route-display-fu100.spec.ts --reporter=line` 1 pass；`npm run build` passed；`git diff --check` clean。
- **map/weather brief**: 本 sprint 仅涉及截图路线 SVG 卡 / 分享素材 route rendering 标准化，不改变 MapLibre / PMTiles / weather policy；`docs/map-weather-brief.md` 只读确认无需更新。
- **后续**: 全屏校准编辑器长图初始对焦未解决，已登记为 FU-101；不得把 FU-100 表述为校准体验已全部解决。
- **关闭 commit**: 本次 docs 收尾 commit
- **关闭时间**: 2026-06-15

### FU-94 ✅ 截图识别额度墙诚实化 + de-dup

- **关闭原因**: 截图识别额度墙诚实化已落地并由用户 2026-06-15 视觉验收。PR #14 / branch `codex/fu94-screenshot-quota-honesty` / merge `be6db01` 合入 2 个 FU-94 commits：`f12f0e6`（honest copy + de-dup）与 `00c56c9`（engage feedback auto-close `2.5s`）。改动文件限定为 `src/app/(flow)/screenshot/ScreenshotClient.tsx`、`src/app/api/screenshot/recognize/route.ts`、`tests/e2e/screenshot-quota-flow.spec.ts`、`tests/screenshot-confirm-static.test.ts`（stale migration filename test fix）。
- **落地内容**: UpgradeSheet 删除未上线付费方案 / 每月 30 次 / 支付入口承诺，CTA 改为「我想要更多额度」；点击后保留 `gate_engaged` telemetry（语义为更多额度需求信号，不代表付费已上线），不再 `window.alert`，改为 sheet 内联反馈「已记录，我们会根据使用需求逐步开放更多额度。」并在 `2.5s` 后自动关闭。QuotaBar 仅在额度用完时显示 CTA；「本月识别次数已用完」去重为只由 sheet 标题承载；server `upgradeHint` 删除。quota 机制 / 扣减 / 既有 telemetry 事件名均不变。
- **验收 / 证据**: PR #14 pre-merge branch head `00c56c9` Vercel check success；production deploy `dpl_2t2pLvVqD8i1nqFJTffpN4YdsYSx` READY for merge `be6db01`。部署后 read-only `/screenshot` sanity：mocked exhausted quota on production build showed new CTA visible, old「了解付费方案」count 0, feedback visible, old「付费方案」count 0, dialog count 0, console error count 0。
- **map/weather brief**: 本 sprint 仅涉及截图识别额度墙文案 / de-dup / API 响应字段，不改变地图 / 天气策略；`docs/map-weather-brief.md` 只读确认无需更新。
- **关闭 commit**: 本次 docs 收尾 commit
- **关闭时间**: 2026-06-15

---

### FU-93 ✅ 离线轨迹持久化与重传

- **关闭原因**: 离线记录可靠性链路已落地并验收。PR #13 / merge `ce02928` 合入 3 个 FU-93 commits（`149ec8d` / `e3a840d` / `4438a25`）：IndexedDB outbox + finishIntent、ack 后才标 synced、restore 合并 server∪local、离线 finish / verify 进入「待同步」而不伪造成功、network finalize leak 2 轮客户端修复。生产 migration `20260614120000_append_trek_points_rpc` 已在 merge 前 gated apply 到 `mngofocdsmqrqimsdyzf`：`append_trek_points(uuid,jsonb)` 使用 `auth.uid()` ownership、`FOR UPDATE` 原子合并、per-point reject、deterministic recompute、30k session cap、authenticated / service_role EXECUTE grant。
- **验收 / 证据**: STOP#2 real-device acceptance PASS：offline finish → 待同步，reconnect → saves。生产只读 DB 核验：summit session `50401e67-d9d6-44e3-9d86-f2ec90622537` 为 `summit_verified`、`ended_at` 已设置、`track_points` 16、exactly one checkin `492617f7-4a1b-42c6-bf9f-bf66541d038f`；session `fab1b069-aaa3-4741-b09c-18a86a3a70c4` 为 `finished`、exactly one incomplete checkin `69ecaa8c-82d5-4e9a-880a-dbc9b79ca421`；近 3 小时华山测试集 `no_session_has_more_than_one_checkin = true`，duplicate-finalize guard held。生产 DB smokes（pre-merge）覆盖 concurrent overlap / replay idempotency / mixed invalid per-point reject，test auth/profile/session exact cleanup 完成。
- **残留测试数据（用户拍板暂留）**: `andymorrison91060122@gmail.com` 下 11 条华山 mock sessions + 2 条 checkins 暂不清理，包含 summit session `50401e67`、finished incomplete session `fab1b069`、paused orphan `27f2e9dc`。后续如需处理，走单独 exact-id cleanup pass。
- **已知非回归后续**: auto-summit `verify_and_record_checkin` 不把 session measured metrics 写入 checkin measured columns，导致 summit-verified GPS checkins 的 `distance_meters` / `duration_seconds` 等仍为 NULL；本次确认 checkin `492617f7` 为 NULL，而 linked session `50401e67` 有 `distance_m=1488`。这是 pre-existing RPC gap，已登记为 FU-99。
- **map/weather brief**: 本 sprint 仅涉及 Trek 记录可靠性、outbox 与 append/finalize 链路；不改变地图 / 天气产品边界或 MapLibre / PMTiles / weather policy，因此 `docs/map-weather-brief.md` 无需更新。
- **关闭 commit**: 本次 docs 收尾 commit
- **关闭时间**: 2026-06-15

### FU-89 ✅ FAQ 暴露的未接通功能债梳理

- **关闭原因**: FAQ 功能债调研归类完成，产出上线前债务收口清单，spawned FU-93..98。23 条 FAQ 已完成全审 + 全仓 grep；多数 FAQ 承诺能力已由 FU-82 诚实化成果对齐真实现状；FU-90 已了结昵称编辑（原 DEBT-6 部分）。原则：上线前债务收口，涉新产品能力的项只登记不实施。
- **登记结果**:
  - FU-93 离线轨迹持久化与重传（P1 上线阻塞）。
  - FU-94 截图识别额度墙文案 + 需求埋点（P1，不做商业化）。
  - FU-95 上线前死入口 / 假成功清理（P2 before-launch）。
  - FU-96 wakelock 记录可靠性增强（P2）。
  - FU-97 反馈通道（P2，先登记，不做完整系统）。
  - FU-98 省份编辑（P3，MVP 初期不做）。
- **NEW-B 备注（已并入 FU-95）**: 分享高级模板水印付费墙（`src/app/(flow)/share/ShareClient.tsx:2350` `window.alert('付费功能即将上线')`）被 env `ENABLE_PREMIUM_TEMPLATE_PAYWALL`（关）挡住，生产不可达。保持 flag 关闭；实际去掉 / 降级已登记到 FU-95，不在 FU-94 截图额度墙 sprint 中实现。
- **关闭 commit**: 本次 docs 收尾 commit
- **关闭时间**: 2026-06-14

---

### FU-90 ✅ 昵称链路修复 + Profile 昵称编辑

- **关闭原因**: 昵称链路整体收口。Phase 2A 通过 PR #11 / merge `f727e22` 上线：注册 `options.data` → `handle_new_user` trigger 持久化昵称 / 省份，drop `profiles.username` unique，生产 migration 已 apply，valid / no-metadata / dirty / duplicate 四条 smoke 通过并 exact cleanup。Phase 2B 通过 PR #12 / merge `327dd0a` 上线：Profile 页新增昵称铅笔入口、bottom sheet 编辑器、`POST /api/profile/nickname`、本地成功态「已更新」，FAQ `account.edit-profile` 同步改为「昵称可编辑，省份暂不支持修改」。
- **证据**: Phase 2B 用户视觉验收 PASS；`npm run test:profile-nickname` 20/20；`npx playwright test tests/e2e/profile-nickname-edit.spec.ts --reporter=line` 1 passed；`npm run lint` 0 errors（9 existing warnings）；`npm run build` passed；DATA RESIDUE `FU90 test auth users remaining: 0`。2B 本地证据目录 `output/fu90-nickname-edit-acceptance/`（不入 git）。设计源仅存 output 作本轮验收证据，不进仓库 / docs。分享 / 海报用户名为生成时快照，不随改名回写，属预期。
- **关闭 commit**: 本次 docs 收尾 commit
- **关闭时间**: 2026-06-14

---

### FU-64 ✅ Supabase migration-history full reconciliation

- **关闭原因**: Supabase migration-history drift 全量对账完成：本地 25 ↔ 远端 25 全 matched，drift=0。2A 通过 PR #10 / merge `879b759` 完成 11 个 migration 文件名对齐远端版本，并从远端 statements 重建 create_a1 `20260513042900`；2B 对 10 条早期 LOCAL_ONLY 逐条执行 `supabase migration repair --status applied`，remote ledger `15 → 25`。2B 仅写 `supabase_migrations.schema_migrations` 元数据，无 schema / data 写入。
- **GUARD 更新**: FU-64 migration-history drift 对账已完成（2026-06-14，本地↔远端 25/25 matched，drift=0）。原「FU-64 drift 导致的 db push 禁令」解除。注意：这不等于生产可随意 db push——任何生产 schema / DB 变更仍需单独走 migration + 发布审批。
- **证据（未入 git）**: `output/fu64-phase2b-metadata-repair/`（`step0-start.txt` / `step1-repairs.txt` / `final-migration-list.txt` / `final-remote-ledger.txt` + 每条 before / after list）。
- **关闭 commit**: 本次 docs 收尾 commit
- **关闭时间**: 2026-06-14

---

### FU-82 ✅ FAQ 与现状功能对账

- **关闭原因**: FAQ 诚实化已落地：`src/lib/faq-content.ts` 完成 13 条回答改写、2 条不存在能力条目删除（`record.unattributed` / `review.review-failed`），并删除 FAQ 卡片底部「查看完整说明」死入口；反馈通道建设转 FU-89，本轮不公开邮箱。
- **关闭 commit**: `c8bfa2f`（feature）/ `64a452f`（merge）
- **关闭时间**: 2026-06-13

---

### FU-70 ✅ Uploaded track summit-area neutral consistency label

- **关闭原因**: 2026-06-12 用户确认并入 FU-76 文案审查，作为「轨迹达峰」中性标签 / 自报数据 framing 的具体节点；不再作为独立 FU 推进。
- **关闭 commit**: 待本次 docs reconciliation commit
- **关闭时间**: 2026-06-12

---

### FU-69 ✅ DEM elevation backfill for uploaded coordinate tracks lacking `<ele>`

- **关闭原因**: 2026-06-12 用户拍板不做。境外 DEM 服务难过大陆可达关，受益面小；不进入当前产品路线。若未来重新讨论，必须先过中国大陆可达性 + MVP 成本评估。
- **关闭 commit**: 待本次 docs reconciliation commit
- **关闭时间**: 2026-06-12

---

### FU-35 ✅ mimo-v2.5 多模态能力接入

- **关闭原因**: 文字半边已由 FU-62 生产上线；轨迹半边与重写后的 FU-36 剩余 scope 完全重叠，并入 FU-36。2026-06-12 用户确认合并。
- **关闭 commit**: 待本次 docs reconciliation commit
- **关闭时间**: 2026-06-12

---

### FU-16 ✅ mountains 坐标精度审计

- **关闭原因**: 并入 FU-77「300 山峰物料 pipeline」子项 (d)，随 300 山统一验收；不再单独占 Active。
- **关闭 commit**: 待本次 docs reconciliation commit
- **关闭时间**: 2026-06-12

---

### FU-73 ✅ Shared screenshot source predicate

- **关闭原因**: FU-73 已在 PR #6 落地: `src/lib/trek-utils.ts` 新增 `SCREENSHOT_RECOGNITION_SOURCE` 与精确 predicate `isScreenshotRecognitionSource(value)`，集中截图来源语义判断；`src` 中裸 `=== 'screenshot_recognition'` 布尔比较已归零并有 standing scan test 覆盖。
- **关键决策记录**:
  · predicate 严格等价于 `value === 'screenshot_recognition'`，不做 source alias / 宽松归一化。
  · DB 写入值、类型定义、fixtures、copy 中保留必要 literal；布尔 gate 统一使用 predicate，写入 / normalizer 使用 constant。
  · 不改 GPS / uploaded / screenshot_recognition 语义，不改 DB / schema / copy。
- **准入**: `trek-utils` truth-table test 覆盖 exact string true、`track_import` / `gps` / `uploaded` / empty / null / undefined false；render-debt focused node matrix 76/76 PASS；build PASS；`git diff --check` clean；evidence pointer: `output/fu71-73-render-debt-acceptance/`。
- **关闭 commit**: `0cbedc3`
- **merge commit**: `325e046`
- **关闭时间**: 2026-06-12

---

### FU-72 ✅ Route-render style token consolidation

- **关闭原因**: FU-72 已在 PR #6 落地: `SHARE_TRACK_RENDER_PROFILES` named-field style profiles 集中管理 route render 的 line / glow / marker / filter / simplify 参数，Share editor、Archive medallion、Activity screenshot route card、server poster templates 改为引用 profile；所有值按字段名测试 pin 住，零视觉行为变更。
- **关键决策记录**:
  · profile 使用与 `buildShareTrackRender` option 一致的 named fields（如 `lineWidth` / `glowWidth` / `glowOpacity` / `startRadius` / `startStrokeWidth` / `endRadius`），不使用 positional arrays。
  · 每个 profile 保留调用点既有 literal value；dynamic poster trail formula 保持语义不变。
  · browser preview 与 server-rendered poster 继续共享 path-building + glow-layering pipeline。
- **准入**: profile-pinning unit test 按字段断言所有 profile 值；四个 deterministic render fixtures before/after diff 均 0 bytes；focused node matrix 76/76 PASS；build PASS；`git diff --check` clean；evidence pointer: `output/fu71-73-render-debt-acceptance/`。
- **关闭 commit**: `df8d4bb`
- **merge commit**: `325e046`
- **关闭时间**: 2026-06-12

---

### FU-71 ✅ Douglas-Peucker helper consolidation

- **关闭原因**: FU-71 已在 PR #6 落地: 新增共享 `src/lib/polyline-simplify.ts`，将 persist-time pixel-space 与 render-time target-space Douglas-Peucker 简化合并到同一个参数化 core；storage 与 render 两条路径保持既有 epsilon / endpoint / gap / sampling 语义。
- **关键决策记录**:
  · semantic freeze patch 保留 render path near-degenerate baseline guard: `distanceMode: 'line'` 可传 `degenerateEpsilon: COORDINATE_EPSILON`，恢复旧 `pointLineDistance` 行为；storage path 的 `distanceMode: 'segment'` 保持 exact-zero-only fallback。
  · 不做算法优化或平滑调参；accepted_gap 仍保持断开，不合并 segments。
  · fixed fixtures 覆盖 dense noisy polyline、small shape、multi-segment shape 与四个 render cases。
- **准入**: simplification equivalence JSON `equalIgnoringCreatedAt: true`；四个 deterministic render fixtures（short simple、long complex、accepted_gap multi-segment、calibrated screenshot-shape server poster）before/after SVG/JSON diffs 均 0 bytes；focused node matrix 76/76 PASS；build PASS；`git diff --check` clean；evidence pointer: `output/fu71-73-render-debt-acceptance/`。
- **关闭 commit**: `4dc3ef7`
- **merge commit**: `325e046`
- **关闭时间**: 2026-06-12

---

### FU-74 ✅ Calibration editor: zoom-invariant control points

- **关闭原因**: FU-74 已在 PR #5 落地：校准编辑器可见控制点与路线线宽按 zoom 反向缩放，1x-3x marker 稳定为 `17.25px`，路线线宽稳定为 `4.09px`；可见 marker 关闭 pointer events，独立透明 hit circle 使用真实 css-px ↔ viewBox 换算保持 `44px` 命中区；3x tap/drag 误差保持 `<=4px`；仅影响 `ScreenshotRouteCalibrationSection` 渲染与 focused A1 spec，不改 geometry / persistence / share/poster。

---

### FU-65 ✅ 截图未匹配山峰活动标题与列表副标签区分

- **关闭原因**: FU-65 已在 PR #4 落地: title chain `mountain.name → displayable checkins.track_name → fallback` 覆盖 Activity Detail / Archive list / Profile trips / Share editor / server poster / transparent watermark；列表中 unmatched rows 使用 neutral `未关联` tag；Share/render title 保持 server-owned 并拒绝 client title/track_name override；同 PR 追加 Archive header stat + trip card absent measured elevation 渲染 `--`（FU-67 rule follow-through）。
- **关键决策记录**:
  · `titleSource` 数据语义为 `mountain | track_name | fallback`，避免把 GPX-derived track names 误命名为 user_location。
  · whole-string filename-like track_name 被拒绝作为标题；`A.B线` / `1.5公里入口` 等 dotted location 保留。
  · Share/poster no-location fallback 保持 `未知山峰`，但通过 shared resolver 注入，不再在 loader 里直接 `mountain?.name ?? '未知山峰'`。
  · 本 release 零 schema / write-path / DB mutation；不动 mountain matching、Community、`/api/poster`、GPS/ranking semantics。
- **准入**: `checkin-display-title` + `share-data` + `share-render-api` node tests 33/33 PASS；focused `screenshot-recognition-flow.spec.ts` 3/3 PASS；focused `screenshot-archive-share-a2.spec.ts` 4/4 PASS；lint 0 errors / 9 existing warnings；build PASS；git diff --check clean；Production deployment READY；public `/screenshot` health 200。
- **关闭 commits**: `95d6864`, `6c75773`
- **merge commit**: `7389c72`
- **关闭时间**: 2026-06-11

---

### FU-67 ✅ Activity 海拔空值渲染统一

- **关闭原因**: FU-67 已在 PR #3 落地: Activity Detail 的 hero `最高海拔` 与 `轨迹记忆` elevation range 对缺失 measured elevation 统一渲染为 `--`，与 stats grid 的 existing presence rule 对齐；不再把 absent elevation 显示为 fabricated `0 m` 或 `0m → 0m`。
- **关键决策记录**:
  · 渲染层最小修复，仅修改 client-side `ActivityDetailClient.tsx`。
  · 不改 `/activity/[id]/page.tsx` view-model / DB semantics / verification semantics。
  · 不引入 mountain catalog altitude fallback。
  · `data-testid="activity-hero-altitude-value"` 与 `data-testid="activity-route-memory-elevation-value"` 仅用于 focused e2e 精准断言，不作为用户 UI 文案。
- **准入**: focused `screenshot-recognition-flow.spec.ts` 2/2 PASS；lint 0 errors / 9 existing warnings；build PASS；git diff --check clean；用户授权 release merge。
- **关闭 commit**: `714c361`
- **merge commit**: `c8f4027`
- **关闭时间**: 2026-06-11

---

### FU-63 ✅ 仓库 pyc / __pycache__ hygiene PR

- **关闭原因**: FU-63 已在 PR #3 落地: 六个 tracked Python bytecode cache 文件已 `git rm --cached` 停止追踪，`.gitignore` 新增 `__pycache__/` 与 `*.pyc`；本地 cache 文件保留在磁盘，不做物理删除。
- **关键决策记录**:
  · Commit A 纯 hygiene: 仅 6 个 `.pyc` cached deletions + `.gitignore` 两行。
  · 不混入功能代码、spike scripts 或 output evidence。
  · `git ls-files | rg '\.pyc$|__pycache__'` 无结果。
- **准入**: PR scope guard 确认 `origin/main..HEAD` exactly two commits；工作树仅剩两个 untracked FU-36 spike scripts；no output paths in PR diff。
- **关闭 commit**: `1472cf7`
- **merge commit**: `c8f4027`
- **关闭时间**: 2026-06-11

---

### FU-66 ✅ FU-36 A2 archive→share handoff / screenshot route badge guard

- **关闭原因**: FU-66 / FU-36 A2 已在 PR #2 落地: 截图确认成功后进入设计稿 ArchiveMoment，再「去分享」直达 `/share?checkinId=...`; `screenshot_route_shape` 在 Share editor 与 server-rendered poster 中渲染为品牌绿路线，text-only 截图不显示路线 fallback；截图来源保持 uploaded / neutral，不显示 `GPS VERIFIED` / `GPS 真实轨迹`。
- **关键决策记录**:
  · 本 release 无 DB migration / schema change；复用 FU-36 A1 已存在的 `checkins.screenshot_route_shape`。
  · Archive flow 跳过 waypoint step；text-only archive medallion 使用 Peak Trekker 品牌山形 glyph。这两项为已批准设计偏离。
  · 分享 hero altitude 改为 measured-only，文案从「峰顶海拔」统一为「最高海拔」；缺 measured elevation 时隐藏 hero block。catalog mountain altitude 不再作为未 verified poster hero fallback。
  · Screenshot route shape 不写入 `track_points`，不进入 GPS / PMTiles / Community-as-GPS 语义。
  · Recognition catch path 对非 domain errors 显示友好中文错误，保留 raw error 仅在 server log；quota 仅在成功识别后消耗。
- **准入**: 用户视觉验收 PASS；focused A2 browser spec PASS；share / render / route preview / recognition focused node tests PASS；lint + build + git diff --check clean；no full Playwright。
- **关闭 commit**: `2e30d10`
- **merge commit**: `ae9ab0b`
- **关闭时间**: 2026-06-11

---

### FU-62 ✅ mimo-v2.5 文字生产集成

- **关闭原因**: mimo-v2.5 no-hint 候选抽取 + 代码裁决器已接入生产截图识别主路；腾讯 Basic → Accurate 保留为降级兜底。`/api/screenshot/recognize` 保持同步 API 形状并显式 `runtime=nodejs` / `maxDuration=60`，`/screenshot` 等待态与确认页字段格式化同步更新。
- **关键决策记录**:
  · V1 采用同步方案，不做 async job / polling / notification / schema。
  · 产品字段集限定为距离 / 时长 / 累计爬升 / 下降 / 地点 / 日期 / 速度 / 配速，不提取卡路里，不接入截图轨迹。
  · 生产降级链: mimo-v2.5 主路；失败、超时、JSON 不可修复、低可信或关键字段缺失时回退腾讯 OCR 既有 Basic → Accurate 行为。
  · Vercel Preview 承重通过: Hobby 环境真实 recognize 约 15.9s 返回 `mimo_v25`，空白图低可信回退 `accurate` 正常。
  · 6 个 Vercel env 已配置 Production + Preview: Supabase public/service role、Tencent OCR、MIMO_API_KEY；env 明文不入代码 / 日志 / commit。
- **B13 透明披露**:
  · 同步方案依赖 Vercel 实际函数时长与 mimo 稳定性；Preview 承重已通过，生产 push 后仍需生产域名 smoke。
  · 本 sprint 无 schema / migration / production data model 变更；生产抽测会创建并清理临时测试用户，仅用于 authenticated recognize smoke。
  · 截图轨迹复原未上线，继续由 FU-36 跟踪；截图分享轨迹能力不得因文字集成被视为完成。
  · 本地 `vercel deploy --force` 上传 717MB 时遇 Vercel file upload/OOM，改用 Git-source deployment / Git push 构建，避免本地上传路径。
- **准入**: 用户视觉验收 PASS；Preview recognize 承重 PASS；lint 0e/5w · build PASS · focused node tests 30p · focused e2e 4p · git diff --check clean · no full Playwright。
- **关闭 commit**: `3272bae` / `37cc768` / `b0f0d0f`
- **merge commit**: `7cf0cbc`
- **关闭时间**: 2026-06-02

---

### FU-37 ✅ OCR vs mimo-v2.5 对比测试方案

- **关闭原因**: mimo-v2.5 spike / text v2 no-hint 重判已完成核心 benchmark, 输出文字准确率、轨迹复原、成本、延迟、JSON 可靠性与逐张人工验收证据。结论推动产品决策从"小米作为腾讯兜底"调整为"mimo-v2.5 文字主路 + 腾讯降级兜底"; 生产集成拆到 FU-62 执行。
- **关键决策记录**:
  · 模型从旧文档中的 `v2-omni` 更新为 `mimo-v2.5`。
  · benchmark 区分文字识别与截图轨迹复原: 文字进入 FU-62 生产集成; 轨迹继续由 FU-36 跟踪。
  · 腾讯 fixture baseline 仅作为参考列, 截图 visible ground truth / 人工验收证据作为评测标准。
- **B13 透明披露**: benchmark 是 research-only, 不触碰 production recognize route / Tencent pipeline / schema / UI; 26 张样本不是纯 holdout, 后续生产替换仍需 FU-62 focused tests + browser evidence + 用户视觉验收。
- **关闭 commit**: `4b2ffe9` / `fa84138` / `af26e39`
- **merge commit**: `7cf0cbc`
- **关闭时间**: 2026-06-02

---

### FU-38 ✅ 配速字段 (paceMinPerKm) 独立支持

- **关闭原因**: 用户决策关闭 FU-38, 不再推进 Phase 2 的独立 `paceMinPerKm` 持久化 + Activity / Share 展示方向。配速 (min/km) 更偏跑步 / 越野跑指标, 非登山核心指标; 登山核心仍优先看速度 (km/h) 与爬升。
- **关键决策记录**:
  · FU-38 原痛点主要是 COROS / 两步路等截图只显配速、速度栏为空, 发生在截图导入而非轨迹导入。
  · Phase 1 已落地的 pace 解析 + `/screenshot` 确认页可编辑「配速」行保留不删, 属于零成本兜底。
  · `/screenshot` 确认页的「速度 / 配速」行均 `locked: false`, 用户可自行填写 / 修改速度或配速, 足够覆盖当前截图导入的人工确认场景。
  · speed / pace 当前经 `normalizeScreenshotData()` 流转, 但写 `checkins` 时不落库, Activity Detail / Share 也不展示; 若未来要展示速率指标, 应作为 Activity / Share 指标设计的一部分另议, 不挂回 FU-38。
  · 识别准确率 (区分速度 / 配速 / 速率) 延后到 FU-35 小米 MIMO 多模态接入时, 用 prompt 让模型明确区分, 不在本 FU 解决。
- **B13 透明披露**: 本次为纯 docs 关闭, 无代码 / schema / UI 改动; Phase 1 的 parser 与确认页编辑能力继续保留。

### FU-6 ✅ UGC 山峰收录机制（砍半 · record-only）

- **关闭原因**: FU-6 record-only sprint 把现有 `/import` 两处「申请收录山峰」入口从纯占位反馈升级为真实后台记录: 用户点击 → 写入 `mountain_requests` → admin `/admin/mountains/requests` 只读列表查看。审核 / 入库 / 状态流转 / 上新流程均不在本期 scope, 后续按后台累积申请数据反馈另开新 FU。
- **关键设计决策**:
  · 新建 `public.mountain_requests` 表, 捕获提交用户、来源、坐标、海拔、省份、地点名、导入格式、候选山峰、track hash / fingerprint / 15min dedupe bucket、context JSONB。
  · RLS 收紧: authenticated 仅能 insert `user_id = auth.uid()` 的行; admin 通过 `profiles.is_admin = TRUE` select 全部; service_role full access; `PUBLIC` / `anon` 无 grants。
  · 写入 API 只做 insert, 不带 `.select()` 读回, 避免普通用户需要 select policy; unique violation `23505` 视为 deduped success。
  · `/import` 用户侧不新增表单, 自动捕获 import 流已有上下文; 两处入口共用 handler。
  · Toast 改为单条「进度 → 结果」时序: `正在提交您的山峰反馈…` → 成功 `已收到您的山峰收录申请，后续我们审核过后会逐步对山峰进行开放` 或失败 `申请暂时没写入，请稍后重试。`, 结果前清掉进度 toast, 避免语义打架。
  · Admin 只读列表不暴露 email / 手机号; 用户显示为 `用户名` 或 user id 8 位前缀; OCR / 用户来源文本全部 React text 渲染, 不使用 `dangerouslySetInnerHTML`, XSS fixture 已覆盖。
  · `import_format` CHECK 仅含 `gpx/kml/fit`, 已核对当前 import 实际支持格式一致。
- **B13 透明披露**:
  · production migration 走 deploy-gated apply: Vercel READY → baseline read → transaction dry-run → apply → post-verify。
  · `apply_migration` 首次遇 Supabase 插件 wham gateway 传输层瞬时失败; 只读确认表仍不存在后, 经用户授权完整重跑门控并成功 apply。
  · 15min bucket dedupe 是 MVP 防刷, bucket 边界分钟可能重复。
  · province best-effort, 不接逆地理; 没有坐标时允许为空。
  · `/import` 非 middleware 门禁, 但 API 仍以 auth.getUser() 防御 401; 用户侧成功路径基于实际登录态。
- **准入**: lint 0e/5w · build PASS · focused node tests 35p · focused e2e 3p · git diff --check clean · `rg "test.fixme\\(" tests/e2e` 0 matches · no full Playwright。
- **Production migration verify**: `public.mountain_requests` 21 columns; 4 business indexes + pkey; dedupe unique index `idx_mountain_requests_dedupe`; RLS enabled; policies `mountain_requests_insert_own` / `mountain_requests_select_admin`; grants `authenticated INSERT/SELECT`, `service_role ALL`, `PUBLIC/anon` none。
- **风险落地**: codex-risk-behavior-policy 连续 19 个 sprint 0 红线违反。

### FU-34 ✅ 截图 fixture 库扩充 + CI 回归

- **关闭原因**: FU-34 降级为按需 reactive 维护项。Pre-3.c 以后已具备基础 OCR fixture / parser 回归框架, 继续长期维护不需要占用 Active FU; 后续遇到具体失败样本时按单独 case 提取 raw OCR JSON → 加 fixture → 调 parser → 加 focused test。
- **B13 透明披露**: 本次不新增 fixture, 不改 parser; 关闭语义是 tracker hygiene / 工作流降级, 不是宣称所有未来截图 App 都已覆盖。

### FU-61 ✅ 自动登顶兜底 + 登顶范围 300m + 照片非强制

- **关闭原因**: FU-61 sprint 落地 Trek 登顶核验口径调整: GPS 轨迹到达峰顶范围即视为登顶; 手动「我已登顶」保留仪式感但非必要; 照片 / 备注 / 细节均可下山后补。user 视觉验收 PASS。
- **关键设计决策**:
  · 登顶核验范围统一为 300m: client / server 默认 summit radius、手动确认解锁半径、analytics summit proximity threshold 均对齐; `APPROACH_RADIUS = 500m` 保持为临近提醒区, 非核验区。
  · server `verify_summit_checkin` 改为整段 `track_points` 最近点核验, 不再用结束末点; 写入 `latitude` / `longitude` / `verification_distance_m` 时使用最近证据点, 避免用户下撤后误判失败。
  · `finish_incomplete_trek` 在保存 incomplete 前执行自动兜底: 同 session 尚无 checkin、轨迹点数和时长满足有效记录阈值、整段轨迹最近点进入核验范围时, 自动生成 `completion_status='complete'` / `GPS VERIFIED` / `verified_at` 记录。
  · 自动登顶与手动登顶同档 `verified`, 计入排名与执照, 不新增 `auto` proof taxonomy。
  · 手动确认照片改为可选: 有照片则上传后确认, 无照片也可直接确认; Trek UI 文案明确「到达峰顶 300m 范围即视为登顶, 照片和备注可下山后补」。
  · FAQ 新增「怎样才算登顶 / 系统如何判定登顶」, 并更新 `record.summit-window` / `review.what-is-review` / `record.source-label`; `docs/target-prd.md` / `docs/ui-interaction-spec.md` / `docs/acceptance-checklist.md` 同步产品口径。
- **B13 透明披露**:
  · 坐标精度仍依赖 `mountains.latitude / longitude`; FU-16 坐标审计未完成, 本 sprint 用 300m buffer 降低但不消除坐标误差风险。
  · GPS 漂移可能误触发登顶; 自动兜底仍受现有 drift filtering、最小点数、最小时长约束。
  · server 以已保存 `track_points` 为 canonical; client 在接近峰顶 / 结束路径尽量 flush 最新点, 但完整离线队列 / 长期无网结束同步不在本 sprint scope。
  · Phase A e2e 曾暴露 auto-fallback 用例的 harness 问题: 测试只 backdate server session, client elapsed 未达到 testMode 10s 有效记录门槛, 因而正确走 short-record abort。已在测试层加 `waitForClientElapsedAtLeast`, 未改 app 行为。
- **准入**: lint 0e/5w · build PASS · focused node tests 39p · focused e2e 6p (summit photo optional / resilience summit zone / auto summit fallback) · git diff --check clean · `rg "test.fixme\\(" tests/e2e` 0 matches · no full Playwright。
- **风险落地**: codex-risk-behavior-policy 连续 18 个 sprint 0 红线违反。

### FU-4 ✅ 删除西岳华山南峰冗余记录

- **关闭原因**: FU-4 sprint 按用户决策删除 `mountains` 冗余记录 `7ab4cca8-a681-4f1e-94bc-9032d16d41f7` (西岳华山南峰), 保留 `216508c9-ffca-4164-8010-534d8650ee64` (华山)。两行海拔同为 2154m、坐标相近, 已判定为同一山峰冗余而非独立山峰。
- **执行路径**:
  · Phase 1 先用 Supabase 插件只读 inventory + archive 备份, 并 STOP 等用户审核。
  · archive 位置: `/tmp/fu4-review/backup/mountain-7ab4cca8-a681-4f1e-94bc-9032d16d41f7.json`, `/tmp/fu4-review/backup/mountain-216508c9-ffca-4164-8010-534d8650ee64-keep-snapshot.json`, `/tmp/fu4-review/backup/reference-rows-7ab4cca8-a681-4f1e-94bc-9032d16d41f7.json`, `/tmp/fu4-review/backup/schema-inventory-and-counts.json`。
  · 逐表引用计数均为 0: `checkins`, `checkins_archive_20260513`, `mountain_waypoints`, `trek_sessions`, `weather_cache`; `events` text sanity search 也为 0。
  · 用户审核通过后, Phase 2 在事务内重新校验待删行存在 + 5 张表引用全 0, 随后删除单行; 因零引用, 未做 reassign。
- **Post-verify**:
  · `7ab4cca8-a681-4f1e-94bc-9032d16d41f7` 已不存在。
  · 5 张表无该 id 残留孤儿引用。
  · 保留目标华山 `216508c9-ffca-4164-8010-534d8650ee64` 行完好, `checkin_count=153` 未动。
  · 删除结果: `/tmp/fu4-review/final/deletion-result.md`。
- **B13 透明披露**:
  · 本 sprint 只删除冗余 mountain 行, 不改业务代码 / schema / 统计缓存。
  · Phase 1 发现华山 `mountains.checkin_count` 缓存与实际 `checkins` 行数漂移 (153 vs 454 / 421 complete / 196 verified), 已补入 Known Issue; 非 FU-4 引入, 本 sprint 只记录不修。
- **风险落地**: codex-risk-behavior-policy 连续 17 个 sprint 0 红线违反。

### FU-5 ✅ premium-vertical-story 路线层后补

- **关闭原因**: FU-5 sprint 落地 `premium-vertical-story` 模板真实轨迹层。无图且有 `data.trackPreview` 时渲染真实路线; 无轨迹时保留 `VerticalStoryRidgeSvg` 静态兜底; 有照片时照片路径不变。Phase 0-6 完成后 user 视觉验收 PASS。
- **关键设计决策**:
  · 模板内新增 `VerticalStoryTrailSvg`, 复用现有 `buildShareTrackPath` 与 `ShareTemplateData.trackPreview`, 无需新增数据 wiring。
  · 轨迹层使用方形 frame `{ x: 230, y: 390, width: 620, height: 620, padding: 56 }`, 置于上中背景区, 避开顶部 header 与底部山名 / stats / footer。
  · 视觉表现为绿色真实路线 + 低透明 glow, 起点空心暗底描边, 终点实心 success; 单点 track 显示 marker-only。
  · 分支逻辑保持三态: no-photo + track → real trail; no-photo + no-track → ridge fallback; photo → original photo path。
  · 仅改 `premium-vertical-story` + 2 个强关联测试, 不碰其它模板 / `src/lib/share-track-preview.ts` / 照片路径。
- **B13 透明披露**:
  · 轨迹仍使用现有 share-track-preview 归一化, 继承 FU-12 的地理 aspect ratio 拉伸局限; 本 sprint 用方形 frame 规避竖高 frame 的额外拉伸, 全局 aspect 修复留 FU-12。
  · share editor 小预览不在本 sprint scope, 后续可独立跟踪。
- **准入**: lint 0e/5w · build PASS · focused node tests `share-render-api` + `share-track-preview` 28p · git diff --check clean · 3 态 PNG evidence 已保存至 `/tmp/fu5-review/phase4/production-data/`。
- **风险落地**: codex-risk-behavior-policy 连续 15 个 sprint 0 红线违反。

---

### FU-12 ✅ share-track-preview 保留地理 aspect ratio

- **关闭原因**: FU-12 sprint 落地 `share-track-preview` 真·地理 aspect ratio 修复。`buildShareTrackPreview()` normalize 加 `cos(midLat)` 纬度修正 (`lngScale = max(cos(midLat * π / 180), 0.1)`), 使用 `range = max(latRange, effLngRange)` + 居中归一化; `projectPoint()` 改为短边统一 scale + 居中 letterbox, 让轨迹米制比例正确且与 frame 形状解耦。
- **关键设计决策**:
  · 修复双源失真: 旧 normalize 独立拉伸 x/y, 旧 projectPoint 在非方形 frame 中按 width/height 独立缩放造成二次拉伸。
  · 6 个轨迹面使用同一条宽轨迹生成证据, route bbox 均保持约 7.73:1 的一致形状; ShareClient 216×290 非方形预览不再纵向拉满。
  · 真实两步路 GPX (`1232` 点, 采样 `206` 点) 验证: route bbox `117.24×196`, 非方形框正确 letterbox, user 视觉验收确认形状与两步路一致。
  · 边界严格限定为 `src/lib/share-track-preview.ts` + `tests/share-track-preview.test.ts`; 模板 frame / 渲染 / 照片路径 / `ShareTrackPreview` shape / schema 均 0 改动。
- **B13 透明披露**:
  · 本 sprint 使用 degree-space + `cos(midLat)` 局部纬度修正, 不是完整 Web Mercator; 对单条轨迹的小纬度跨度近乎精确, 足以匹配源 App 视觉形状。
  · 保持地理比例后, 长边 letterbox 会让部分模板中的轨迹不再填满装饰区域; 这是预期行为, 后续如需视觉调大应单独调模板 frame。
- **准入**: lint 0e/5w · build PASS · focused node tests 29p (`share-track-preview` + `share-render-api`) · git diff --check clean · no full Playwright。
- **风险落地**: codex-risk-behavior-policy 连续 16 个 sprint 0 红线违反。

---

### FU-52 ✅ PMTiles 实验包 cleanup + china-z7 死代码清理

- **关闭原因**: FU-52 sprint 完成 PMTiles storage / code 双侧收口。Supabase Storage `map-tiles/basemap/` 下 9 个被否决实验包 + `china-z7` / `china-z8` 全国包已按用户确认清单删除, 释放 57,788,515 bytes (55.11 MiB); 仅保留生产 `basemap/huashan-bbox30-z9-12.pmtiles`。
- **关键设计决策**:
  · 当前无全国地图产品场景, `china-z7-20260519.pmtiles` 不再保留作 debug / fallback。
  · `src/lib/map/map-assets.ts` 移除 china-z7 national-asset 死机器: `NATIONAL_MAP_TILE_ASSET` / `getNationalMapTilesAsset` / `getMapTilesPublicUrl` / `MAP_TILES_OBJECT_PATH` / `MAP_TILES_SIZE_BYTES` 等。
  · `/debug/map-prototype` 存储估算改为 per-mountain bbox30 z9-12 × 300, 不再叠加全国主包。
  · `docs/map-weather-brief.md` 同步 v0.3.6: china-z7 停用, production baseline 收口为 per-mountain bbox30 z9-12, Activity / Trek 缺 mountain-bbox 继续 trace-only。
  · production Mountain Detail / Trek / Activity 路径不变, Huashan PMTiles registry 保留。
- **Storage 删除验证**:
  · 删除清单: `china-z7-20260519.pmtiles`, `china-z8only-20260519.pmtiles`, `huashan-bbox25-z12/z13`, `huashan-bbox30-z11-12/z12/z13`, `huashan-bbox50-z12/z13`。
  · 删除后 `basemap/` 只剩 `basemap/huashan-bbox30-z9-12.pmtiles`。
  · Huashan public URL status 200; 9 个删除对象 public URL 均返回 400 (not found 类结果)。
- **前瞻 · 并入 300 山峰 pipeline**:
  · 最终地图为分区域 per-mountain bbox 包上传: 300/400 山峰批量上传时, 每座山需生成 bbox30-z9-12 PMTiles → 上传 Storage → 注册进 `MOUNTAIN_PMTILES_ASSETS`。
  · "每座山详情页地图正常渲染"列为该 pipeline 的一个验收项。
- **准入**: lint 0e/5w · build PASS · focused node tests 32p · Huashan Mountain Detail 375px PMTiles evidence captured · active `src` / `tests` 对 `china-z7` / national API 0 命中 · git diff --check clean。
- **风险落地**: codex-risk-behavior-policy 连续 13 个 sprint 0 红线违反。

---

### FU-45 ✅ 山峰简介恢复 sanitized 富文本渲染

- **关闭原因**: FU-45 sprint 恢复 FU-49 迁移时被 `cleanDescription` 误 strip 的山峰简介富文本渲染。`/mountain/[id]`「山峰简介」改用 `SanitizedMountainDescription` 渲染管理员富文本 (标题 + 项目符号), user 视觉验收 PASS。
- **关键设计决策**:
  · DOMPurify 收紧: `ALLOWED_TAGS` 仅 `h2/h3/h4/p/ul/ol/li/strong/em/b/i/br/span`, `ALLOWED_ATTR` 置空 (剥所有属性), `FORBID_TAGS` 含 `img/a/script/iframe/style` → 禁图片 / 链接 / 脚本 / iframe / 内联样式, 防 XSS。
  · 移除旧纯文本 strip + 96 字符 line-clamp 折叠; B13: 富文本折叠留后续, 本 sprint 完整渲染 sanitized rich text。
  · CSS 走 type-system token: `h2 → title-l`, `h3/h4 → title-m`, `p/li → body-m`, `ul=disc`, `ol=decimal`, marker 使用 primary 色。
  · `admin-mountain-edit.spec.ts` 解除 FU-45 `test.fixme`, 路由 `/explore/{id}` → `/mountain/{id}`, 恢复富文本结构断言 (heading level 2 + bullets, 作用域收紧到 description section)。
  · 新增 sanitize 配置 node 单测锁 allow / forbid / empty attrs / SSR fallback; admin `RichTextEditor` 不变。
- **B13 透明披露**:
  · 方向曾从"纯文本 + 换行"修订为"sanitized 富文本 (无图片)", 按用户修订指令执行。
  · `dangerouslySetInnerHTML` 仅经 DOMPurify strict config 后使用。
  · 真实山峰数据批量上传时需做简介渲染二次视觉校验, 并入 300 山峰 pipeline review 环节。
- **准入**: lint 0e/5w · build PASS · focused node tests 11p · `admin-mountain-edit.spec.ts` 5/5 PASS · 375px/desktop rich text evidence captured · `rg "test.fixme\\(" tests/e2e` 0 matches · git diff --check clean。
- **风险落地**: codex-risk-behavior-policy 连续 12 个 sprint 0 红线违反。

---

### FU-10 ✅ "申请收录山峰" toast 占位反馈

- **关闭原因**: FU-10 轻量 bundle 落地 `/import` 两处"申请收录山峰"入口反馈: 距离校验阻断态 + 无匹配空态点击后弹出 toast `已收到您的山峰反馈，正式收录流程上线后会优先核实并录入。`, 同时保留原 `start.mountain-not-listed` help sheet / FAQ 行为。user 视觉验收 PASS。
- **关键设计决策**:
  · 两处入口共用 `handleRequestMountain`, 先显示 toast 再打开帮助 sheet。
  · `/import` 页面级补 `AppToastProvider`, 与 `trek/page.tsx` 同类局部 provider 方式一致; 否则 `useAppToast()` 在该页面会落到 no-op。
  · `AppToastProvider` z-index 160 高于 HelpSheet z-index 120, toast 与帮助 sheet 可同时可见。
- **准入**: lint 0e/5w · build PASS · focused node tests 97p · 375px/desktop browser evidence captured · git diff --check clean。
- **风险落地**: codex-risk-behavior-policy 连续 11 个 sprint 0 红线违反。

---

### FU-15 ✅ Live 阶段 GPS 弱信号"当前海拔"文案修正

- **关闭原因**: FU-15 轻量 bundle 修正 Trek gpsWeak 全屏 UI 的"当前海拔"辅助文案, 从静态 `暂用上次值` 改为 source-aware 四态: `上次 GPS 值` / `GPS 弱信号参考` / `地形高程参考` / `采集中`。user 视觉验收 PASS。
- **关键设计决策**:
  · Phase 1 审计确认 tracker 原前提已过时: 当前值不是 `mountain.altitude`, 而是 `lastValidAltitudeM ?? displayAltitude`。
  · `displayAltitude` 来自当前 GPS altitude 或 Open-Meteo 地形高程查询 fallback, 非山峰库标称海拔。
  · 因此未采用原建议"目标山峰标称海拔 / 基于山峰库", 改为诚实反映真实数据来源。
  · 不改 GPS 采样、地形高程查询、Trek 持久化或状态机, 仅调整展示文案。
- **准入**: lint 0e/5w · build PASS · focused node tests 97p · FU-15 四态文案视觉验收 PASS · git diff --check clean。
- **B13 透明披露**: 本次关闭同时修正了旧 tracker 的错误事实前提, 不是照搬旧文案。

---

### FU-2 ✅ ui-spec 留证语义文档对齐

- **关闭原因**: FU-2 轻量 bundle Phase 1 独立审计确认 `docs/ui-interaction-spec.md` 已无 `verification_status` / `verified_at` / 旧"已留证=verified"字段语义引用, 文档中的"留证"均为合法产品词。已与"已留证 = `mountain_id IS NOT NULL`"口径对齐, verify-and-close, 0 代码 / 文档改动。
- **审计证据**:
  · `rg "verification_status|verified_at|verified|已留证|留证|mountain_id" docs/ui-interaction-spec.md` 未发现 legacy 字段语义。
  · 命中的"留证"上下文均为产品语言, 如"先有照片，再做留证"、"仅留证"、"完成留证"、"登顶留证"。
- **B13 透明披露**: FU-2 按当前代码/文档真相关闭, 不为旧 tracker 硬凑改动量。

---

### FU-57 ✅ 激活漏斗深度 (10 步细分)

- **关闭原因**: FU-57 sprint 落地 `admin/analytics` Overview 激活漏斗升级, 从 FU-55 的 4 步粗漏斗扩展到 10 步 actor-level 诊断漏斗。FU-57 + FU-60 合并 sprint Phase 0-6 完成, 含 1 个 in-sprint license patch (移除 `ua-parser-js` AGPL 依赖), user 视觉验收 PASS。
- **关键设计决策**:
  · 10 步 mapping: 访问 (`page_view`) → 注册 (`auth.register_complete`) → 首次浏览山峰 (`business.mountain_view`) → 首次选山 (`page_view` `/trek?mountainId=` 近似) → Trek 启动 (`business.trek_start`) → Trek 完成 (`business.trek_complete`) → Activity 创建 (`business.activity_create`) → 分享生成 (`business.share_template_generate success=true`) → link 点击 (`business.share_link_open`, actor 优先 `visitor_session_id`) → link 拉新 (`business.share_link_register_attribution`, actor 优先 `new_user_id`)。
  · 每步按 actor 去重, actor 默认 `user_id ?? session_id`; 每行展示 actor count + 渗透率 + 流失数。
  · 第 4 步不新增埋点, 用 `/trek?mountainId=` page_view 作为 "首次选山" 近似; 第 5 步才是实际 Trek 启动。
  · 第 9/10 步是传播边缘诊断, 天然跨 `visitor_session_id` / `new_user_id` 身份边界, 不等同同一 actor 连续生存漏斗。
  · 默认展开 "10 步漏斗说明" in-UI, 透明披露事件 mapping + actor-level 口径 + 第 4/5/9/10 步边界。
  · 复用 FU-58 顶层 cohort filter, 10 步漏斗跟随 range + cohort 轴变化。
- **B13 透明披露**:
  · 10 步 funnel 是 actor-level stage volume, 非严格 same-actor survival curve。
  · 第 4 步是 page_path 近似, 后续如需要更严谨可独立新增 `business.mountain_select` 埋点。
  · 第 9/10 步跨身份边界已在 UI 和 final acceptance 中披露。
  · 不动 `events` 表 schema / 埋点 SDK / API endpoint。
- **准入**: lint 0e/5w · build PASS · focused node tests 83p · `analytics-activation-funnel-sql` 新增覆盖 actor dedupe / 10 step mapping / cohort filter · git diff --check clean。
- **风险落地**: codex-risk-behavior-policy 连续 10 个 sprint 0 红线违反 (含本次用户授权 in-sprint license patch, 非违规)。

---

### FU-60 ✅ 来源 + 设备分群 dashboard

- **关闭原因**: FU-60 sprint 落地 `admin/analytics` User Behavior tab 来源 / 设备分群 dashboard, 让 FU-55 已采集的 `referrer` + `user_agent` 进入可视化决策面。FU-57 + FU-60 合并 sprint Phase 0-6 完成, license patch 后 user 视觉验收 PASS。
- **关键设计决策**:
  · 来源分布 6 类 referrer: 直接 / 微信 / 朋友圈 / 百度 / Google / 其他; 同站、空 referrer、localhost、127.0.0.1 归 `直接`。
  · 来源 sub-block: PieChart + `source × actor count × share × D1/D7/D30 可见历史回访率` 表格 + 默认展开分类说明。
  · 设备分布 4 类: iOS / Android / Desktop / Other; 输出 `device × actor count × Trek start actors × Trek complete actors × completion rate`。
  · 设备分类最终采用 ~15 行内联正则, 顺序 iOS → Android → Desktop → Other; iOS 先于 Mac/Desktop 因 iOS UA 含 `mac os x`, Android 先于 Linux/Desktop 因 Android UA 含 `linux`。
  · in-sprint license patch: 移除 `ua-parser-js@2.0.10` (`AGPL-3.0-or-later`) 依赖, 改内联正则分类; `package.json` / `package-lock.json` 回到 main 基线, 0 新依赖。
  · 对 demo/test UA, 4 桶分布与原 `ua-parser-js` 输出逐条一致, 0 分桶漂移: iOS 36 / Android 36 / Desktop 38 / Other 15。
  · 默认展开 "来源分类说明" / "设备分类说明", in-UI 披露 referrer 分类规则和 UA 解析局限。
  · 复用 FU-58 顶层 cohort filter, 来源/设备 metrics 跟随 range + cohort 轴变化。
- **B13 透明披露**:
  · referrer 会被浏览器、隐私设置、微信内嵌页或直接访问丢失; 空/同站统一归 `直接`。
  · UA 分类是启发式正则, 不做 fingerprinting; 极端/罕见 UA 可能与完整 parser 不同, MVP 统一归 `Other`。
  · 来源 D1/D7/D30 回访率基于当前 filtered event 可见历史, 高量场景应升级 daily aggregates 或 profile-derived source history。
  · `ua-parser-js` 因 AGPL license 被移除, 这是用户授权的 in-sprint license patch, 非 scope creep。
  · 不动 `events` 表 schema / 埋点 SDK / API endpoint。
- **准入**: lint 0e/5w · build PASS · focused node tests 83p · `analytics-source-device-sql` 新增覆盖 referrer 6 类 / device 4 类 / actor-level Trek completion rate · patch 后 `rg "ua-parser-js|UAParser" src/` 0 命中 · `package.json`/lock 0 diff · git diff --check clean。
- **风险落地**: codex-risk-behavior-policy 连续 10 个 sprint 0 红线违反 (含本次用户授权 in-sprint license patch, 非违规)。

---

### FU-55 ✅ 自托管页面埋点 + admin dashboard 可视化

- **关闭原因**: FU-55 sprint 落地完整数据观测体系: Supabase `events` 表 (jsonb properties) + 客户端埋点 SDK (`sendBeacon` / fire-and-forget / anonymous cookie `pt_anon_sid` / attribution cookie `pt_attribution_link_id`) + `/api/analytics/event` API + `admin/analytics` dashboard 5 tabs + Recharts 可视化。Phase 0-6 + patch v1 (K-factor + 环比同比 delta + 渗透率 + today/all-time + DAU cohort + 水印模板 sub-cards + 总花费) + patch v2 (paid_attempt funnel 3 state + Trek timeout 被动检测) 三轮 in-sprint 闭环后 user 视觉验收 PASS。
- **关键设计决策**:
  · 选型路径 E 自建 (国内访问 + 数据自主 + 已有 admin 集成 + 隐私合规简单), 不接 GA/PostHog/Plausible。
  · 单 `events` 表 JSONB schema (MVP, 未来流量上来加 daily aggregates)。
  · 匿名访客 `session_id` cookie (`pt_anon_sid` 30d), 流量漏斗完整含匿名 → 注册转化。
  · share `?ref=<share_link_id>` attribution chain 完整端到端: link create → cookie 写入 → register hook 读 cookie → emit register_attribution event → cookie 清除。支撑 K-factor 病毒系数计算。
  · 5 tab dashboard: 概览 (DAU/funnel/K-factor/留存) + 用户行为 (山峰/Trek/Activity/Community/水印模板) + 付费潜力 + 模型评测 (5 项核心 KPI: success/hallucination 启发式/latency/cost placeholder/correction) + 运营成本。
  · 时间窗口: 今日 / 7天 / 30天 / 90天 / 历史累计 5 option + 环比同比 delta。
  · Trek 中断 / 完成 + summit_proximity_enter/leave 完整事件链支持 "差点登顶 near_miss_rate" 指标。
- **Production migration apply (A9/B10/B11)**: Vercel production deployment `dpl_EeWzW62CoMZPxUHK2rqzwPxobr52` for merge commit `abfbb1b` reached READY before database mutation。Baseline read confirmed `public.events` absent; transaction dry-run returned `fu55_events_dry_run_ok`; `apply_migration` `20260528093000_create_events_table` succeeded; read verification confirmed 11 columns, 4 business indexes + primary key, RLS enabled, policies `events_insert_anon_authenticated` / `events_select_admin`, and 0 rows after apply。
- **B13 透明披露**:
  · production migration 严格 deploy-gated apply (本 V3 阶段执行): Vercel READY → baseline read → dry-run → apply → read verify。
  · `cost_cny` 当前固定 0 (provider pricing 集成由独立 FU 处理)。
  · `hallucination_rate` 启发式定义 (`user_edit / complete`), 严谨 ground truth 评测留独立 FU。
  · per-provider OCR 对比 (腾讯 OCR vs 小米 v2-omni) 是 short-term 工具, 未来全量切小米后此 sub-block 可 deprecate (独立 FU)。
  · `trek_timeout` 被动检测 (start/resume 时检查 stale session), 不是主动 emitter。
- **遗留 / 后续 FU** (本 V3 同步 register): FU-57 激活漏斗深度 10 步细分; FU-58 新老用户分群双轨; FU-59 付费功能 ranking + 付费意愿评分 (P1 商业化决策); FU-60 来源 + 设备分群。
- **准入**: lint 0e/5w · build PASS · node focused tests 44p · git diff --check clean · FU-45 为唯一剩余 `test.fixme`。
- **关闭 commit**: `bfc5f16` / `4d5e8c3` / `efb9e1c` / `2ad5f05`
- **merge commit**: `abfbb1b`
- **关闭时间**: 2026-05-28
- **风险落地**: codex-risk-behavior-policy 连续 7 个 sprint 0 红线违反 (FU-49 / FU-43 / FU-53 / FU-56 / FU-47(b) / FU-47(c) / FU-55), 含本 sprint production migration apply 严格 deploy-gated。

---

### FU-59 ✅ 付费功能 ranking + 付费意愿评分

- **关闭原因**: FU-59 sprint 落地 `admin/analytics` 付费潜力 tab 商业化决策 dashboard 扩展: 付费功能 ranking 表 + 高意愿用户 top 50 + 透明算法说明 in-UI。Phase 0-6 一次性完成无 patch 轮 (user 视觉验收 PASS)。
- **关键设计决策**:
  · per-feature ranking 公式: attempt 40% (scale) + users 30% (coverage) + engagement 30% (吸引力) + 5 级 tie-break + max-normalize 防止单极端值主导。
  · user intent score 公式: frequency 30% + engagement 35% (最强 intent 信号占比最高) + diversity 20% + recency 15% + cap values (12/5/3) + 5 段 recency 函数。
  · actor id = `user_id ?? session_id` (anonymous + identified 含, 不 backward attribution, FU-58 cohort 处理)。
  · masked actor id 显示 (8 char 前缀), 完整信息去 `/admin/users` 搜。
  · 算法说明 open-by-default collapsible in-UI, 透明展示加权 logic 避免 black box 决策。
  · 5 时间窗口 (today/7d/30d/90d/all_time) 全部 sub-blocks 跟随 filtered event set, 无需专门处理。
  · 不动 `events` 表 schema / 埋点 SDK / API endpoint (仅 KPI 算法 + UI 扩展)。
- **B13 透明披露**:
  · scores 是 MVP 决策启发, 非 revenue / pricing model。
  · 跨 window 局限性: scores 仅同 window 内可比。
  · anonymous + identified actor 不 stitch (FU-58 处理)。
  · demo placeholder feature_ids (`paid_feature_tbd_a` 等), production 真实数据取决 paid_attempt 量。
  · FU-59 仅衍生 metrics from FU-55 events, 不新加埋点。
  · `cost_cny` 仍是 placeholder 0 (FU-55 B13, provider pricing 独立 FU)。
- **风险落地**: codex-risk-behavior-policy 连续 8 个 sprint 0 红线违反 (FU-49 / FU-43 / FU-53 / FU-56 / FU-47(b) / FU-47(c) / FU-55 / FU-59)。

---

### FU-58 ✅ 新老用户分群双轨 dashboard

- **关闭原因**: FU-58 sprint 落地 `admin/analytics` dashboard cohort 过滤轴扩展: 顶部 4 cohort selector (全部 / 新用户 / 老用户 / 匿名访客) + banner + 算法说明 + 5 tab 全部跟随 cohort 过滤。一次性 Phase 6 通过无 patch 轮, user 视觉验收 PASS。
- **关键设计决策**:
  · cohort 4 选项: all / new / returning / anonymous, 阈值 `NEW_USER_THRESHOLD_DAYS = 7d`。
  · 架构选 Option B: `partitionByCohort` utility filter events 在顶层, 9 个现有 `build*` helper signature 不变, 避免大规模 refactor。
  · `buildAnalyticsDashboardData` 签名扩展 `(events, range, schemaReady, now, cohort='all', fullHistory=events)` 保持旧调用兼容。
  · cohort 判定基于 actor 全历史 `register_complete` event, 非 window-local。
  · Legacy identified user (有 `user_id` 但 fullHistory 无 `register_complete`) 归 returning, 避免 FU-55 上线前已注册用户在 dashboard 上消失 (B13 关键 edge case)。
  · Anonymous cohort: `user_id` null 的事件, actor 按 `session_id` 计。
  · URL `?cohort=all|new|returning|anonymous` SSR-safe, `page.tsx` server-side 读取。
  · cohort 切换后 delta 基于同 cohort 上一窗口 (与 FU-55/59 一致)。
  · 5 tab UI 不动 (Overview/User Behavior/Paid Potential/Model Evaluation/Operational Cost 全部沿用 filtered events)。
  · 顶部 banner 显示 cohort + 阈值 + actor 数 + 事件数。
  · cohort 划分说明 collapsible 默认展开, 透明展示 7d 阈值 + 全历史 register + legacy returning + anonymous 不 stitching。
- **B13 透明披露**:
  · 7-day threshold 是 MVP 激活启发, 非长期留存模型。
  · cohort 是 actor-level 全历史属性, 跨 window 不直接可比。
  · scores/deltas 仅同 cohort + window 内可解释。
  · anonymous + identified actor 不 stitch (留独立 identity sprint)。
  · Legacy identified user 归 returning 防丢失历史数据。
  · Full-history register query 有 practical limit; 高量场景需 daily aggregates 或 profile-derived registration source (独立 FU)。
  · 不动 `events` 表 schema / 埋点 SDK / API endpoint (仅衍生 metrics from FU-55 + 全历史 register query)。
- **风险落地**: codex-risk-behavior-policy 连续 9 个 sprint 0 红线违反 (FU-49 / FU-43 / FU-53 / FU-56 / FU-47(b) / FU-47(c) / FU-55 / FU-59 / FU-58)。

---

### FU-56 ✅ e2e helper / spec rot 系统修复 (7 个已知 fail · FU-53 sprint 期间识别 · 一次性 in-sprint register+close)

- **关闭原因**: FU-53 sprint 期间识别的 7 个 e2e fail 集中收口修复。6 fail 修 + 1 fail 归 flake (transparent disclose)。改动范围严格限定 test/helper 层 (4 文件 +80/-71), **0 src 业务代码改动**。
- **7 fail 处理对照**:
  · #1 app.spec.ts:183 protected trek returnTo — **reclassify: 非真业务 regression, 实际 helper timing 假设 rot**。controlled repro + helper hardening 后 reproducible path 已 stable pass；真业务 returnTo flow 由 FU-46 BUG #1 patch (commit 84984fe) 已正确修，本 sprint 无需改 src/auth。用户视觉验收 PASS 完整 returnTo flow (guest entry → register → return to mountain)。
  · #2 #3 app.spec.ts:330/463 auth helper rot — registerFreshUser() 改 service-role seed + 真实 login UI + bounded navigation retry。避免 UI sign-up fixture timing-sensitive 假设，也避免混淆 fixture setup rot 与真业务 returnTo flow (B9 边界明确)。
  · #4 app.spec.ts:490 explore helper rot — getExploreCardMeta() / first mountain lookup 等当前 `[data-testid="explore-mountain-card"]` + canonical `/mountain/` hrefs。
  · #5 button-token-migration.spec.ts:58 FU-54 漏修 spec rot — assertion 改 profile-license-badge + 当前 aria label (从旧 `无执照登山` 改 FU-54 license badge wording)。
  · #6 share-preview-track.spec.ts:167 cleanup TypeError fetch failed — **归 non-reproducible flake (8 次执行均 pass + --repeat-each=3 pass + subset pass)**。透明 disclose 不掩盖。
  · #7 trek-complete-page.spec.ts:11 trek helper threshold rot — completeSummitPhotoFlow() 加 server session id + 8 GPS points + 加 session backdate (FU-46 BUG #5 范式不同 helper)。
- **风险策略实战 (FU-49 + FU-43 + FU-53 之后第 4 个完美 sprint)**: Codex 严格执行 B1/B2 (Phase 4 STOP), B4/B6/B12 (5 张 issue-level 截图 + metrics 集中 #1 真业务 flow), B7 (audit.md 实时), B8 (不跑全量 e2e), B9 (scope 严格限 7 known fail + helper boundary 不混业务), B13 (#1 reclassification + #6 flake + #2/#3 helper boundary 三项主动 disclose)。
- **关键 audit-driven finding (B13)**: #1 reclassify 是 Codex audit 后发现的实际根因, 不硬凑 src/auth 改动来"显得修了" — risk policy A3/B6/B13 完美实战。
- 准入: lint 0e/6w · build PASS · node test 250p · 强关联子集 e2e 26 passed · git diff --check clean · 0 src 改动。
- 用户视觉验收: PASS (3 checkpoint 全过, 含 protected trek returnTo 完整 flow + trek startup + mountain detail cross-check)。
- 关闭 commit: `b5a1690` / `3d90203` / `bd62a60`
- merge commit: `13bc4f4`
- 关闭时间: 2026-05-28

---

### FU-53 ✅ SharePosterButton (legacy) obsolete cleanup

- **关闭原因**: legacy `src/components/ui/SharePosterButton.tsx` (937 行) + `/share-card-lab` debug 路由删除；`ModalShell layout='share-sheet'` 死分支与 `.share-sheet*` / `modal[data-layout='share-sheet']` CSS 清理；debug / onboarding QA 中 `/share-card-lab` 入口删除；`OnboardingModal` 不再为 deleted route 做 suppression；`app.spec.ts` / `community-final-polish.spec.ts` / `button-token-migration.spec.ts` 中 5 个 legacy share-sheet e2e block obsolete cleanup。
- **生产 share 保留**: `/share` 真实生产编辑器 (`src/app/(flow)/share/ShareClient.tsx` + `page.tsx`) 未改业务逻辑；`rg "SharePosterButton|share-card-lab|share-sheet" src tests` 为 0 live hits；route list 已无 `/share-card-lab` 且 `/share` 保留。
- **视觉 / 浏览器证据**: 375px 本地截图覆盖 `/share` production editor、`/share-card-lab` 404 删除态、Profile share section、Activity Detail `生成分享` CTA；metrics 记录 `horizontalOverflow=false` 与 key text probes。
- **准入**: lint 0e/6w · node test 26p · build PASS · git diff --check clean · FU-45 为唯一剩余 `test.fixme`；强关联 e2e subset 中 FU-53 touched coverage 通过，但整体子集暴露 7 个非 FU-53 fail。
- **已紧接 register FU-56 跟踪 7 fail 修复**: FU-56 作为 FU-53 close 紧接 next sprint 启动, 利用 FU-53 sprint 现场调研上下文直接修复. 不积累 baseline rot, 跟 FU-46 BUG #1 in-sprint patch 范式同 (但 7 cases 集中处理)。
- **deviation 透明披露**: 初始 scope 只点名 `SharePosterButton` + `share-card-lab`; audit 额外发现 debug / onboarding QA links、onboarding suppression、5 个 active legacy e2e blocks、ModalShell share-sheet layout 与 CSS 均为同源死代码并同步清理。`ProfileCommunitySections.tsx` 已在更早 patch 删除, 本 sprint 无 action。
- **关闭 commit**: `bec80d4`
- **merge commit**: `4363376`
- **关闭时间**: 2026-05-27

---

### FU-43 ✅ archive 卡片 hero 状态标签可读性增强

- 关闭原因: archive 山行卡片 hero 上 chip (已登顶/未登顶 + 已留证/未留证) 在亮色 hero 照片上文字看不清的问题修复; 改 TripMedia 顶部 scrim 渐变 (旧单层 36%→transparent→88% 改双层 78%→58%→18%→transparent + transparent→88%) + 新增 ArchiveMediaChipShell glass wrapper (backdrop-filter blur(10px) saturate(1.08) + 半透明深色背景 + border + textShadow + boxShadow 多重兜底); 加 3 个 testid (archive-trip-media / archive-trip-chip-summit / archive-trip-chip-proof) 便于后续 spec coverage
- **风险策略实战**: FU-43 是 codex-risk-behavior-policy 固化后第 2 个 sprint, Codex 全程严格执行 B1/B2 (Phase 3 STOP 等 user 验收, 因 context budget 风险主动 2 次 STOP), B4/B6/B12 (5 个验收场景 BEFORE/AFTER + 2 cross-check 截图 + chip bounding boxes metrics), B7 (audit.md 实时), B13 (临时 QA 数据使用 + visual-seed.json + cleanup 主动 disclose)
- 改动范围: 仅 src/app/(flow)/archive/ArchiveClient.tsx (1 文件 +40/-5); 不改全局 Chip 组件; 不引入新 design token (复用现有 color-mix + CSS variables)
- 准入: lint 0e/8w · build PASS · node test 19p · playwright app.spec 22p · git diff --check clean · 5+2 用户视觉验收点全过
- 关闭 commit: `e8fce12` · merge commit: `3b74bce`
- 关闭时间: 2026-05-27

---

### FU-54 ✅ License Progress 重设计 + License Gate 解耦

- **关闭原因**: Profile 独立执照进度 section 删除，Profile head 执照 badge 改为可点击入口并打开底部抽屉；升级算法从海拔 tier 改为 difficulty-based GPS 有效记录；Explore / Mountain Detail / Trek 的 license hard gate 拆除，改为 advisory-only；`debug-access.spec.ts` 与 `app.spec.ts` 中 FU-54 retained fixme 解除。
- **算法口径**: 保留 repo 现有 difficulty 模型 `beginner / intermediate / advanced / expert`；`none → basic` = 3 座 beginner+ GPS 有效记录，`basic → intermediate` = 3 座 intermediate+，`intermediate → advanced` = 3 座 advanced+（expert 计入 advanced+）；sync 只向上更新 `profiles.license_level`，不降级。
- **UI 落地**: 新增 `LicenseProgressSheet` / `DifficultyChip` / `DifficultyAdvisory`；删除 `ProfileLicenseProgressSection.tsx` 与 `LockModal.tsx`；`/profile?licenseSheet=1` 可直接打开执照进度抽屉；advisory CTA “继续”始终为主操作，不阻止记录。
- **文档同步**: `docs/target-prd.md` §7.1、`docs/ui-interaction-spec.md` §10.6、`src/lib/faq-content.ts` `license-upgrade` 均改为 advisory-not-gate 口径。
- **验证**: lint 0 errors / 9 existing warnings；node test 250 passed；build PASS；FU-54 strong-coupling e2e subset 38 passed；375px visual evidence saved at `/tmp/fu54-review/` with `hasHorizontalOverflow=false` for captured scenes。
- **已知旁路**: 额外 community cross-check 中 `community feed shows altitude-first...` card body click 仍停留在 `/community`；该路径不属于 FU-54 touched surface，未纳入本 FU 修复，作为后续候选排查项记录。
- **关闭 commit**: `6dfdf2c` / `d5c320f` / `948493b` / `6bf3805` / `4a6750d` / `14bd963`
- **merge commit**: `f1c5c08`
- **关闭时间**: 2026-05-27

---

### FU-49 ✅ (main)/explore/[id] mountain detail + 孤儿组件 obsolete cleanup

- **关闭原因**: legacy `/explore/[id]` 路由 + MountainCard / MountainFeatureCard / WaypointsSection / PixelMountainBg / TopoFrame / 旧 AltitudeBar / MapPlaceholder 等孤儿组件全部清理; 真实生产路由 `/mountain/[id]` 保留; mountain-waypoints-display + mountain-featured-posts 2 spec URL 切到 `/mountain/${id}` + 断言重写为 timeline UI / 精选攻略口径。
- **风险策略实战**: FU-49 是 codex-risk-behavior-policy 固化后第一个 sprint, Codex 严格执行 B1/B2 (Phase 4 STOP 等 user 验收), B4/B6/B12 (issue-level 浏览器截图证据), B7 (audit.md ledger 实时维护), B13 (5+ deviation 全部透明披露), 与 FU-54 close 跳过 STOP 直接 V3 的违规形成对比。
- **额外 deviation 透明披露 (audit.md + final-acceptance.md C 段)**: MountainCardLarge 不存在 / MountainFeatureCard 孤儿一并删除 / WaypointsSection 孤儿删除 (293 行) / 4 个额外孤儿组件 cleanup / CSS exclusive selectors 删除但保留 `.mountain-card` `.mountain-featured-posts*` / waypoints spec 断言改 timeline UI / featured posts spec 改精选攻略+href。
- **关闭 commit**: `bcab285` / `087d4d5`
- **merge commit**: `392c7b6`
- **关闭时间**: 2026-05-27

---

### FU-46 ✅ e2e baseline rot 系统性清理 (umbrella · sub-sprint 1+2+3+4 + close sprint 全闭环)

- **关闭原因**: 38 quarantine cases 处理完毕 (FIX 18 / REWRITE 12 / OBSOLETE 5 / BUG-OUT-OF-SCOPE 3)；4 个 in-sprint BUG fix (查看路线 fallback / community card activation / protected trek returnTo / avatar upload RLS)；最终全量 e2e --retries=1 跑通 0 failure / 3 fixme retained (FU-45 1 + FU-54 license progress 2)。
- **sub-sprint 1-4 历史进度**: 已修 18 + FU-44 obsolete cleanup 5 (v0.25-v0.30 records)。
- **close sprint v0.31**: 处理剩余 38 quarantine + 4 BUG fix + 协议正式撤销。
- **协议变更**: v0.15 引入的 V3 preflight 全量 e2e gate 在本 FU close 时**正式撤销 (revoked)** (详见 v0.31 entry)。
- **BUG #4 production migration 已应用 (2026-05-26)**: Vercel 部署完成后通过 Supabase MCP `apply_migration` 应用并验证 10 个 user-editable 字段 UPDATE grants 添加 / is_admin 受保护 / RLS owner-scoped 不变 (详见 v0.31 entry); Tooling deviation: remote version timestamp 为 apply 运行时生成, 与 repo 文件名 timestamp 不一致, name + SQL body 一致, cosmetic only。
- **关闭 commit**: `fa21cc8` / `ed4904f` / `4de953f` / `4fb55e1` / `1975915` / `84984fe` / `29a5c2b`
- **merge commit**: `c3a25c5`
- **关闭时间**: 2026-05-26

---

### FU-42 ✅ checkins status tristate 完全移除 (选 C · sub-sprint 1+2+3+4 全闭环)

- **关闭原因**: 选 C 完全移除 `status` 三态字段；项目业务模型不再存在 checkins 审核状态语义。sub-sprint 1+2+3+4 已完成前端 UI、应用层、dead code、admin review surface、types/tests、DB migration 编码全链路收口。
- **sub-sprint 1**: 业务字段澄清 + audit + 选 C 拍板；拆 Profile review queue section 与 Activity Detail 手记 status gate。
- **sub-sprint 2**: backfill 历史 status 数据 + UI gate 拆除 + `isSummit` / Profile / Archive 口径切到 `verified_at` / `completionStatus`，并 folding FU-30。
- **sub-sprint 3**: 应用层死代码清理（`review-queue.ts` + 孤儿组件 + Trek dead query + `ReviewQueueRecord` type + CSS）与 share card poster guard 拆除。
- **sub-sprint 4**: 应用层 `checkins.status` 引用全清 + `admin/checkins` 路由/API 删除 + `isSummit` / 山行 count / community gating 切到 `verified_at` + DB migration 编码（`DROP COLUMN` + RLS 简化 + RPC 重写）。
- **生产 schema 已应用 (2026-05-22)**: Vercel 部署完成后通过 Supabase MCP `apply_migration` 应用并验证 column gone / RLS simplified / RPC rewritten / index dropped / constraint dropped (详见 v0.30 entry); Tooling deviation: remote `schema_migrations` version timestamp 为 apply 运行时生成 (`20260522104503`), 与 repo 文件名 timestamp prefix (`20260522045459`) 不一致, name + SQL body 一致, cosmetic only。
- **关闭 commit**: `29f8f51` / `7ea0ff4`
- **merge commit**: `15bd36c`
- **关闭时间**: 2026-05-22

---

### FU-30 ✅ 档案页 / Profile 页 "山行"字段语义统一

- **关闭原因**: FU-42 sub-sprint 2 folding 实施：Profile head 统计改为 `completionStatus === 'complete'` only（不再 filter status）；Archive 显示所有 own trips（含 incomplete + 任意 status）；Activity Detail BackToRecords 显示所有 own checkin（与 Archive 总数一致）；`docs/ui-interaction-spec.md` 已同步语义文档。
- **关闭 commit**: `fa084e5`
- **关闭时间**: 2026-05-22

---

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

### FU-47(b) ✅ Mountain Detail + Activity Detail 接入 mountain-bbox PMTiles

- **关闭原因**: FU-47(b) 子 sprint 落地 Mountain Detail + Activity Detail 实际接入 mountain-bbox PMTiles 真实地图。Phase 3-6 + 三轮 in-sprint patch (v1: §15.5 baseline 对齐 / v2: 自定义按钮 + z=7 fallback 删除 / v3: 文案精简 `仅可预览轨迹`) 后 user 视觉验收 PASS。
- **关键设计决策**:
  · brief §15.5 客户端实施 baseline 新建 (v0.3.3): 沉淀 FU-47(a) 锁定的 30km bbox × z=9-12 × dark × 1:1 + 9 步 init/lock + 5 手势 enable + NavigationControl + GeoJSON 业务层 + SSR-safe searchParams + imperative handle + 24 layer allowlist 等 11 子节规范。
  · Mountain Detail RouteReferenceSection 4 状态矩阵解耦 PMTiles ⊥ waypoints: (a) PMTiles + waypoints≥2: 真实底图 + GeoJSON 路径 + waypoint strip; (b) PMTiles + waypoints<2: 真实底图 + summit pin (华山 production 主 demo); (c) 无 PMTiles + waypoints≥2: 文字 fallback; (d) 无 PMTiles + waypoints<2: unavailable 空卡。Mountain Detail 不走 z=7 兜底。
  · Activity Detail ActivityRouteMap mode: mountain-bbox PMTiles 存在/成功 → MapLibre + GeoJSON trace + markers; 缺/失败 → trace-only (无底图 + SVG fit-bounds trace + 3-stat strip + `仅可预览轨迹` 文案, 视觉等同 share poster)。z=7 全国主包不作为 Activity Detail 产品 fallback (v0.3.4 user 二次验收明示, 视觉比例失真)。
  · ActivityDetailViewModel 扩展 trackPoints (lat/lng/altitude/time) 暴露完整 GPS 坐标给 client。
  · per-mountain PMTiles 当前仅华山 baseline 一座 (production 锁定), 5 demo 山方案因 user "现有库存" 决策选 1 座; 全量生成 + pipeline 自动化留给 FU-47(c) 或独立 sprint。
  · SSR-safe query params: `fu47bRouteMock` / `fu47bMapError` / `fu47bActivityMapError` 在 server page 通过 searchParams 提前读 + `NODE_ENV !== 'production'` gate, 避免 hydration mismatch。
  · Activity auth-gap 处理: 不种新 DB row, 用 Supabase admin generateLink + verifyOtp 给 Codex 在 dev screenshot context 模拟登录 user 账号 (已有 activity `3e4927bd`)。0 production DB mutation。
- **brief 同步**:
  · v0.3.3: 新增 §15.5 客户端实施 baseline。
  · v0.3.4: §15.5.3 NavigationControl 唯一承担 zoom UI / §15.5.4 缺 mountain-bbox 时 trace-only / §15.4.7 上线 checklist 同步。
  · v0.3.5: §15.5.4 trace-only 文案精简 `仅可预览轨迹`。
- **B13 透明披露**:
  · v1 实施偏离 FU-47(a) baseline (7/8 项), patch v1 完整修复。
  · Activity `3e4927bd` 显示 297km 长轨迹超出 mountain-bbox envelope, 属 Known Issue · checkin 0/60 数据写入路径异常下游表现, 不本 sprint 处理。未来独立 FU 加 trackPoint envelope 检测 + auto-fallback trace-only。
  · 24 layer allowlist 限制部分地形细节 (§15.5.5 锁定), 未来扩 allowlist 需独立 visual review sprint。
- **风险落地**: codex-risk-behavior-policy 连续 5 个 sprint 0 红线违反 (FU-49 / FU-43 / FU-53 / FU-56 / FU-47(b))。
- **关闭 commit**: `96f3c5c` / `59a7161` / `a382e03` / `fc4c038`
- **merge commit**: `200dee4`
- **关闭时间**: 2026-05-28

---

### FU-47(c) ✅ Trek 轻量参考地图接入 mountain-bbox PMTiles

- **关闭原因**: FU-47(c) 子 sprint 落地 Trek prep + live mode 接入 mountain-bbox PMTiles 真实底图 + GeoJSON 业务层 + trace-only fallback。Phase 3-6 + 1 轮 in-sprint patch (v1: current dot 加 `当前位置` attached label) 后 user 视觉验收 PASS。
- **关键设计决策**:
  · 抽出 `src/components/map/TrekReferenceMap.tsx` 独立组件 (844 行, 含 patch v1 `当前位置` label), 不在 `TrekClient.tsx` 内膨胀 (TrekClient 大幅瘦身 -383 行)。
  · 复用 FU-47(b) 沉淀的 `PmtilesSnapshotMap` 共享组件, 严格按 brief §15.5 11 子节 baseline (不偏离 9 步 init/lock / 5 手势 enable / NavigationControl / GeoJSON 业务层 / 24 layer allowlist / SSR-safe searchParams / imperative handle / 等)。
  · GeoJSON 业务层: summit pin + walked trace (live mode 累积) + current GPS dot + accuracy ring + 起点 marker + `当前位置` 文字 label (与 summit pin `顶峰 2154m` 视觉对称)。
  · Trace-only fallback (与 Activity §15.5.4 同范式): 缺 mountain-bbox PMTiles 或 mountain-bbox 运行时失败 → 深色 surface + SVG fit-bounds trace overlay + summit glyph + current dot, 不走 z=7 全国主包。
  · SSR-safe QA harness: `fu47cMapError` / `fu47cGpsMock=ready|weak|live|offline` 在 server searchParams 提前读 + `NODE_ENV !== 'production'` gate, 0 production DB / Storage 写入。
  · brief §15.5 不动: Trek current dot / accuracy ring / `当前位置` label 属于 §15.5.4 GeoJSON 业务层在 Trek 场景的具体实现, 不升级到跨 surface baseline (Plan v2 立场)。
- **B13 透明披露**:
  · 截图 harness 用 existing-user magic-link session cookie, 0 DB / Storage / Trek session 写入。
  · `trek-exit-auto-pause.spec.ts` 撞到 historical threshold drift (11s → 60s server rule), 仅做 test-only sync, 不动 Trek API / 持久化。
  · live mode mock 数据中段不连续是 visual evidence harness 限制, 生产环境 `watchPosition()` 不受影响, 不本 sprint 修复。
  · MapLibre paint colors 沿用 FU-47(b) 直接 canvas color, 无新 design token system。
- **风险落地**: codex-risk-behavior-policy 连续 6 个 sprint 0 红线违反 (FU-49 / FU-43 / FU-53 / FU-56 / FU-47(b) / FU-47(c))。
- **关闭 commit**: `cf5cee4` / `0d5614f` / `758265c`
- **merge commit**: `23b5ce4`
- **关闭时间**: 2026-05-28

---

### FU-47 ✅ 地图组件实施 (MapLibre + PMTiles 自托管)

- **关闭原因**: FU-47 全 3 个子 sprint (a / b / c) 完成。P0 地图能力 production ready。详见各 sub-sprint Closed entry:
  · FU-47(a) MapLibre + PMTiles mountain-bbox 底图基建。
  · FU-47(b) Mountain Detail + Activity Detail 接入 mountain-bbox PMTiles。
  · FU-47(c) Trek 轻量参考地图接入 mountain-bbox PMTiles。
- **总体落地**:
  · 共享 `src/components/map/PmtilesSnapshotMap.tsx` + `TrekReferenceMap.tsx` 按 brief §15.5 11 子节 baseline。
  · per-mountain PMTiles 当前 production 仅华山一座, 全量生成 + pipeline 自动化在 brief §15.4 设计文档, 上线前由 FU-51 checklist 执行。
  · Mountain Detail 4 状态矩阵 (PMTiles ⊥ waypoints 解耦) + Activity Detail trace-only fallback (不走 z=7) + Trek prep/live mode + GPS 实时 marker + walked trace 累积渲染。
  · brief v0.3.3 → v0.3.5 累积沉淀 §15.5 客户端实施 baseline。
- **遗留 / 后续**:
  · Activity trackPoint 超 mountain-bbox envelope 检测 + auto-fallback trace-only (独立 FU, B13 已披露)。
  · waypoints 表 schema 加 lat/lng (独立 FU, 影响 Mountain Detail state (a) PMTiles + waypoints≥2 真实数据触发)。
  · 24 layer allowlist 扩 contour 等高线 (独立 visual review sprint)。
  · per-mountain PMTiles 全量生成 + 上传 pipeline (FU-51 上线 checklist)。
- **风险落地**: 连续 3 个子 sprint (a / b / c) 0 红线违反, 累积 brief 规范沉淀, 为 FU-51 上线门禁奠基。
- **关闭 commit**: sub-sprint entries: FU-47(a) / FU-47(b) / FU-47(c)
- **merge commit**: `23b5ce4`
- **关闭时间**: 2026-05-28

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

### v0.74（2026-06-15）

FU-100 closeout · 截图路线展示标准化（route-only bbox fit）上线；登记 FU-101 校准初始对焦留项。

- FU-100 从 Active 移入 Closed：PR #15 / merge `ee092bb` 完成截图路线 route-only bbox fit，Activity 卡固定 `343x343` / 1:1 frame，新增 `activityScreenshotCard` 轻量 profile（线 `3.4` / 起点 `r=6` / 终点 `r=7.5`），移除卡内重复「截图校准路线」角标；不迁移持久化数据，不动 GPS / 全屏校准编辑器 / 校准内联 preview。
- 新增 Active FU-101：全屏校准编辑器长图初始对焦（`routeCenter`），明确 FU-100 只解决展示面 route-only 标准化，不宣称校准体验已解决。
- 生产部署：Vercel deployment `dpl_FYsaiAvH6GDTBeY1TTtPrxUeVL8i` READY，built commit `ee092bb4a42275bff591fd1ef0873312bc357648`，deployment URL `https://peak-trekker-5katejten-andymorrison91060122-8673s-projects.vercel.app`。
- `docs/map-weather-brief.md` 只读 cross-check：FU-100 是 screenshot-route SVG card / share route rendering 标准化，不改变地图 / 天气边界，无需更新。
- Active 23 → 23 · Closed 79 → 80 · Deferred 1 → 1

### v0.73（2026-06-15）

FU-94 closeout · 截图识别额度墙诚实化 + de-dup 上线；FU-100 registration 已保留。

- FU-94 从 Active 移入 Closed：PR #14 / merge `be6db01` 完成 honest quota copy、单一「已用完」sheet 承载、删除 `window.alert`、CTA「我想要更多额度」、inline feedback「已记录，我们会根据使用需求逐步开放更多额度。」2.5s auto-close、server `upgradeHint` 删除；quota 机制与 telemetry 事件名不变。
- 生产部署：Vercel deployment `dpl_2t2pLvVqD8i1nqFJTffpN4YdsYSx` READY，built commit `be6db01fae07ca7e9e6630bb2fed215a2c770449`，production URL `https://peak-trekker.vercel.app`。
- 部署后 read-only sanity：`/screenshot` production build 可渲染；mocked exhausted quota 下新 CTA 可见、旧「了解付费方案」为 0、inline feedback 可见、无 alert、console errors 0。
- `docs/map-weather-brief.md` 只读 cross-check：FU-94 是 screenshot quota copy / de-dup，不改变地图 / 天气边界，无需更新。
- Active 24 → 23 · Closed 78 → 79 · Deferred 1 → 1

### v0.72（2026-06-15）

FU-93 closeout · 离线轨迹 outbox + 原子 append RPC 上线并完成 real-device / DB 验收；登记 FU-99 measured-field gap。

- FU-93 从 Active 移入 Closed：PR #13 / merge `ce02928` 完成 IndexedDB outbox、ack-based drain、pending finish intent、offline finalize leak 2 轮客户端修复；生产 migration `20260614120000_append_trek_points_rpc` 已 gated apply，RPC 使用 `auth.uid()` ownership + `FOR UPDATE` + per-point reject + 30k cap。
- 验收证据：STOP#2 real-device acceptance PASS；生产 DB 只读核验 session `50401e67` exactly one summit checkin、session `fab1b069` exactly one incomplete checkin，近 3 小时华山测试集无 session 多 checkin；测试数据暂留待单独 exact-id cleanup。
- 新增 Active FU-99：auto-summit `verify_and_record_checkin` measured-field gap。checkin `492617f7` measured columns NULL vs linked session `50401e67` distance_m=1488，判定为 pre-existing 非 FU-93 regression。
- Docs-only register Active FU-100：截图路线展示标准化（route-only bbox fit）登记，V1 待 FU-94 收口后由 Claude 一手深查产出；不启动实现。
- `docs/map-weather-brief.md` 只读 cross-check：FU-93 是 Trek recording reliability，不改变地图 / 天气边界，无需更新。
- Active 23 → 23 · Closed 77 → 78 · Deferred 1 → 1

### v0.71（2026-06-14）

FU-89 收口 · FAQ 暴露功能债完成上线前归类，登记 FU-93..98。

- FU-89 从 Active 移入 Closed：FAQ 功能债调研归类完成，产出上线前债务收口清单；23 条 FAQ 已全审 + 全仓 grep；多数 FAQ 承诺能力已由 FU-82 诚实化成果对齐真实现状，FU-90 已了结昵称编辑。
- 新增 Active FU-93..98：离线轨迹持久化与重传、截图识别额度墙文案 + 需求埋点、上线前死入口 / 假成功清理、wakelock 记录可靠性增强、反馈通道、省份编辑。
- NEW-B 不单独开 FU：分享高级模板水印付费墙被 `ENABLE_PREMIUM_TEMPLATE_PAYWALL=false` 挡住，生产不可达；保持 flag 关闭，不打开、不实现。
- Active 18 → 23 · Closed 76 → 77 · Deferred 1 → 1

### v0.70（2026-06-14）

FU-90 整体关闭 · 昵称链路修复 + Profile 昵称编辑 UI 上线；登记 FU-92 onboarding 持久化跟进。

- FU-90 从 Active 移入 Closed：2A PR #11 / merge `f727e22` 完成注册 metadata → trigger 持久化、username 去唯一与四条生产 smoke；2B PR #12 / merge `327dd0a` 完成 Profile 昵称编辑 bottom sheet、`POST /api/profile/nickname`、成功态与 FAQ 文案回改。
- 2B 证据：用户视觉验收 PASS；`npm run test:profile-nickname` 20/20；focused e2e `tests/e2e/profile-nickname-edit.spec.ts` 1 passed；lint/build/diff-check 通过；DATA RESIDUE 为 0。设计源只保留在 `output/fu90-nickname-edit-acceptance/`，不提交。
- 新增 Active FU-92：`onboarding_version` 跨设备重复展示修复。该问题由 FU-90 复核暴露，非 2A/2B 回归。
- Active 18 → 18 · Closed 75 → 76 · Deferred 1 → 1

### v0.69（2026-06-14）

FU-64 drift 对账关闭 · migration-history 本地↔远端 25/25 matched，登记 FU-91 baseline follow-up。

- FU-64 从 Active 移入 Closed：2A PR #10 / merge `879b759` 完成 11 个 migration 文件名对齐远端版本 + 从远端 statements 重建 create_a1 `20260513042900`；2B 对 10 条早期 LOCAL_ONLY 逐条 `migration repair --status applied`，remote ledger `15 → 25`。
- FU-64 migration-history drift 对账已完成（2026-06-14，本地↔远端 25/25 matched，drift=0）。原「FU-64 drift 导致的 db push 禁令」解除。注意：这不等于生产可随意 db push——任何生产 schema / DB 变更仍需单独走 migration + 发布审批。
- 新增 Active FU-91：Supabase schema baseline / fresh-apply 能力恢复，跟进核心表缺少 in-repo baseline 导致 fresh-apply-from-zero 失败的既有限制。
- Active 18 → 18 · Closed 74 → 75 · Deferred 1 → 1

### v0.68（2026-06-13）

FU-90 登记昵称链路 bug + Profile 昵称编辑；仅 docs，不实现功能。

- 新增 Active FU-90：昵称链路修复 + Profile 昵称编辑，来源为 FU-82 FAQ 对账暴露的 account.edit-profile 债。
- FU-82 Closed 条目补全关闭 commit：`c8bfa2f`（feature）/ `64a452f`（merge）。
- Active 17 → 18 · Closed 74 → 74 · Deferred 1 → 1

### v0.67（2026-06-13）

FU-82 收尾关闭 · FAQ 诚实化进入 Closed，保留 FU-89 跟进未接通功能债。

- FU-82 从 Active 移入 Closed：13 条回答改写、2 条不存在能力条目删除、FAQ 卡片「查看完整说明」死入口删除。
- 反馈通道建设转 FU-89；本轮不公开邮箱、不实现反馈功能。
- Active 18 → 17 · Closed 73 → 74 · Deferred 1 → 1

### v0.66（2026-06-13）

FU-82 FAQ 诚实化 · FAQ 文案对齐当前可用能力，登记 FU-89 功能债，不提交功能实现。

- `src/lib/faq-content.ts` 完成 13 条回答改写、2 条不存在能力条目删除（`record.unattributed` / `review.review-failed`），保留 `id` / `anchor` / `q` / `long` 结构不变。
- 反馈通道仍为占位，不公开邮箱；FAQ 明确「问题反馈 / 设置」入口接通后才可在 App 内反馈。
- 新增 Active FU-89：FAQ 暴露的未接通功能债梳理。来源为 FU-82 FAQ 对账暴露，本项只做调研 / 拆分 / 排期，不代表对应功能已开放或即将开放。
- Active 17 → 18 · Closed 73 → 73 · Deferred 1 → 1

### v0.65（2026-06-13）

Known Issue 0/60 root-cause closeout · 纯 docs 更新，根因调查结论入库，Known Issue 不计入 Active / Closed / Deferred。

- 重写 `Known Issue · checkin 数据字段写入路径异常`：状态改为「根因已查明 (2026-06-13)，修复待排期」，并将关键结论表直接写入正文；证据指针为本地未提交 `output/known-issue-0-60-investigation/report.md`。
- 修正原始误记：FU-11 原记录中的 `7707122f-bebe-4b04-b904-1ad4397b706a = 0/0/0/60 + linked session 真实 8300m / 1465m / 3h`，经截至 2026-06-13 只读核验判定为记录时印象误记；生产库严格签名为 0 条，该 activity 实为 0-session 弱 incomplete。
- 拆分三个独立子问题：RPC 测量字段缺口、`finish_incomplete` 0 兜底、`mountains.checkin_count` 漂移；每项记录 owner path、截至 2026-06-13 只读核验规模、是否仍在发生、影响面与修复约束。
- 明确修复优先级：排在 FU-78 / FU-79 之后；存量 backfill 与未来 RPC / DB function 修复分开决策。FU-64 已完成，drift 禁令解除；未来 RPC / DB function 修复走正常 migration + 发布审批。
- Active 17 → 17 · Closed 73 → 73 · Deferred 1 → 1（Known Issue 不计入）

### v0.64（2026-06-13）

FU-83 (d)+(a) render pair closeout · 等比投影器与 envelope fallback shipped, FU-83 保持 Active。

- PR #9 merge commit: `d20a5df`；完成 (d) GPS trace fallback aspect-ratio distortion：shared WGS-84 aspect-correct projector（`src/lib/geo-trace-projector.ts`）现在服务 Activity trace-only / Trek reference fallback / Community detail preview，使用 `cos(midLat)` + single range + centered letterbox，避免独立 lng/lat stretch-to-fill。
- 完成 (a) Activity mountain-bbox envelope auto-fallback：策略 = bbox 每轴扩 8%，raw valid points 中 >1% 超出扩展 bbox 才降级；`data-map-mode` 携带 fallback reason；edge-hugging / <=1% synthetic far spike 不误降级。
- 删除 dead `CommunityRouteVisualization.tsx`；`tests/fixtures/gpx/fu83-portrait-49609d3c.gpx` 固定 portrait ratio；before-state renders 可从 pre-merge main git history 复现。
- DATA RESIDUE: evidence run leftover `bf333b44-9931-4971-97e8-ada79af158a5` 已按用户授权五项验证后精确删除；计数 total `966 → 965`，`screenshot_recognition 1 → 0`，other-source `965 → 965`。
- FU-83 剩余 (b) waypoints lat/lng 与 (c) contour layers 保持 Active。
- Production deployment `dpl_9Yg6sD6XmCzHVvcuaqgnyfLjMFbB` READY；public `/` → `/explore` health 200，public `/screenshot` health 200。
- `docs/map-weather-brief.md` 已随 PR #9 c2 更新至 v0.3.7，cross-check 与 shipped behavior 一致。
- Active 17 → 17 · Closed 73 → 73

### v0.63（2026-06-13）

FU-68A/R6 closeout · poster/share alignment shipped, FU-68 保持 Active。

- PR #8 merge commit: `8d7a798`；Half-A 已完成：`/api/poster` measured-only altitude + `最高海拔` label、honest metrics、source semantics、raw coordinates removed；R6 Profile archive「分享素材」入口改为 `/share` editor；统一 share source mapping，修正 pre-existing `historical_photo` GPS mislabel。
- Half-B 仍 Active：summit-verified ceremonial altitude slot 设计先行，Claude Design 出坑位 / 标签形态后再实施。
- FU-68 exposure audit 更新为 current-main 口径：owner-or-public-post gate 预先存在；本 sprint 移除 coordinates；剩余 exposure = public-post rows 对持 id 访问者渲染 username / mountain / province / note，public cache 86400s，是否收紧另行决策。
- `/share` neutral `UPLOADED` for `historical_photo` 记为 anti-mislabel interim semantic；最终 PHOTO RECORD-style share treatment 归 FU-68B。`/api/poster` 本轮刻意保留 `historical_photo` 的 PHOTO RECORD 语义。
- `/api/poster` deprecation follow-up 扩充：R6 后其唯一生产消费面是 community cover fallback；登记 pre-existing production bug：Vercel PNG rasterization 缺 CJK font fallback，community fallback covers 生产中文会变 tofu（SVG 正确，`/api/share/render` 不受影响）。
- FU-83 扩容 GPS trace fallback aspect-ratio distortion 项：ActivityRouteMap `normalizeVisualTrace` 独立 lng/lat 归一化导致 portrait GPX 在 landscape card 压扁；后续用 uniform content-fit + `cos(lat)` + padding 方案修，同时 audit `TrekReferenceMap`。
- Production deployment `dpl_HhafQZknnJWAyfTXzDgXgqZxBNbn` READY；public `/` → `/explore` health 200，public `/screenshot` health 200。
- `docs/map-weather-brief.md` 已只读复核：本 sprint 不改地图 / 天气行为，无需更新。
- Active 17 → 17 · Closed 73 → 73

### v0.62（2026-06-12）

FU-79 第一项省域查询止损完成。

- `PROVINCE_RANKING=false` 时 `/explore` 省域月榜查询 2 → 0、`/profile` 用户省域贡献查询 1 → 0；flag-on 原调用路径由静态测试冻结。
- FU-79 保持 Active，剩余 RSC waterfall / bundle / images / render-blocking 审计继续按「先测量后改」推进。
- `docs/map-weather-brief.md` 已核对，本 sprint 无地图 / 天气行为变更。

### v0.61（2026-06-12）

FOLLOW-UPS GRAND RECONCILIATION · 全景对账 docs patch。

- 新增 Active FU-75..87：品牌视觉统一体系、动效系统 + 人文化文案、300 山峰物料 pipeline、中国大陆访问与基础设施评估、全站性能审计、线上稳定性与错误边界、上线技术收口门禁、FAQ 与现状功能对账、地图遗留债、校准编辑器工程债、分享 / 模板门面改造、首页样式探索、档案馆化 + 记忆锚点。
- 新增 Deferred FU-88：商业化专项。2026-06-12 用户拍板第一期上线不收费，商业化专项留到下一大版本，不占本期 Active。
- FU-36 重写为「轨迹自动初稿接入校准编辑器」：手动校准 + `screenshot_route_shape` + 品牌绿矢量重绘已上线，剩余缺口收敛为 automatic draft / reference ghost / confirm-first 的忠实初稿能力。
- 关闭 FU-16 / FU-35 / FU-69 / FU-70：FU-16 并入 FU-77；FU-35 文字半边已由 FU-62 上线、轨迹半边并入 FU-36；FU-69 用户拍板不做；FU-70 并入 FU-76 文案审查。
- FU-68 更新为「必做对齐 + 设计先行」两半结构：`/api/poster` 照片补签 card 口径需与 measured-only 决策对齐，summit-verified ceremonial slot 设计先行。
- FU-51 增加互引：per-mountain PMTiles pipeline 归属 FU-77(c)，解除 FU-47 close 时对 FU-51 的委托。
- 新增「2026-06-12 业务方向修订」小节：省域排名本期冻结、FU-69 DEM 不做、第一期商业化不收费、执照区荣誉感终验销项、微信真机分享终验归 FU-81。
- 协作规范 schema sprint 条目追加 FU-64 暂停批注；`docs/target-prd.md` 与 `docs/release-priority-matrix.md` 增加省域排名冻结的最小标注。
- Active 8 → 17 · Closed 69 → 73 · FU-88 deferred 单列不计入 Active。
- 计数修正: Closed 头部数字与 grep 实际条目数对齐（历史 off-by-one, 源于 FU-47 家族父 + 子条目计数），自检规则以 grep 为准。

### v0.60（2026-06-12）

FU-71/72/73 close · render-debt refactor trio shipped.

- FU-71 关闭: PR #6 `4dc3ef7` 将 persist-time 与 render-time Douglas-Peucker 简化合并到共享 `polyline-simplify` core；semantic freeze 保留 render near-degenerate baseline guard 与 storage exact-zero fallback。
- FU-72 关闭: PR #6 `df8d4bb` 抽出 `SHARE_TRACK_RENDER_PROFILES` named-field profiles，四个 surface 使用字段化 style profile，值由 unit test pin 住。
- FU-73 关闭: PR #6 `0cbedc3` 新增 `SCREENSHOT_RECOGNITION_SOURCE` 与 `isScreenshotRecognitionSource`，`src` 裸 `=== 'screenshot_recognition'` 布尔比较归零并有 scan test。
- 零行为变更证据: `output/fu71-73-render-debt-acceptance/` 中四个 render fixtures before/after SVG/JSON diff 均 0 bytes；focused node matrix 76/76 PASS；build PASS；`git diff --check` clean。
- PR #6 merge commit: `325e046`; Production deployment READY; public `/` → `/explore` health 200, public `/screenshot` health 200。
- docs/map-weather-brief.md 已只读复核: 本 sprint 不改地图 / 天气行为，无需更新。
- 本 release DB mutation: 0；无 schema / DB / copy / product flow change。
- Active 11 → 8 · Closed 65 → 68

### v0.59（2026-06-11）

FU-74 close · calibration editor zoom-invariant points shipped.

- FU-74 关闭: PR #5 `13d192a` 将校准编辑器 visible markers 与 route line stroke 按 zoom 反向缩放；marker 在 1x-3x 稳定为 `17.25px`，route line 在 1x-3x 稳定为 `4.09px`。
- 命中区改为独立透明 hit circle，并用真实 css-px ↔ viewBox 换算保持 `44px` screen target；visible marker `pointer-events: none`。
- focused A1 spec 覆盖 marker size、hit-target size、3x tap/drag accuracy、route-line width、persisted-shape no-drift；无 geometry / persistence / share/poster change。
- PR #5 merge commit: `3704afe`; Production deployment READY; public `/screenshot` health 200。
- 本 release DB mutation: 仅执行用户已授权 residue cleanup，删除 1 条 `source='screenshot_recognition'` 测试残留；post-delete `screenshot_recognition` count = 0，其他 checkins count 保持 965。
- Active 12 → 11 · Closed 64 → 65

### v0.58（2026-06-11）

FU-65 close · unmatched title chain shipped across activity / lists / share.

- FU-65 关闭: PR #4 `95d6864` + `6c75773` 将 title chain `mountain.name → displayable track_name → fallback` 扩展到 Activity Detail、Archive list、Profile trips、Share editor、server poster、transparent watermark；列表 unmatched rows 使用 neutral `未关联` tag；Share/render title server-owned，并拒绝 client title / track_name override。
- FU-67 rule follow-through: 同 PR 修 Archive header `最高 m` 与 trip card elevation 对 absent measured elevation 渲染 `--`，不再显示 fabricated `0 m`。
- FU-68 追加 audit note: 后续同一 sprint 需 audit `/api/poster` 对 screenshot rows 的 exposure（community covers 可能走 honor-card system: title fallback + catalog-altitude semantics）。
- 新增 FU-74: Calibration editor zoom-invariant control points；scope 限 `ScreenshotRouteCalibrationSection` rendering + focused A1 spec zoom-size assertion。
- PR #4 merge commit: `7389c72`; Production deployment READY; public `/screenshot` health 200。
- 本 release DB mutation: 0；无 schema / write-path change。
- Active 12 → 12 · Closed 63 → 64

### v0.57（2026-06-11）

FU-63/67 close + FU-64 re-scope。

- FU-63 关闭: PR #3 `1472cf7` 停止追踪六个 Python bytecode cache 文件, `.gitignore` 新增 `__pycache__/` 与 `*.pyc`; 本地 `.pyc` 文件保留在磁盘。
- FU-67 关闭: PR #3 `714c361` 将 Activity hero `最高海拔` 与 `轨迹记忆` elevation range 的 absent measured elevation 渲染统一为 `--`, 与 grid rule 对齐; rendering-layer only, 不改 server view-model / DB / GPS semantics。
- PR #3 merge commit: `c8f4027`; Production deployment READY; public `/screenshot` health 200。
- FU-64 当时保持 active 并扩 scope: 从单点 `20260609090000` repair 改为 "Supabase migration-history full reconciliation"。只读 drift check 证明是 project-wide drift, 包含 local-only、name-match version drift、remote-only 三类; 原计划单点 repair 会恶化一致性。
- 后续 v0.69 已完成 FU-64 migration-history drift 对账（本地↔远端 25/25 matched，drift=0），原 drift 禁令已解除；生产 schema / DB 变更仍需单独走 migration + 发布审批。
- 本 sprint DB mutation: 0。FU-64 未做 repair / rename / migration / psql。
- Active 14 → 12 · Closed 61 → 63

### v0.54（2026-06-02）

FU-62 close · mimo-v2.5 文字生产集成上线。

- FU-62 关闭: `/api/screenshot/recognize` 同步接入 mimo-v2.5 主路 + 腾讯 Basic → Accurate 降级兜底, route 显式 `runtime=nodejs` / `maxDuration=60`。
- `/screenshot` 等待态与确认页字段格式化同步: 时长 `HH:MM:SS`, 配速 `M'SS"`, 下降字段可确认编辑。
- Vercel Preview 承重通过: Hobby 函数真实截图 recognize 约 15.9s 返回 `mimo_v25`, 空白图低可信回退 Tencent Accurate 正常; Production + Preview env 已配置。
- FU-35 更新: 文字识别已上线, mimo-v2.5 多模态能力后续只跟踪轨迹 / 研究扩展。
- FU-36 保持 active: 截图轨迹复原仍必须单独解决, 方案 pending, 不因文字上线而关闭。
- FU-37 补齐关闭 commit / merge commit: benchmark 研究结论已随 FU-62 merge 入 main。
- B13: 本 sprint 无 schema / migration; 截图轨迹未上线; 生产 push 后仍需生产域名 recognize smoke; 本地 `vercel deploy --force` 717MB 上传曾 OOM, 生产部署走 Git 构建。
- Active 5 → 4 · Closed 59 → 60

### v0.53（2026-06-02）

FU-62 start · mimo-v2.5 文字生产集成启动。

- 注册 FU-62: mimo-v2.5 文字生产集成, 同步主路 + 腾讯降级兜底, 不做 async queue / migration / 轨迹生产接入。
- FU-35 更新为 `mimo-v2.5` 多模态能力接入: 文字能力已验证并由 FU-62 集成中; 轨迹后续继续跟 FU-36。
- FU-37 关闭: OCR vs mimo benchmark 已完成, 研究结论作为 FU-62 输入。
- B13: Vercel 单函数细项未能由 CLI 读取, 本 sprint route 显式 `runtime=nodejs` + `maxDuration=60`; 若 deployment 实测低于 30s, 停止同步上线改异步。
- Active 5 → 5 · Closed 58 → 59

### v0.52（2026-05-30）

docs-only · FU-38 close。

- FU-38 直接关闭, 不做 Phase 2: `paceMinPerKm` 独立持久化 + Activity / Share 展示方向停止推进。
- 决策理由: 配速 (min/km) 更偏跑步 / 越野跑, 非登山核心指标; 登山核心仍看速度 (km/h) 与爬升。
- Phase 1 保留: parser 对 COROS / 两步路等只显配速截图的识别 + `/screenshot` 确认页可编辑「配速」行不删除, 继续作为截图导入确认兜底。
- 后续归口: speed / pace 目前均 normalize 但不落库、不展示; 若未来要展示速率指标, 作为 Activity / Share 指标设计另议。速度 / 配速识别准确率留 FU-35 小米 MIMO 多模态 prompt 区分。
- B13: 纯 docs 关闭, 无代码 / schema / UI 改动, 无 migration, 不跑测试 / Playwright。
- Active 6 → 5 · Closed 57 → 58

### v0.51（2026-05-30）

FU-6 close + FU-34 tracker hygiene。

- FU-6 record-only UGC 山峰收录落地: `/import` 两处「申请收录山峰」入口真实写入 `mountain_requests`, 成功/失败反馈改为单条「进度 → 结果」toast 时序, admin `/admin/mountains/requests` 只读列表可查看申请。
- Schema / 安全: `mountain_requests` 表 + RLS 收紧 + 15min bucket dedupe + insert 不读回; admin 列表不暴露 email, 用户文本 React escape, XSS fixture 覆盖。
- Production migration deploy-gated apply: Vercel READY → baseline 0 table → dry-run PASS → apply success → post-verify 21 columns / 4 indexes + pkey / dedupe unique / RLS / 2 policies / grants。
- FU-34 降级为按需 reactive, 后续遇到新截图失败样本单独开 case 加 fixture / parser test。
- hygiene: `.gitignore` 新增 `output/`; FU-61 closed 标题从 `🔴` 对齐为 `✅`。
- 准入: lint 0e/5w · build PASS · focused node tests 35p · focused e2e 3p · git diff --check clean · no full Playwright。
- codex-risk-behavior-policy 连续 19 个 sprint 0 红线违反。
- Active 8 → 6 · Closed 55 → 57

### v0.50（2026-05-30）

FU-61 close。

- 自动登顶兜底落地: GPS 轨迹到达峰顶核验范围即视为登顶; 手动确认保留仪式感但非必要; 照片 / 备注 / 细节可下山后补。
- 登顶范围统一 300m, server `verify_summit_checkin` 改用整段轨迹最近点核验, `finish_incomplete_trek` 在有效记录且曾进入核验范围时自动生成 `complete / GPS VERIFIED` verified checkin。
- Trek UI / FAQ / `target-prd` / `ui-interaction-spec` / `acceptance-checklist` 同步「GPS 到达 = 核验依据, 照片非强制」口径; 不新增 `auto` proof taxonomy。
- B13: 坐标精度仍依赖 FU-16 后续审计; GPS 漂移风险由 drift filtering + 最小点数 + 最小时长约束; 完整离线队列不在本 sprint scope。
- 准入: lint 0e/5w · build PASS · focused node tests 39p · focused e2e 6p · git diff --check clean · no full Playwright。
- codex-risk-behavior-policy 连续 18 个 sprint 0 红线违反。
- Active 9 → 8 · Closed 54 → 55

---

### v0.49（2026-05-30）

FU-4 close。

- 删除 `mountains` 冗余记录: `7ab4cca8-a681-4f1e-94bc-9032d16d41f7` (西岳华山南峰), 保留 `216508c9-ffca-4164-8010-534d8650ee64` (华山)。
- 执行路径: Supabase 插件只读 inventory + `/tmp/fu4-review/backup/` archive → 用户审核通过 → 事务内 precheck → 单行 DELETE → post-verify。
- 引用处理: `checkins`, `checkins_archive_20260513`, `mountain_waypoints`, `trek_sessions`, `weather_cache` 引用均为 0, 因此不 reassign; post-verify 无孤儿引用, 华山行完好且 `checkin_count=153` 未动。
- B13: 顺带记录华山 `mountains.checkin_count` 缓存漂移 (153 vs 实际 454 / 421 complete / 196 verified) 到 Known Issue, 只记录不修。
- codex-risk-behavior-policy 连续 17 个 sprint 0 红线违反。
- Active 9 → 8 · Closed 53 → 54

---

### v0.48（2026-05-29）

FU-12 close。

- `share-track-preview` 真·地理 aspect ratio 修复: normalize 加 `cos(midLat)` 纬度修正 + 统一 range 居中归一化, `projectPoint` 改短边统一 scale + 居中 letterbox。
- 修复双源失真: 旧 normalize 独立 x/y 拉伸 + 旧 projectPoint 在非方形 frame 中二次拉伸; 轨迹米制比例现与 frame 形状解耦。
- 6 面证据同一轨迹一致 7.73:1; 真实两步路 GPX 在 216×290 非方形框中 route bbox `117.24×196`, user 视觉验收确认形状与两步路一致。
- 边界: 仅 `share-track-preview.ts` + tests; 模板 frame / 渲染 / 照片路径 / `ShareTrackPreview` shape / schema 0 改动。
- 准入: lint 0e/5w · build PASS · focused node tests 29p (`share-track-preview` + `share-render-api`) · git diff --check clean · no full Playwright。
- codex-risk-behavior-policy 连续 16 个 sprint 0 红线违反。
- Active 10 → 9 · Closed 52 → 53

---

### v0.47（2026-05-29）

FU-5 close。

- `premium-vertical-story` 真实轨迹层落地: 无图且有 `data.trackPreview` 时渲染真实路线层 (`VerticalStoryTrailSvg` + `buildShareTrackPath` + 方形 frame `{x:230,y:390,620×620,padding56}`), 无轨迹时保留 `VerticalStoryRidgeSvg` 兜底, 有照片时照片路径不变。
- 轨迹视觉放在上中背景区, 起点空心 / 终点实心 + glow, 不遮挡 header / 山名 / stats / footer; share editor 小预览不在本 sprint scope。
- 关联后续: 本 sprint 仅用方形 frame 规避 vertical-story 额外拉伸, 全局 share-track-preview 地理 aspect ratio 修复仍归 FU-12 (下一项建议)。
- 准入: lint 0e/5w · build PASS · focused node tests 28p · git diff --check clean · 3 态 visual evidence 完成。
- codex-risk-behavior-policy 连续 15 个 sprint 0 红线违反。
- Active 11 → 10 · Closed 51 → 52

---

### v0.46（2026-05-29）

FU-38 Phase 1 done, FU-38 保持 Active。

- 配速识别 Phase 1 完成: parser 新增 `paceMinPerKm` 识别, 接住 COROS / 两步路 "只显配速" 截图 (`7'09"` → `7.15`; pace validation `2-40 min/km`), 且不伪造 `speedKmh`。
- 确认页完成: `/screenshot` 识别确认页新增可编辑「配速」行, 跟随 field toggle / editable fields / confirm payload / recognized field analytics 口径; 375px + desktop browser evidence 已完成。
- Phase 1 边界: 无 schema migration, 不落库, Activity Detail / Share 展示不变; `paceMinPerKm` 与当前 `speedKmh` 一样只在 normalize payload 中流转, insert 不消费。
- Phase 2 pending: `checkins.pace_min_per_km` deploy-gated migration + 持久化 + Activity / Share 展示; 建议与 speed 持久化一起作为"活动速率指标"统一设计。
- 准入: lint 0e/5w · build PASS · focused node tests 61p · git diff --check clean · no full Playwright。
- codex-risk-behavior-policy 连续 14 个 sprint 0 红线违反。
- Active / Closed 计数不变（Active 11 · Closed 51）

---

### v0.45（2026-05-29）

FU-52 close。

- PMTiles storage cleanup 完成: 删除 Supabase Storage `map-tiles/basemap/` 下 9 个被否决实验包 + `china-z7` / `china-z8` 全国包, 释放 55.11 MiB; 仅保留生产 `huashan-bbox30-z9-12.pmtiles`。
- 代码清理: 移除 china-z7 national asset 死机器 (`NATIONAL_MAP_TILE_ASSET` / `getNationalMapTilesAsset` / `getMapTilesPublicUrl` / `MAP_TILES_OBJECT_PATH` / `MAP_TILES_SIZE_BYTES`), debug prototype 存储估算改 per-mountain bbox30 z9-12 × 300。
- brief 同步: `docs/map-weather-brief.md` v0.3.6 记录 china-z7 停用, production baseline 收口为 per-mountain PMTiles, Activity / Trek fallback 继续 trace-only。
- 前瞻: 300/400 山峰 pipeline 需按每座山生成 bbox30-z9-12 PMTiles → 上传 Storage → 注册 `MOUNTAIN_PMTILES_ASSETS`, 并把"每座山详情页地图正常渲染"纳入验收。
- codex-risk-behavior-policy 连续 13 个 sprint 0 红线违反。
- Active 12 → 11 · Closed 50 → 51

---

### v0.44（2026-05-29）

FU-45 close。

- 山峰简介 sanitized 富文本渲染恢复完成: 修复 FU-49 迁移后 `cleanDescription` 把 admin 富文本简介全部 strip 的 regression, `/mountain/[id]`「山峰简介」重新接回 `SanitizedMountainDescription`。
- 安全收口: DOMPurify allowlist 锁定 `h2/h3/h4/p/ul/ol/li/strong/em/b/i/br/span`, attributes 全剥离, forbid `img/a/script/iframe/style`; 禁图片 / 链接 / 脚本 / iframe / 内联样式。
- UI / 测试: CSS 使用 type-system token (`h2 title-l`, `h3/h4 title-m`, `p/li body-m`) + 列表 marker; 解除 `admin-mountain-edit.spec.ts` 的 FU-45 `test.fixme`, 路由 `/explore/{id}` → `/mountain/{id}`, 恢复 heading level 2 + bullets 富文本结构断言; 新增 sanitize 配置 node test。
- B13: 方向曾从"纯文本"修订为"富文本 (无图片)"; 旧 96 字符 line-clamp 折叠移除, 富文本折叠留后续; 真实山峰数据批量上传时做简介渲染二次视觉校验。
- codex-risk-behavior-policy 连续 12 个 sprint 0 红线违反。
- Active 13 → 12 · Closed 49 → 50

---

### v0.43（2026-05-29）

FU-10 + FU-15 + FU-2 轻量 bundle close。

- FU-10 "申请收录山峰" toast 占位反馈完成: `/import` 两处入口 (距离校验阻断态 + 无匹配空态) 点击后显示 toast `已收到您的山峰反馈，正式收录流程上线后会优先核实并录入。`, 同时保留原 help sheet / FAQ 行为; 共享 `handleRequestMountain`; `/import` 页面级补 `AppToastProvider` 避免 `useAppToast` no-op。
- FU-15 GPS 弱信号文案完成: Trek gpsWeak 全屏"当前海拔"辅助文案从静态"暂用上次值"改为 source-aware 四态 (上次 GPS 值 / GPS 弱信号参考 / 地形高程参考 / 采集中)。同步修正旧 tracker 过时前提: 当前绑定 `lastValidAltitudeM ?? displayAltitude`, `displayAltitude` 来自当前 GPS 或 Open-Meteo 地形高程, 非 `mountain.altitude`。
- FU-2 verify-and-close: `docs/ui-interaction-spec.md` 无 `verification_status` / `verified_at` / 旧"已留证=verified"引用, "留证"均为合法产品词, 已对齐"已留证 = mountain_id IS NOT NULL"口径, 0 改动关闭。
- 准入: lint 0e/5w · build PASS · focused node tests 97p · FU-10 375px/desktop browser evidence · FU-15 四态文案用户视觉验收 PASS · git diff --check clean。
- codex-risk-behavior-policy 连续 11 个 sprint 0 红线违反。
- Active 16 → 13 · Closed 46 → 49

---

### v0.42（2026-05-29）

FU-57 + FU-60 联合 close。

- FU-57 激活漏斗深度完成: Overview 主漏斗从 4 步升级为 10 步 actor-level 漏斗 (访问 → 注册 → 首次浏览山峰 → 首次选山 `/trek?mountainId=` → Trek 启动 → Trek 完成 → Activity 创建 → 分享生成 `success=true` → link 点击 `visitor_session_id` → link 拉新 `new_user_id`)。
- FU-60 来源 + 设备分群完成: User Behavior 新增来源分布 (直接 / 微信 / 朋友圈 / 百度 / Google / 其他 + D1/D7/D30 可见历史回访率) 与设备分布 (iOS / Android / Desktop / Other + Trek 完成率)。
- 主要落地: `src/lib/analytics/kpis.ts` 10-step activation funnel + source/device metrics; `src/lib/analytics/types.ts` Overview/UserBehavior metrics 扩展; `admin/analytics` Overview/User Behavior 新 sub-blocks + 默认展开算法说明; demo 数据扩 10-step funnel + referrer/UA 分布; 新增 `analytics-activation-funnel-sql` / `analytics-source-device-sql` tests。
- in-sprint license patch: 移除 `ua-parser-js@2.0.10` (`AGPL-3.0-or-later`), 改 ~15 行内联正则设备分类; 对当前 demo/test UA 4 桶分类 0 漂移; `package.json` / `package-lock.json` 回到 main 基线, 0 新依赖。
- 不动 `events` 表 / 埋点 SDK / API endpoint / map-weather brief。
- codex-risk-behavior-policy 连续 10 个 sprint 0 红线违反。
- Active 18 → 16 · Closed 44 → 46

### v0.41（2026-05-28）

FU-58 close。

- 新老用户分群双轨 dashboard 完成, 一次性 Phase 6 通过无 patch 轮。
- 主要落地: `src/lib/analytics/partitionByCohort` + 4 cohort (all/new/returning/anonymous) + 7d 阈值 + 9 helper signature 不变 (顶层接 cohort param) + `buildAnalyticsDashboardData` 签名扩展旧调用兼容 + `AnalyticsCohortKey` types 扩 + cohort selector/banner/默认展开 disclosure + URL SSR-safe `?cohort=` + 5 tab 全部跟随 cohort 过滤 + Legacy identified user 归 returning (避免 FU-55 上线前已注册用户消失) + anonymous 按 `session_id` 计 actor + demo 8-10 new + 8-10 returning + 1 新 SQL test (`analytics-cohort-partition-sql`)。
- 不动 `events` 表 / 埋点 SDK / API。
- codex-risk-behavior-policy 连续 9 个 sprint 0 红线违反。
- Active 19 → 18 · Closed 43 → 44

### v0.40（2026-05-28）

FU-59 close。

- 付费功能 ranking + 付费意愿评分 dashboard 扩展完成。
- 主要落地: `src/lib/analytics/kpis.ts` ranking + intent score 算法 (权重 + tie-break + cap values + recency 5 段函数) + `PaidPotentialMetrics` 扩 `featureRanking` + `highIntentUsers` + `admin/analytics` 付费潜力 tab 2 新 sub-blocks (付费功能 Ranking + 高意愿用户 Top 50) + 算法说明 in-UI 透明展示 + masked actor id + 5 时间窗口跟随 + demo 数据扩 3 features + 4 actor patterns + 2 新 node test (`analytics-paid-feature-ranking-sql` + `analytics-paid-intent-score-sql`)。
- 不动 `events` 表 / 埋点 SDK / API endpoint (仅衍生 metrics from FU-55)。
- codex-risk-behavior-policy 连续 8 个 sprint 0 红线违反。
- Active 20 → 19 · Closed 42 → 43

### v0.39（2026-05-28）

FU-55 close + 4 FU register (FU-57/58/59/60)。

- 自托管 `events` 埋点 + `admin/analytics` 5 tab dashboard 完成 (Phase 0-6 + 2 轮 in-sprint patch)。
- 主要落地: Supabase `events` 表 JSONB schema + deploy-gated production migration apply + 埋点 SDK (`sendBeacon` / fire-and-forget / `pt_anon_sid` + `pt_attribution_link_id` cookie) + `/api/analytics/event` API + 5 tab dashboard 含 K-factor + 时间窗口 5 option + 环比同比 delta + 渗透率 + 水印模板 sub-cards + paid_attempt 3 state funnel + Trek 中断/timeout 被动检测 + 模型评测 5 项核心 KPI (cost placeholder pending) + 运营成本 + Recharts^3.8.1。
- 同步 register 4 个 P1/P2 FU: 激活漏斗深度 / 新老用户分群 / 付费功能 ranking + 意愿评分 / 来源+设备分群。
- Production migration apply: Vercel deployment `dpl_EeWzW62CoMZPxUHK2rqzwPxobr52` READY → baseline 0 rows for `public.events` → transaction dry-run marker `fu55_events_dry_run_ok` → `apply_migration` success → schema/index/RLS/policy/read verification complete。
- 关闭 commit: `bfc5f16` / `4d5e8c3` / `efb9e1c` / `2ad5f05` · merge commit: `abfbb1b`
- codex-risk-behavior-policy 连续 7 个 sprint 0 红线违反。
- Active 16 → 20 · Closed 41 → 42

### v0.38（2026-05-28）

FU-47(c) close + FU-47 父 entry 整体 close。

- Trek 轻量参考地图接入 mountain-bbox PMTiles 完成 (Phase 3-6 + 1 轮 in-sprint patch)。主要落地: `TrekReferenceMap.tsx` 独立组件 (844 行, 复用 `PmtilesSnapshotMap` baseline) + GeoJSON 业务层 (summit + walked trace + current dot + accuracy ring + `当前位置` label) + trace-only fallback (不走 z=7) + SSR-safe QA harness (`fu47cMapError` / `fu47cGpsMock`) + TrekClient 大幅瘦身。
- brief §15.5 不动 (Plan v2 立场): Trek current dot / accuracy ring / `当前位置` label 属于 §15.5.4 GeoJSON 业务层在 Trek 场景的具体实现, 不升级到跨 surface baseline。
- FU-47 父 entry 整体 close: (a)✅ + (b)✅ + (c)✅ 全 3 子 sprint 完成, P0 地图能力 production ready。
- codex-risk-behavior-policy 连续 6 个 sprint 0 红线违反。
- 关闭 commit: `cf5cee4` / `0d5614f` / `758265c` · merge commit: `23b5ce4`
- Active 17 → 16 · Closed 39 → 41

### v0.37（2026-05-28）

FU-47(b) close · Mountain Detail + Activity Detail 接入 mountain-bbox PMTiles 真实地图完成 (Phase 3-6 + 3 轮 in-sprint patch)。

- 主要落地: `PmtilesSnapshotMap` 共享 client 组件 (按 brief §15.5 11 子节 baseline) + Mountain Detail `RouteReferenceSection` 4 状态矩阵 (PMTiles ⊥ waypoints 解耦) + Activity Detail mountain-bbox PMTiles GeoJSON trace + trace-only fallback (无 z=7) + `ActivityDetailViewModel.trackPoints` GPS 坐标暴露 + SSR-safe searchParams + Supabase admin auth for screenshot (0 DB mutation)。
- brief 同步 v0.3.3-0.3.5: §15.5 客户端实施 baseline / §15.5.3 NavigationControl 唯一 / §15.5.4 trace-only fallback / §15.4.7 上线 checklist 同步。
- FU-47 整体: (a) ✅ done + (b) ✅ done + (c) 🟢 next candidate。
- risk policy 连续 5 个 sprint 0 红线违反。
- 关闭 commit: `96f3c5c` / `59a7161` / `a382e03` / `fc4c038` · merge commit: `200dee4`
- Active 17 不变 · Closed 38 → 39

### v0.36（2026-05-28）

FU-56 close · e2e helper/spec rot 系统修复 (7 个已知 fail · 一次性 in-sprint register+close)

- 处理: 6 fail 修 + 1 fail 归 flake (transparent disclose)；改动严格限 test/helper 层 (4 文件 +80/-71), **0 src 业务代码改动**。
- **关键 audit-driven finding**: #1 protected trek returnTo reclassify 为 helper timing rot 而非真业务 regression — controlled repro + helper hardening 后已 stable pass, 不需改 src/auth (FU-46 BUG #1 patch 已正确修真业务)。
- 各 fail 修复: #2/#3 auth helper service-role seed + 真实 login UI / #4 explore helper 等当前 testid + canonical href / #5 button-token assertion FU-54 license badge / #6 8 次执行均 pass 归 flake disclose / #7 trek helper 加 8 GPS points + session backdate。
- 准入: lint 0e/6w · build PASS · node test 250p · 强关联子集 26p · git diff --check clean。
- 用户视觉验收: PASS (3 checkpoint 全过)。
- **协议红线实战**: FU-56 是 codex-risk-behavior-policy 固化后第 4 个完美 sprint (FU-49 + FU-43 + FU-53 + FU-56 连续样板)。主动 disclose #1 reclassification + #6 flake + helper/业务边界 = B13 完美实战。
- 关闭 commit: `b5a1690` / `3d90203` / `bd62a60` · merge commit: `13bc4f4`
- **数字特殊**: Active 17 不变 (FU-56 sprint 内 register+close 净变化 = 0) · Closed 37 → 38
- v0.8 机械化清单第二十三次实战

### v0.35（2026-05-27）

FU-53 close · SharePosterButton (legacy) + share-card-lab debug 入口 obsolete cleanup

- 处理: 删除 legacy `SharePosterButton.tsx` (937 行) + `/share-card-lab` debug route；清理 debug / onboarding QA 入口、`OnboardingModal` suppression、`ModalShell layout='share-sheet'` 死分支、`.share-sheet*` 与 `modal[data-layout='share-sheet']` CSS。
- e2e cleanup: `app.spec.ts` / `community-final-polish.spec.ts` / `button-token-migration.spec.ts` 中 5 个 legacy share-sheet / share-card-lab test block obsolete 删除；生产 share coverage 保留在 `/share` 相关 spec。
- 改动: 10 files changed, 5 insertions(+), 1376 deletions(-)；删除 2 文件 (`src/components/ui/SharePosterButton.tsx`, `src/app/(main)/share-card-lab/page.tsx`)。
- 准入: lint 0e/6w · node test 26p · build PASS · `git diff --check` clean · `rg "SharePosterButton|share-card-lab|share-sheet" src tests` 0 live hits · FU-45 为唯一 `test.fixme`。
- 浏览器证据: 375px 本地截图覆盖 `/share` production editor、`/share-card-lab` 404 删除态、Profile share section、Activity Detail `生成分享` CTA；metrics 记录 `horizontalOverflow=false`。
- 用户视觉验收: PASS (生产 `/share` / deleted route / profile share section / activity share CTA 验收点全过)。
- **7 个非 FU-53 e2e fail 紧接 register FU-56 立即修复**: 用户决策 FU-53 close 紧接 next sprint 启动 FU-56, 利用 FU-53 sprint 现场调研上下文直接修复, 不积累成 baseline rot. 不违反 risk policy A5/B8 (FU-56 是已知 7 case 收口, 非 umbrella scan). 详情见 FU-53 ✅ Closed entry。
- 关闭 commit: `bec80d4` · merge commit: `4363376`
- Active 18 → 17 · Closed 36 → 37
- v0.8 机械化清单第二十二次实战

### v0.34（2026-05-27）

FU-43 close · archive 卡片 hero 状态标签可读性增强

- 处理: TripMedia 顶部双层 scrim 渐变加强 + ArchiveMediaChipShell glass wrapper (backdrop-blur + 半透明深色 + border + textShadow 多重兜底) + 3 个 testid 加 (archive-trip-media / archive-trip-chip-summit / archive-trip-chip-proof)
- 改动: src/app/(flow)/archive/ArchiveClient.tsx (1 文件 +40/-5)
- 准入: lint 0e/8w · build PASS · node test 19p · playwright app.spec 22p · git diff --check clean
- 用户视觉验收: PASS (5 主验收点 + 2 cross-check 全过, 亮 hero / 暗 hero / 占位 hero / 无回归 explore-card + mountain-detail chip)
- **协议红线实战**: FU-43 是 codex-risk-behavior-policy 固化后第 2 个 sprint, Codex 严格执行 B1/B2/B4/B5/B6/B7/B8/B12/B13, 因 context budget 风险主动 STOP 2 次 (Phase 0 audit 前 + Phase 3 final-acceptance 后), 跟 FU-49 一起作为 risk policy 持续落地样板
- 关闭 commit: `e8fce12` · merge commit: `3b74bce`
- Active 19 → 18 · Closed 35 → 36
- v0.8 机械化清单第二十一次实战

### v0.33（2026-05-27）

FU-49 close · (main)/explore/[id] mountain detail + 孤儿组件 obsolete cleanup

- 处理统计: 删除 6 个孤儿文件 + 路由 + CSS; spec URL 切换 + 断言重写; 总 diff +68 / -1046。
- 删除文件: `src/app/(main)/explore/[id]/page.tsx` (269) + `src/components/mountain/WaypointsSection.tsx` (293) + 部分 MountainUI exports。
- 修改文件: `src/components/ui/MountainUI.tsx` (保留 SectionHeader / DifficultyBadge / MountainImagePlaceholder) + `src/app/components.css` (保留 `.mountain-card` / `.mountain-featured-posts*`) + 2 e2e spec。
- 准入: lint 0e/8w · node test 4p · build PASS + 路由列表 `/explore/[id]` 已移除 · 强关联子集 e2e 43p/1s · git diff --check clean。
- 用户视觉验收: PASS (6 验收点全过)。
- **协议红线实战**: 严格遵守 codex-risk-behavior-policy B1/B2 (Phase 4 STOP) / B4/B6/B12 (issue-level 截图) / B7 (实时 ledger) / B13 (transparent deviation), Codex 输出后正确 STOP 等用户验收, 与 FU-54 close 直接 V3 形成范式对比。
- 关闭 commit: `bcab285` / `087d4d5` · merge commit: `392c7b6`
- Active 20 → 19 · Closed 34 → 35
- v0.8 机械化清单第二十次实战

### v0.32（2026-05-27）

FU-54 close · License Progress 重设计 + License Gate 解耦 + Difficulty Advisory 收尾

- **实施**: 27 files changed across merge, +1060 / -749；新增 `LicenseProgressSheet` / `DifficultyChip` / `DifficultyAdvisory` / `license-progress.ts` / `license-progress.test.ts`；删除 `ProfileLicenseProgressSection.tsx` + `LockModal.tsx`。
- **License Progress**: Profile head license badge 成为抽屉入口；底部抽屉展示 4 rung（none/basic/intermediate/advanced）、当前进度、`N / 3`、算法说明与 FAQ 链接；支持 `/profile?licenseSheet=1` deep link。
- **算法切换**: 从海拔 tier (1000/2000/4000m) 切到 difficulty 系数；保留现有 repo difficulty 模型 `beginner / intermediate / advanced / expert`；GPS 有效记录要求 owner checkin complete + verified_at + mountain linked + realtime GPS/legacy gps source；monotonic sync 只向上写 `profiles.license_level`。
- **License Gate 解耦**: `/explore/[id]`、`MountainDetailClient`、`TrekClient`、`CheckinButton`、`MountainDetailRecordCTA` 拆除 hard lock；高于当前等级时显示 `DifficultyAdvisory`，但主操作始终可继续。
- **Difficulty UI**: `DifficultyChip` 适配四档 difficulty glyph；与 license rung 视觉区分（四段升序条 vs 执照阶梯）。
- **Docs / FAQ**: `docs/target-prd.md` §7.1、`docs/ui-interaction-spec.md` §10.6、`src/lib/faq-content.ts` license-upgrade 均同步为 advisory-not-restriction。
- **测试与视觉证据**: lint 0e/9w · node test 250p · build PASS · FU-54 strong-coupling e2e subset 38 passed；视觉证据 `/tmp/fu54-review/phase*/` + metrics `/tmp/fu54-review/final/metrics.json`（375px, captured scenes `hasHorizontalOverflow=false`）。
- **已知旁路**: 额外 community cross-check 的一条 feed card body click 仍未进入 detail（停留 `/community`）；未归因到 FU-54 touched code，留作后续候选排查，不阻塞 FU-54 close。
- **用户视觉验收**: 由用户触发继续 Phase 7；Codex 保留截图证据，不自下视觉验收结论。
- **提交分桶**: 6 feature commits + merge commit `f1c5c08` + docs v0.32 closeout commit。
- **in-sprint visual patch (2026-05-27)**: 用户视觉验收发现 11 个视觉 / UX 瑕疵（字号层级 / 中文文案 / glyph 渲染 / FAQ 内容 / 入门线 chip 简化 / advisory 交互），已在 main 直接 commit + push 修复。无功能 break，跟 FU-42 / FU-46 BUG fix 同范式 in-sprint patch。Active 20 / Closed 34 数字不变。
- **in-sprint visual patch v2 (2026-05-27)**: 修复 patch v1 残留 4 issue（sheet inner glyph 删除 / eyebrow 字号 alignment / 算法卡片删除 / beginner chip 彻底简化）。Active 20 / Closed 34 数字不变。
- Active 21 → 20 · Closed 33 → 34
- v0.8 机械化清单第二十次实战

### v0.31（2026-05-26）

FU-46 close · e2e baseline rot 系统性清理收尾 + 4 个 in-sprint BUG fix + **全量 e2e gate 协议正式撤销**

- **处理统计**: 38 quarantine cases (FIX 18 / REWRITE 12 / OBSOLETE 5 / BUG-OUT-OF-SCOPE 3)；4 个 in-sprint BUG fix。
- **业务代码改动**: 6 src 文件 (+76 / -8) — `MountainDetailClient` (+8) / `CommunityCard` (+24) / `auth-redirect` 新增 (+19) / `login` (+5) / `register` (+5) / `avatar-upload` (+4)；已 strict diff 自查无 visible UI / business logic regression。
- **spec 改动**: 4 e2e spec + 2 helper (+331 / -1069 net) — full rewrite of outdated blocks。
- **src dead code cleanup**: `src/app/components.css` (-182 lines) + `src/components/community/ProfileCommunitySections.tsx` (orphan component deleted, -367 lines)。
- **DB migration**: `supabase/migrations/20260526190604_fix_profiles_avatar_rls.sql` (BUG #4 column-level GRANT UPDATE for user-editable profile fields including `avatar_url`; `is_admin` / payment 字段保护)。
- **全量 e2e**: 1 次完整 `--retries=1` 跑通 (`status=passed` / `failedTests=[]`)；3 fixme retained (FU-45 1 + FU-54 license progress 2)。
- **4 BUG fix 验收**:
  - #5 Mountain Detail "查看路线" fallback: 加 `id="route"` + href 改为 `hasWaypoints ? '#waypoints' : '#route'`
  - #3 Community feed card activation: `CommunityCard` `onClick` / `onKeyDown` route push 修复 + 保护 nested controls (mountain link / like / share / menu)
  - #1 Protected Trek returnTo: auth returnTo 跨 register + profile setup 流程 propagation 修复 (`normalizeAuthReturnPath` + client session storage fallback)
  - #4 Avatar upload RLS: app code 用 `createSupabaseAdminClient` + owner-scoped UPDATE 即时 fix；migration deploy-gated 长期 fix 加 column-level GRANT UPDATE
- **协议撤销**: 2026-05-26 用户决策。docs v0.15 引入的 "V3 preflight 全量 e2e gate" 协议在 FU-46 close 时**正式撤销 (revoked)**。后续 sprint preflight 中 e2e 部分仅跑强关联子集 spec，不再升级为全量。理由: 全量 e2e 资源 / 时间成本与价值不对等；强关联子集 + 视觉验收已覆盖业务变更的实际验证需求。
- **替代协议**: V3 preflight 含 lint + node test + build + 强关联子集 e2e + 用户视觉验收。已记入 memory `feedback_full_e2e_terminated_after_fu46.md`。
- **历史归档**: FU-46 跑的完整全量是该协议的 unique 收尾 + quarantine debt 归零，不绑定未来 gate 启用。
- **BUG #4 production migration 已应用 (2026-05-26)**: Vercel 部署 `main@92b4e89` 完成 (state=READY, deployment_id=dpl_JB8EMuUufdEKgnSLT4L16iY7HxRq) 后通过 Supabase MCP `apply_migration` 应用 `fix_profiles_avatar_rls`, success=true; post-apply 验证全通过 — profiles 表 10 个 user-editable 字段 (含 `avatar_url`) UPDATE grant 已添加给 authenticated role / `is_admin` 与敏感字段仍受保护 (0 grants) / `profiles_update` RLS owner-scoped 不变 / smoke `SELECT COUNT(*) FROM profiles WHERE avatar_url IS NOT NULL` = 16。
- **Tooling deviation**: Supabase MCP `apply_migration` 在远端 `schema_migrations` 记录的 version 为运行时生成的 `20260526133859`, 与 repo 文件名前缀 `20260526190604` 不一致; migration name 与 SQL body 一致; 跟 FU-42 sub-sprint 4 deploy step 同范式 cosmetic 行为, 不影响跨机器 sync。
- **用户视觉验收**: PASS (15 个验收点全过)。
- Active 22 → 21 · Closed 32 → 33
- v0.8 机械化清单第十九次实战

### v0.30（2026-05-22）

FU-42 sub-sprint 4 · close 整个 FU-42 umbrella · checkins.status 三态字段全链路移除收尾

- **实施**: 40 modified + 3 deleted (`admin/checkins` UI 2 + `checkin-review` API 1) + 1 new migration；net +326/-984 across merge（app commit +163/-984, migration +163）。
- **应用层切换**: `isSummit` / Profile 山行 count / Archive count / community feed gating / Activity Detail pending 编辑与分享入口全部从 `status='approved'` 切到 `verified_at IS NOT NULL` 或 `completionStatus` 业务字段。
- **DB migration (deploy-gated)**: 新 SQL 文件按顺序 (1) DROP+CREATE POLICY `checkins_select`（移除 `status='approved'` 分支）, (2) CREATE OR REPLACE FUNCTION `verify_and_record_checkin`（写 `verified_at` + ranking fields + `completion_status`, 签名稳定）, (3) DROP INDEX `idx_checkins_status_source`, (4) DROP CONSTRAINT `checkins_status_check`, (5) DROP COLUMN `status`。V3 期间**未应用**到生产，避免应用部署完成前 schema 已变的 race window；等 Vercel deploy 完成后通过 Codex Supabase MCP 单独应用 + 验证。
- **准入**: lint 0e/10w · node test 246p · build PASS · strong-coupling e2e 4 specs / 7 tests pass · 用户视觉验收 5 个场景全过 (Profile head / Archive isSummit chip / Activity Detail pending / `/admin/checkins` 404 / Trek summit verify)。
- **提交分桶**: app code refactor commit `29f8f51` / migration deploy-gated commit `7ea0ff4` / docs v0.30 commit（本条）。
- Active 23 → 22 · Closed 31 → 32 · 关闭 FU-42 整个 umbrella (sub-sprint 1+2+3+4)。
- **生产 schema 已应用 (2026-05-22)**: Vercel 部署 `main@17a8f2e` 完成 (state=READY) 后通过 Supabase MCP `apply_migration` 应用 `drop_checkins_status_finalize_fu42`, success=true; post-apply 验证全通过 — `checkins.status` column 已删 / `checkins_select` RLS 简化为 owner+admin 无 status 分支 / `verify_and_record_checkin` RPC 已重写 (含 verified_at / ranking_weight / completion_status, 无 status / approved 字符串) / `idx_checkins_status_source` 已删 / `checkins_status_check` constraint 已删; smoke `SELECT COUNT(*) FROM checkins WHERE verified_at IS NOT NULL` = 568; RPC `authenticated` 仍 EXECUTE 可调用。
- **Tooling deviation**: Supabase MCP `apply_migration` 在远端 `schema_migrations` 记录的 version 为运行时生成的 `20260522104503`, 与 repo 文件名前缀 `20260522045459` 不一致; migration name 与 SQL body 一致; supabase CLI 用 migration name 做 unique key 而非 timestamp prefix, 影响仅 cosmetic, 不重复 apply 不破坏跨机器 sync。

v0.8 机械化清单第十七次实战。

### v0.29（2026-05-22）

FU-42 sub-sprint 3 · application-level review queue 概念彻底清除 + share card poster guard 拆除 收尾

- share card poster generation status guard 拆除 (`src/app/api/trek/actions/route.ts` line 1237 删除 `if (checkin.status !== 'approved')` reject block；owner check 保留作 cross-user 安全防御)；pending 状态活动现在也能 generate share card poster (主要 unblock legacy `SharePosterButton` 路径，FU-53 cleanup 范围)；配套 `tests/e2e/share-preview-track.spec.ts` 加 pending 活动 share card 验证 case (commit `75a6574`)
- Review queue application-level dead code cleanup (commit `32ca29e`):
  - 删除 `src/lib/review-queue.ts` (整模块废弃)
  - 删除 `src/components/profile/ProfileReviewQueueSummary.tsx` (sub-sprint 1 留作回退的孤儿组件)
  - 删除 `src/components/profile/MyRecordsModal.tsx` (同上)
  - `src/types/index.ts` `ReviewQueueRecord` type 删除
  - `src/app/(flow)/trek/page.tsx` 删除 `listReviewQueueRecords` dead query + `reviewQueueRecords` 变量 + `initialReviewQueueRecords` / `initialReviewQueueCount` prop 传递
  - `src/app/(flow)/trek/TrekClient.tsx` 删除 `initialReviewQueueRecords` / `initialReviewQueueCount` prop 类型 + body 内 noop 接收 (`void`)
  - `src/app/components.css` 删除 `.review-queue-*` 和 `.profile-review-queue-trigger*` 等 review queue 相关 CSS 类名 (-126 行)
  - `tests/e2e/button-token-migration.spec.ts` 删除 review queue helper / cases
  - `tests/e2e/trek-photo-checkin.spec.ts` 删除 `trek-review-queue-trigger` 负向 assertion
- 用户视觉验收 PASS: Profile 无 review queue 入口残留 / Pending 活动点"生成分享"进入 `/share` preview 不再 422 / Trek 页面正常 render 无 review queue UI 残留
- 计数: Active 23 不变 (FU-42 仍 active) / Closed 31 不变
- main merge: `a7bf2c9`
- preflight: lint 0e/13w · node --test 246p · build PASS · share-preview-track + trek-photo-checkin 4 passed
- 视觉证据: `/tmp/peak-trekker-fu42-sub3-review/` (3 截图 + `metrics.json`, `hasHorizontalOverflow=false`, `pageErrors=[]`)
- Known issue 注脚: `metrics.json` console 6 条 `Failed to load resource 403` pre-existing dev env issue (与 sub-sprint 3 改动无关)，待后续追查
- FU-42 进度: sub-sprint 1 ✅ done / sub-sprint 2 ✅ done / sub-sprint 3 ✅ done / sub-sprint 4 ⏳ pending (DB schema + RLS + RPC + admin/checkins 整套 + types 系统 status 字段 + 写入路径 default)

### v0.28（2026-05-22）

FU-42 sub-sprint 2 + FU-30 folding · 前端 status gate 拆除 + isSummit 业务字段迁移到 verified_at + Profile / Archive 山行口径统一 收尾

- Backfill migration (`supabase/migrations/20260521161903_backfill_checkins_verified_at_from_legacy_status.sql`): `UPDATE checkins SET verified_at = created_at WHERE status IN ('approved', 'verified') AND verified_at IS NULL` — 343 行历史数据补 `verified_at` (53.59% 占比)；commit `50b772c`；migration 已 apply 远端 production（Phase 3 实施时 Codex Supabase MCP apply，V3 不重复 push）
- Frontend status gate 拆除 + `isSummit` verified_at 迁移 + FU-30 folding (commit `fa084e5`):
  - `archive/page.tsx` `isSummit` fallback chain 简化为 `summit_verified === true || verified_at !== null`（删 `status='approved' / 'verified'` 分支）
  - `activity/[id]/page.tsx` `isSummit` 改 `checkin.verified_at !== null`；`deriveSourceLabelType` 删 status fallback；`recordCount` 拆 `.eq('status','approved')` 改 all own trips（与 Archive 对齐，deviation from V1 B.8 spec；user mental model: BackToRecords describes Archive surface）
  - `profile/page.tsx` `buildSummary` completionStatus only filter（拆 `status='approved'`）；重命名 `approvedTrips` → `completeTrips`
  - `ActivityDetailClient.tsx` 照片补传 / 删除 UI gate 拆除（"待审核通过后可补传/删除"文案删除，disabled prop 拆除）；`activity-detail-validation.ts` `getActivityPhotoUploadValidation` / `getActivityPhotoDeleteValidation` `isApproved` 始终 true
  - 单测 `tests/lib/activity-detail-validation.test.ts` 覆盖 pending / rejected 可上传 / 删除；`tests/trek-stability-static.test.ts` Profile summary 断言 completion-only
  - `docs/ui-interaction-spec.md` 同步 FU-30 文档对齐（Archive = all / Profile head = completed only；都不依赖 status）
- In-sprint patch · API guards 拆除 (commit `f443cba`):
  - `src/app/api/activity/actions/route.ts` 3 处 `status='approved'` API guards 删除：photo upload + photo delete + note edit
  - 触发原因: 用户 Phase 4 视觉验收发现 pending 活动前端 gate 拆除后 server 422 反弹 toast "只有已通过的攀登记录才能补充现场照片。" 暴露"审核"概念
  - owner check (`user_id !== user.id` → 403) 保留作 cross-user 安全防御
  - 也修复 sub-sprint 1 retroactive bug（note edit pending 活动 422）
- 用户视觉验收 PASS: Archive 登顶 chip / Profile head 统计 / Activity Detail 照片区无"审核"文案 / Lightbox 删除按钮 / 手记编辑保存成功 + 照片上传成功（无 422）
- 计数: Active 24 → 23（FU-30 closed）/ Closed 30 → 31
- main merge: `2256ec5`
- preflight: lint 0e/13w · node --test 246p · build PASS · activity-photo-gallery.spec.ts 1 passed
- 视觉证据: `/tmp/peak-trekker-fu42-visual/`（Phase 3）+ `/tmp/peak-trekker-fu42-sub2-patch-review/`（patch 后）
- 协议升级（新存 feedback codex-must-provide-visual-evidence memory）: UI 改动 sprint Phase 3 必须 Codex 跑视觉验收 + 提供截图证据（不下结论）；与 codex-no-self-visual-acceptance 互补（提供数据 vs 下结论）
- 已知遗漏（sub-sprint 3）: `trek/actions` / `community-server` status guards / 写入路径 status default / type 系统 status 字段废除
- 已知遗漏（sub-sprint 4）: DB `DROP COLUMN status` + RLS 简化 + `verify_summit_checkin` RPC 改写 + `admin/checkins` 整套删除 + 孤儿组件 (`MyRecordsModal` / `ProfileReviewQueueSummary`) 清理
- FU-42 进度: sub-sprint 1 ✅ done / sub-sprint 2 ✅ done（含 FU-30 folding + API guards patch）/ sub-sprint 3 ⏳ pending / sub-sprint 4 ⏳ pending

### v0.27（2026-05-21）

FU-42 sub-sprint 1 · 前端 UI 审核语义全面拆除 收尾

- 删除 ProfileV2 review queue section (含 `ReviewQueueSection` 函数 + render call + `listReviewQueueRecords` 数据查询 + `reviewRecords` prop 传递；`MyRecordsModal` + `ProfileReviewQueueSummary` component 文件保留作 orphan，不再被 import)；commit `516fc6b`
- 拆除 Activity Detail 手记区 status gate (含 `noteDisabledHint` 文案 + 2 处按钮 disabled / fallback 文案 / conditional style + `handleStartNoteEdit` status guard + `showLocalToast`)；`getActivityNoteValidation` 签名保留 status 字段兼容，但 `isApproved` 始终 true，`canSave` 不再依赖 status；单测覆盖 pending/rejected 也可编辑保存的规则；commit `7c8f580`
- 用户视觉验收 PASS: Profile 页面无"待审核记录"入口 + Activity Detail 手记任意活动状态可编辑
- 计数: Active 24 不变 (FU-42 仍 active) / Closed 30 不变
- main merge: `80fc087`
- preflight: lint 0e/13w · node --test 246p · build PASS · activity-note-editor.spec.ts 1 passed
- 已知遗漏 (留 FU-42 sub-sprint 2): `ActivityDetailClient` 内 photo upload/delete 等剩余 7 处 `activity.status` 引用；archive/profile filter 仍依赖 `status='approved'`；`isSummit` / `proofStatus` 仍依赖 status
- FU-42 子任务进度: sub-sprint 1 ✅ done / sub-sprint 2 ⏳ pending / sub-sprint 3 ⏳ pending / sub-sprint 4 ⏳ pending

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
awk '/^## Active Follow-ups/{a=1;b=0;d=0;ac=0;next} /^## Deferred Registration/{a=0;b=0;d=1;dc=0;next} /^## Known Issues/{d=0;next} /^## Closed Follow-ups/{a=0;b=1;d=0;cc=0;next} /^## /{a=0;b=0;d=0;next} a==1 && /^### (FU-|Issue-)/{ac++} d==1 && /^### Deferred · FU-/{dc++} b==1 && /^### (FU-|Issue-)/{cc++} END{print "Active actual:", ac; print "Closed actual:", cc; print "Deferred actual:", dc}' docs/follow-ups.md
```
