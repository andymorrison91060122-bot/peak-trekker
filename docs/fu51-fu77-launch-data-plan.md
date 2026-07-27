# FU-51 / FU-77 · 上线数据落地任务文档 v2

- 建档：2026-07-24
- 更新：2026-07-28
- 状态：T1–T11、T13 与 Migration B 已完成；T12 待生产人工验收
- 单一事实源：
  - 清洗账本：`data/mountains/ledger/effective_canonicals.jsonl`（359 实体）
  - 内容补全：`data/mountains/ledger/effective-canonical-enrichment.jsonl`
  - 坐标终态：`data/mountains/coordinate-fix/t13-final-coordinate.jsonl`
  - 权威字段规范：`docs/mountain-content-spec.md`
  - 生产 schema：`supabase-init.sql` + `supabase/migrations/*`
  - 山峰 TS 类型：`src/types/index.ts`（`Mountain`）
- 分工：Claude 定方案+审核，Codex 执行+验证，用户拍板+验收；图片线由用户并行处理。

---

## 0. 决策基线

### 🔑 铁律：上线是最后一道门
**flip `is_active` 是整个计划的最后一步，不是过程中发生的事。** 现在所有工作 = 把数据/内容按计划做完；做完 + 用户验收 PASS 才谈上线。绝不 70% 就推。"分档"只发生在全部内容任务完成之后，决定哪些达标的先公开——不提前放任何一座。

### 已锁（用户已确认）
- ✅ **基线 = 359 实体**。对账已过：0 座 keep 丢失、0 孤儿；剔除的 41 座全是"景区周边泛化簇无单一峰顶"，合并的全是"子峰并入母山"（已批准政策）。
- ✅ **简介 = 一句话总述**，优先级 **① 人文 → ② 海拔/地位 → ③ 景观记忆点**（例：桦皮岭="冬天玩雪"）。不拆分描述。
- ✅ **冻结核验**：身份/坐标外部核验到此为止，不再投入。
- ✅ **D1 范围 = 全量入库 + 分档上线**：359 座全部灌库（消灭生产假数字）；全部内容任务做完后，只对过 spec 及格线的 flip `is_active`，其余留库不公开+进补齐列表。
- ✅ **D2 风险/路线 = 要做，非跳过**：v1 用难度分级模板 + 路线名 + 固定声明打底（spec B 档站得住），Part 2 可深化。跑完才上线。
- ✅ **D4 诚实显示原则（2026-07-27 最终口径）**：**绝不把海拔 ÷ 260 的无来源距离当真值显示。** 四格 StatTile 保留，缺值显 `--`，不让 NULL 进入计数动效。当前生产只读事实为距离 **344 有值 / 15 NULL**、时长 **258 有值 / 101 NULL**；旧 `341/18`、`269` 是路线语义修订前的阶段值。
  - **距离**：只读真实 `length_km`；15 座 NULL 显 `--`。`expert` 的 32 条远征分段距离仅留在 `route_note`，详情与 Explore 卡片不展示，也不进入长度筛选。
  - **时长**：只读 `estimated_duration_minutes`，仅 beginner/intermediate 显示整小时区间（如 180/210 分钟均为 `3~4h`，480 分钟为 `8~9h`）；advanced/expert 与缺值显 `--`。
  - **爬升**：beginner/intermediate 保留 `max(320, round(altitude × 0.68))` 量级估算并明确标「估算」；advanced/expert 显 `--`。
  - **信任维度**：sidecar 加 `source_class`（seed字面/平台来源/权威/已核验），让"有值 ≠ 可信"显式化。坐标信任低风险（产品几乎不显示坐标）；真正要信任标签的是会显示的海拔/距离。

### ⚠️ 待用户签字（Claude 的判断，可改）
- ⚠️**D3 简介长度**：你选的"一句话"（约 30 字）**低于** spec §4.3 的"60–120 字"。按你的决定执行、并把 spec 标注为 v1 放宽。确认即可。

### 已锁（S1.1/S1.2 顾问审核后追加）
- ✅ **D5 距离=源里"最长/最代表"路线**（路线身份绑定：名+距离+语义同源，禁独立拼接）。五台山=大朝台环线50km、武功山=发云界穿越18km、西岭雪山=登山线25km。source_class=`seed_claimed_platform_source`（平台声称·未逐山核验）。
- ✅ **D6 时长=山地粗估 2.0 km/h**（含爬升/台阶/人流；10km→5h），封顶 ≤8h（>16km 视多日→null），仅 beginner/intermediate + 往返/环线。**非真轨迹耗时**。
- ✅ **D7 真距离+真耗时+轨迹留 Part2**：从两步路/六只脚一次性取（同时也是轨迹/点位来源 T14）。峨眉全程、华山自古一条路等"源天花板"届时补真值。
- ✅ **D8 简介声音**：钩子先行（人文/地位/景观）、海拔嵌入不领头、禁元语言、禁给偏远小山编造别名/典故；仅公认名山可补公认人文。
- 📌 **T11 注意**：359 风险为难度分级模板底稿，T11 不得算作"逐山专属风险已审"。9 座禁攀/未登峰已在 D10 写入诚实的「无公开攀登路线」说明，不以虚构路线补空值；是否进入首发仍由 T11 按准入状态与完整门禁裁定。

### 已锁（S1.4 审核后追加·2026-07-25 用户拍板）
- ✅ **D9 山峰库定位＝如实摆出山与门槛，攀不攀由用户判断**。62 座 advanced/expert 的 `access_status=open` 依据仅为 seed 许可文本（该依据已被证伪过期：雀儿山/那玛峰/勒多曼因/田海子山），Claude 曾建议不进首批 —— **用户驳回并锁定：进首批**。理由：这 62 座**不是"禁止攀登"，是"有能力门槛"**，无划界拦阻；难度分级（入门/进阶/专业技术）本就是给用户自判用的；前期提醒到位后由用户自负。真正查实关闭的（雀儿山等）已标 `closed`，二者不可混为一谈。
  - ⛓️ **前提条件（不是可选项）**：该决策成立的**唯一前提是"前期提醒真的到达用户"**。因此 T9b 的三条显示要求（难度分级显眼 / 风险提示全文 / expert 不给攀登引导）**从"诚实性优化"升级为 D9 的配套条件**，验收须逐屏截图核，"代码里有"不算。
- ❌ **不做**：T11 不再按 `access_source` 证据强度加设 is_active 闸门；分档只看 spec §12 内容完备度。

---

## 1. 字段级总表（对照 mountain-content-spec）

图例：必需=spec 一票否决 / 建议=强烈建议补齐 / 可降级=缺失优雅隐藏

| 字段 | spec 定级 | 账本覆盖 | 渠道/自动化 | 需人工？ | 缺失降级 |
|---|---|---|---|---|---|
| 名称 name | 必需 | 100% | 账本直取 | 否 | 无（硬） |
| 省份 province | 必需 | 100% | 账本直取 | 否 | 无（硬） |
| province_code | 必需(建库) | 派生 | `PROVINCE_CODE_MAP` | 否 | 无 |
| 海拔 altitude | 必需 | 97%(缺9) | 账本+回填 | 少量 | 无（硬） |
| 难度 difficulty | 必需 | 账本0%/**源头100%** | seed-catalog join+映射 | 映射规则确认 | 无（硬） |
| min_license | 必需 | 派生 | 由 difficulty 映射 | 映射确认 | 默认 none |
| 坐标 lat/lng | 必需(建库) | 95%(缺19) | 账本+回填 | 少量 | 无（建库硬约束 NOT NULL） |
| 主图 cover | 必需 | 图片线 | 飞书选图导入 | 用户选 | 渐变占位/默认图 |
| 简介 description | 必需 | 96%(一句话) | 按梯度重写 | 抽检 | 整段隐藏 |
| **风险提示** | **必需** | **0%** | 难度分级模板 | 模板评审 | ⛔无（一票否决） |
| **路线参考** | **必需** | ≈0% | 路线名+说明+声明 | 抽检 | ⛔"完全为空"即否决 |
| 距离 length_km | 建议 | 344 有值 / 15 NULL | 账本入库(标未核验) | 否 | **NULL 显 `--`；expert 不展示·永不套公式** |
| 时长 estimated_duration_minutes | 建议 | 258 有值 / 101 NULL | 往返距离+2.0km/h(仅初/中级) | 类别规则 | **整小时区间；高阶/专家显 `--`** |
| 爬升 gain | 建议 | 低中难度量级估算 | altitude×0.68 + 320m 下限 | 否 | **显式标「估算」；高阶/专家显 `--`** |
| 点位 waypoints | 建议 | 0% | 两步路/六只脚(评估) | 是 | 模块隐藏 |
| 天气 weather | 建议 | 引擎已建/无cron | 挂 cron | 否 | 重试卡 |

---

## 2. 任务清单（做一个勾一个）

### Part 1 — 收口"已有" + 修管道 + 上到达标线

> **S1（T1+T2+T3）已完成并经 Claude 一手核 PASS（2026-07-25）**：enrichment sidecar 359 行、byte-identical、97/97 测试、冻结 SHA 未变；坐标 seed340/authority13/curated6/missing0、海拔 authority8/涠洲岛 route_highpoint_missing、难度 359 全映射（含 2 复合）、时长 269 生成 0 违规 0 公式错、verified=0。产物：`ledger/effective-canonical-enrichment.jsonl`。

**数据补齐（离线，改的是账本/派生文件，不碰生产）**
- [x] **T1 名峰坐标/海拔回填（20 唯一实体）** — ✅ 13 GNS + 6 curated + 8 官方海拔，全过 bbox，provenance/CAS 闭包
  - 范围：19 缺坐标 + 9 缺海拔（重叠 8）；K2/南迦巴瓦/卡瓦格博/玉龙雪山/稻城三神山/念青唐古拉…
  - 做法（Codex S1 plan 已定稿·PASS）：**旧卫峰/子峰值全被 conflict/unverified/withheld 阻断，不提升**；坐标走 NGA GNS 精确记录，海拔走中国官方/体育总局/省自然资源厅；每条过省界 bbox sanity + 保存 provenance/CAS。GNS 若不可达→按 stop-condition 列 residual，results 复核时再逐条授权同级权威 fallback。
  - DoD：`gps.present=true` 且 `altitude` 非空（或明确 `not_applicable` 如涠洲岛线路）；坐标落省界 bbox 内；provenance 闭包完整。
- [x] **T2 难度回填 + enum 映射** — ✅ 359 全映射（beginner151/intermediate133/advanced43/expert32），min_license 逐档，2 复合按高风险优先
  - 做法：join `seed-catalog.md`（名+省）取 4 级标签 → 映射 `beginner/intermediate/advanced/expert`（映射规则本任务内定稿，涉及 license gating 需产品确认）。
  - DoD：359 座 difficulty ∈ 枚举，0 缺失；映射表留档。
- [x] **T3 距离入库 + 时长（仅日徒步）+ 信任标签** — ✅ 距离 341 platform_sourced / 18 隐（含泰山·五台山·武功山，待 S2 补）；时长 269 生成·高峰全 null；route_semantic 全解析
  - 距离：`length_km` 用账本 341 源值，`source_class=平台来源`（8264/两步路，保留往返/单程语义），标"未逐山核验"；18 座残留 null（不乱选）。
  - 时长：**仅 beginner/intermediate** 且 length 为往返/环线时，按"往返距离÷配速(4.0/3.0)、向上取整30min"估，标 `estimated`；**advanced/expert 一律 null**（技术/多日，估小时数=误导）；禁读海拔。
  - 爬升：v1 不生成（无真数据）。
  - DoD：341 有 `length_km`+来源标签、18 null；时长仅初/中级日徒步非空、高峰 null；公式与类别规则留档。
  - ⚠️**登记 S2**：18 座 length=null 含 **泰山/五台山/武功山** 等旗舰山，届时 UI 隐藏距离——S2 人工选定唯一 canonical 路线长度补上，优先旗舰山。
  - ✅ **S1.3 修正（已核）**：撤销"最长即代表"对多线歧义山的自动提升。多线 6 座山体级距离+时长置 null、转 per-route 保存（玉珠峰北坡18/南坡16、贺兰山阿左旗16/苏峪口12、雾灵山南门15/北门12、芦芽山涔山12/正门10、黄岗山桐木12/篁村12、雨崩冰湖·神瀑各自往返）；仅保留 4 座已验证代表线（五台山大朝台环线50、武功山发云界穿越18、西岭登山线25、天堂寨正门往返10/5h）。配速改 2.0km/h（用户实走校准），距离>16km 不估时长。**独立复现：多线仍留山体级距离的漏网 = 0。**
- [x] **T4 简介重写（一句话人文优先）** — ✅ 359 条一句话，26–45 字，钩子先行、海拔不领头；INTRO-3 两条待核（天华山"东北小黄山"、轿顶山"贡嘎全景"）经查**源 desc 本就含有**，保留正确
  - ⚠️ 已知局限：`added_claims` 只申报了安全/路线增补（64 条），**未申报世界知识来的山头名**（如 花果山→玉女峰、井冈山→五指峰、白云山→摩星岭）。抽检可核者全部属实，但审计轨迹在这一类上不完整 → 转 T11 抽检覆盖。
- [x] **T5 风险提示（难度分级模板 + 固定声明）** — ✅ 359/359 非空，4 档模板，末尾固定"仅供参考"声明
  - 🔒 **安全红线（S1.3 立 / S1.4 修正）**：**简介只做减法**——禁淡化风险词（最友好/容易/轻松/入门/亲民/说走就走…），**但不得加门槛/许可/资格话术**。简介是描述山峰本身的，"能不能登、该不该登"不在这一层表达。独立宽口径扫描 75 座 advanced+expert：淡化词命中 0（原病灶慕士塔格"最友好的雪山之一"、玉珠峰"入门级雪山"已改）。
  - ❌ **S1.3 规则错误（我的责任，S1.4 已撤）**：原 SAFE-1 写成"须传达门槛（许可/…）"，把用户"别把 7546 米说得像轻松能上"（=别吹）误译成"必须写明法律要求"（=加料），导致 70 条简介出现许可话术，其中 **10 条源无许可事实**（卡瓦格博/南迦巴瓦/稻城三神山/玉龙雪山等，源 desc 为 null，整句由难度枚举生成）、**39 条把源"可办理"抬成"须办理"**（语义反转）。**卡瓦格博尤为严重：该峰 2001 年云南立法禁攀，写"办理正规手续"是说反了。**
  - 🔒 **门槛信息归属**：一律下沉到 T5 风险提示，且措辞为"请自行向当地主管部门与专业机构确认"，**不断言法律事实**（与已锁口径一致：`min_license` 是经验等级，非政府许可）。
- [x] **T6 路线参考文字（路线名 + 说明 + 声明）** — ✅ 359/359 非空
  - ✅ **D10（2026-07-27）**：卡瓦格博、南迦巴瓦、年保玉则、念青唐古拉、仙乃日、夏诺多吉、央迈勇、雅拉雪山、玉龙雪山 9 座以准入事实写入「禁攀/无人登顶/无可核实公开攀登路线」说明；没有虚构入口、里程或攀登路线。确定性覆盖：`data/mountains/d10-route-note-overrides.json`，生产回读 9/9 非空。
- [x] **T6b 攀登准入状态 `access_status`（S1.4 新增·安全字段）** — ✅ 2026-07-25 完成；`open347 / closed7 / unknown4 / pilgrimage_only1`，证据 `data/mountains/ledger/effective-canonical-enrichment.jsonl`
  - 缘起（用户提，2026-07-25）："不能给用户一种错觉，觉得冈仁波齐说登就能登，但实际上是登不了的。" 反查后确认这是**字段缺失**，不是文案问题。
  - 现状证据：75 座 advanced/expert 中 **65 座源数据明写"可办理/需官方登山许可"**（真开放峰）；**10 座源 desc 全空**（卡瓦格博·仙乃日·央迈勇·夏诺多吉·玉龙雪山·年保玉则·南迦巴瓦·念青唐古拉·雅拉雪山·玉珠峰），却被一律标成 `advanced 高海拔进阶目标` + "办手续就能去"。**冈仁波齐源 desc 明写"主峰禁止攀登"，但该事实未传递到任何用户可见字段**（简介/路线都只写了 52km 转山环线，本身正确）。
  - 🔑 **字段设计（用户 2026-07-25 拍板的二分，已简化）**：核心只区分**「能登（会周期性封山）」vs「完全不能登」**，后者再分政府要求 / 宗教约束两个层面。
    - `access_status` 枚举（4 值）：
      - `open` — 能登，按当地规定办手续；**默认即隐含"存在周期性封山期"**
      - `pilgrimage_only` — 主峰不能登，但有成熟转山/朝圣环线（冈仁波齐）
      - `closed` — 完全不能登
      - `unknown` — 证据不足（**默认值**）
    - `closed_basis`（仅 `closed`/`pilgrimage_only` 用）：`regulation`(政府法规/公告) / `religious`(宗教约束) / `both`
    - `access_source`：可引用来源 URL 或文件名；`access_note`：给用户的一句话
  - ❌ **不做的**（用户点破，避免造假数据）：
    - **不为"周期性封山"建每座山的状态位**——封山是**动态行政指令，我们拿不到**，建了就是假数据（与距离/时长套公式同一种错）。**只要能登的山都会周期性封山，连五台山也是**，所以它是**全局固定声明**，不是逐山字段：诚实地说"存在封山期、出行前须向当地主管部门确认开放指令"，但不假装知道具体日期。
    - **撤销 `de_facto_closed` / `permit_required` / `restricted` 三个档位**（我上一版加的）：`permit_required` 并入 `open`（所有能登的中国山峰都要审批，属全局共性）；南迦巴瓦/念青唐古拉主峰那种"法律没禁但 33 年仅一次登顶"**是难度问题不是准入问题**，已由 `expert/advanced` + 无 route_note 表达，再造准入档位等于替监管部门断言不存在的法规。
  - 🔒 铁律：**默认 `unknown`**，仅在有可引用依据时才置具体值（同坐标 `curated_canonical` 模式）。**非 `open` 一律不得以"攀登目标"呈现**——安全靠默认值兜底，不靠文案。
  - DoD：359 座有 `access_status`；非 `unknown` 的每条带 `access_source`；冈仁波齐"主峰禁止攀登"进用户可见字段；10 座空 desc 神山不再显示为可攀登目标；全局封山声明进固定免责区。

**修管道（工程，Codex 执行）**
- [x] **T7 DB Migration A（schema + readable RLS）** — ✅ 2026-07-27 apply + 回读完成
  - 证据：`supabase/migrations/20260726170147_s3a_mountain_import_prep_r5.sql`、`output/s3a-r5-import-evidence/production-import-report.md`。
  - 含新列、`is_readable NOT NULL DEFAULT false`、legacy 18 行 readable 回填、RLS 改为 `is_readable=true`、`is_active DEFAULT false`、`altitude DROP NOT NULL`；不含 precheck/activation trigger。
- [x] **T8 province_code / min_license 派生** — ✅ 2026-07-27，359 座两字段非空且合枚举
  - 证据：`output/s3a-r5-import/dry-run-summary.json`、`output/s3a-r5-import/import-plan.json`。
- [x] **T9 一次性导入脚本（ledger → mountains upsert）** — ✅ 2026-07-27，359 canonical 已入库且全部显式 `is_active=false / is_readable=false`
  - 证据：`scripts/mountains/s3a-import.mjs`、`output/s3a-r5-import-evidence/production-import-report.md`。
  - 18 行 legacy reconciliation 保留生产原坐标；导入采用 `effective_canonical_key` 幂等 upsert。
- [x] **Migration B activation guard**
  - 文件：`supabase/migrations/20260727165934_s3a_mountain_activation_guard_r5.sql`（与生产 ledger 版本对齐）。
  - 状态：未 apply；须在内容验收与激活前独立执行 precheck，当前不得提前部署。
- [x] **T9b UI 诚实显示（去假公式兜底）** — ✅ 用户 2026-07-27 视觉验收 PASS；commit `c9c17cd`（未 push）
  - 状态：代码、focused tests、375px 证据与用户视觉验收均完成。
  - 四格 StatTile 不删：距离仅用真实 `length_km`，NULL=`--`；爬升仅 beginner/intermediate 显系数估算并标「估算」；时长仅用 `estimated_duration_minutes` 生成整小时区间；三类缺值均不挂 count-up。
  - Explore 长度筛选只用真实非 expert 距离；NULL/expert 只留在「全部」，不归入短/中/长；难度 chip 仍只由 difficulty 驱动。
  - 非开放状态在现有「这座山适不适合你」透传完整 `access_note`，主 CTA disabled；`pilgrimage_only` 仅说明转山，不给登顶引导。
  - advanced/expert 的 `risk_note` 全文进入现有「天气与路线仅供决策参考」，并机械保证含「自然保护区核心区及未开发未开放区域禁止擅自进入」「开放范围以当地最新公告为准」。
  - `poster/route.ts` 不改：`deriveDemoMetrics` 仅 demo 分支；实测 checkin/trek_session 字段不动。`src/lib/community.ts` 的休眠公式登记为范围外残留。
  - 证据目录：`output/t9b-acceptance/`（8 张 375px 截图 + `t9b-dom-evidence.json` + `DEVIATION.md`）；focused spec：`tests/e2e/t9b-honest-mountain-display.spec.ts`。
- [x] **T10 图片入库** — ✅ 2026-07-27 完成，359/359 cover、519/519 Storage 对象与 license manifest
  - **飞书终态（已一手核）**：用候选图 210 座 + 用自备图 149 座 = **359/359 有图，共 519 张，缺图 0**；张数分布 单图218/双图122/三图19；跨山重复用图 0 组；禁代表图名单 32 座 0 误用；悬空选择 0 残留。
  - **轮播已就绪，无需剔图**：详情页已有 `mountain-hero-carousel`（>1 张出圆点），取图逻辑 [mountain-media.ts:23](src/lib/mountain-media.ts:23) = `[cover_image, ...gallery_images]` 去重取前 3；我们最多 3 张 → 零截断。**第一张即主图**（用户确认"默认第一张"即可）。
  - **入库做法**：飞书附件是带鉴权的 `file_token`（`https://open.feishu.cn/open-apis/drive/v1/medias/<token>/download`），**不能直接写进库**。需 ①用 tenant token 下载 ②传 Supabase storage ③取 public URL ④首张→`cover_image`、其余→`gallery_images`（保持飞书内顺序）。
  - **示意图口径**：159 座 `image_is_illustrative=true`，含自备图 149 座/200 张 + 区域代表图 **10 座/11 张**，两组零重叠；布喀达坂峰/解同速松峰已移出代表图。
  - **传输与压缩**：按 1→20→359 分级上传，344 条不可见 canonical 在前、15 条可见 legacy 在后；每张 public URL 回读核 SHA-256 / Content-Type / Content-Length。`tianhua-shan#1` 12,240,570→2,127,160 bytes、`wutaishan#1` 16,836,294→1,416,354 bytes，均保持原像素尺寸并转 WebP quality 90。
  - **署名回收**：200 张自备图记 `user_supplied/user_owned`；319 张公开候选图中 33 张以原始字节 SHA 精确恢复（10.34%），286 张未可靠回溯、涉及 193 座，完整保留在失败清单；未猜测作者，未发现已确认 NC/ND 许可。当前 15 条 active/readable legacy 的 26 张图中有 18 张 unresolved，涉及 11 座；对象可技术读取，但不得把它们表述为署名/许可已闭环。
  - **最终对账**：359 cover；141 座 gallery/160 张；519 条 license manifest；519 个 `catalog/` 路径精确匹配；11 个历史 Storage 对象未变；`is_active/is_readable` 前后逐键一致。黄山/华山/五台山详情页 HTTP 200，HTML 中 1/2/3 图顺序与 manifest 一致。
  - **P1 真实回读复验（2026-07-27）**：修正 `--verify` 后重新下载 sidecar 绑定的 **519/519** 个 public object、合计 **293,012,636 bytes**，逐个核 SHA-256 / Content-Type / Content-Length / 实际字节数，全部一致；瞬时 transport / 429 / 5xx 采用有限重试。此项为本次真实下载证据，不沿用 checkpoint 的历史 `verified` 标签。
  - **证据**：`data/mountains/photos/t10-photo-assets.jsonl`、`t10-image-attribution.jsonl`、`t10-attribution-unresolved.jsonl`、`t10-db-image-snapshot.json`、`t10-ingest-checkpoint.json`、`t10-ingest-summary.json`；下载/准备文件在 `output/t10-photo-work/`。
  - **2026-07-28 增量换图完成**：按用户解除的数量门，11 座以飞书实际自备图数量替换，共 **19 张**（首张 cover、其余 gallery，单座不超过 3 张）。当前飞书 manifest SHA=`6dafe46780262cd404af0dee8e1c50a3e2fde50068f27c628273ccebc5e392ff`，仍覆盖 359 座、516 张、file token 零重复/零缺失；相对旧 manifest 的另外 4 条飞书选择变化只进入当前 manifest，未纳入本次生产写入。
  - **增量写入证据**：19 个新稳定路径均以 `upsert:false` 上传，并从 public URL 重下载核 SHA-256 / Content-Type / Content-Length / 实际字节数，合计 **11,801,124 bytes**；旧 18 个已挂接候选图对象逐一回读一致并保留，未删除。11 行逐座写入后立即回读，`is_active/is_readable` 全部保持 `true/true`，未激活任何新山峰。
  - **增量最终对账**：359 cover；142 座 gallery/161 张；`image_is_illustrative=true` **170 座**；15 条 active/readable 行的未闭环署名为 **0 张 / 0 座**。冻结证据为 `t10-replacement-20260728-assets.jsonl`、`t10-replacement-20260728-snapshot.json`、`t10-replacement-20260728-checkpoint.json`、`t10-replacement-20260728-summary.json`；脚本支持只依赖冻结 snapshot/checkpoint 的精确 rollback。
  - 📌 **D11**：seed 0dp 的 17 座坐标误差约 ±111km，本轮不补、T11 必须排除激活；首发候选上限 **342 座（359−17）**。

- [x] **T13 坐标补齐管线（S3-A R5 审计暴露·2026-07-26 用户选定方案 B）** — ✅ 2026-07-27 收口
  - **根因**：359 座坐标绝大多数是 `seed_literal` 且精度极低——`0dp 31 座(≈111km)` / `1dp 213 座(≈11km)` / `2dp 70 座(≈1.1km)`；仅 38 座可信（`authority 5-6dp` 13 + `seed 4dp` 25）。而 [trek-verify-helpers.ts:265](src/lib/trek-verify-helpers.ts:265) **直接用 `mountains.latitude/longitude` 作登顶圆心**配 `summit_radius_m` 判定，无 waypoint 兜底 → **244 座上线即核验必坏**（用户站在真山顶会被判 `outside_summit_radius`）。
  - **为何此前未暴露**：前序全部精力在内容层（简介/风险/路线/图片/access），坐标一直被当作"已有字段"，直到 R4 算华山位移（5.35km）、R5 做语义×精度交叉统计才翻出。**本条线最大盲区。**
  - **方案选型**：A（只上 38 座）→ 撑不起山峰库，否决；C（诚实降级不做核验）→ 244 座失去核心玩法；**B（补齐真坐标）= 用户拍板**，技术可行（现有 13 座 6dp 即 GNS 来源）。
  - 🔒 **B 覆盖不了的部分仍需 C**：`route_corridor` 11 座（雨崩/虎跳峡/徽杭古道等）与部分 `mountain_area` 44 座本质无单一登顶点，最终态 = **B 补峰 + C 降级走廊/区域**。
  - ⚠️ **头号陷阱 GCJ-02**：高德/百度/天地图返回 GCJ-02/BD-09，与设备 GPS 的 WGS-84 差 100–700m，**恰好是 summit_radius 量级**，混入会静默毁掉核验且极难察觉。**WGS-84 only**。
  - ✅ **现成 ground truth 验证集**：生产 18 座手工 4dp 坐标 + 13 座 authority 坐标 = **31 座已知答案**，先用它们验管线精度，达标再跑其余。
  - ✅ **实际结果（2026-07-27 收口，用户拍板终止继续找坐标）**：`resolved 226 / 359`（summit 157 + area 69），源贡献 OSM 160 / GNS 108 / GeoNames 94 / Wikidata 67（重叠）。
  - ⛔ **走过的弯路（教训）**：先花了 5+ 轮搭"自建采集管线 + gold set + 分层抽样冻结 + SHA 绑定链 + DEM 局部极大值"的**验证体系，却一次采集都没跑**。用户以「种树 vs 买木料」点破：我们要的是一份数据，不是一套系统。**全部作废后直接取数，一轮拿到 124 座、二轮 226 座。**
  - ⛔ **gold set 路线证伪**：31 座验证集里 13 座源自 GNS（而 GNS 是管线主源，自证循环）、18 座生产坐标中 6 座是「度分格点伪装成 4 位小数」（真精度 1.85km）、legacy 升格 0/18；剩下能验峰顶的只有 7 座世界级高峰（K2/南迦巴瓦等），**在 K2 上验的准确率无法外推到 382m 小山**。
  - ⛔ **外部 AI 渠道到顶**：两轮共问 80 座，**坐标产出仅 ~10%**，且**出处系伪造**（30 个 peakbagger 链接中 14 个可打开，全部指向美国山峰；第二轮换 peakwiki.org 疑似同一模式）。真实原因：**中国官方资料只公布海拔、不公布主峰顶点经纬度**，属结构性限制。**但其「主峰名/别名」信息有效**（乌蒙山→小韭菜坪，按此名检索 OSM 差 6.5m）。
  - 🔑 **最终上线方案（不改文案、不改核验逻辑，纯数据）**：用 `summit_radius_m` 分档吸收坐标误差 —— summit 157→300m / area 69→2km / seed 3dp 8→300m / seed 2dp 26→2km / seed 1dp 82→15km / **seed 0dp 17 座不上架**。**上线 342 座**。用户定调：「用户来都来了，不让他验证很蠢；差一两公里又能怎样」。
  - 📌 **已登记未做**：①17 座 ±111km 待补 ②两步路/六只脚/8264 实测轨迹作坐标源（真人 GPS 登顶记录，理论最优，属独立工程）。
  - 证据：`data/mountains/coordinate-fix/t13-final-coordinate.jsonl`、`data/mountains/coordinate-fix/T13-CLOSEOUT-REPORT.md`。

**上线门禁 + 验收**
- [x] **T11 质量分档 + is_active 决策** — ✅ 2026-07-28 完成
  - **海拔冲突消解**：仙乃日 `5998.5→5999`、央迈勇 `6033.0→6033`、夏诺多吉 `5951.3→5951` 按用户裁定的自然资源部 2023 值；阿尔金山主峰采用甘肃省人民政府公开资料 `5798m`；涠洲岛火山地貌游览线采用广西壮族自治区海洋局公开的岛体最高海拔 `79.6→80m`。精确值写 `altitude_m_exact`，原冲突数组保留在 `field_review_status.altitude_resolution`；冻结账本未改。
  - **T10 manifest 同步**：贡嘎嘉子峰 / 贡嘎日乌且峰 / 贡嘎小贡嘎峰各改挂 1 张用户自备图，公盂岩改挂候选 2；4 个新对象逐个从 public URL 重下载核 SHA / size / MIME，旧 8 对象保留。最终 359 cover、138 座 gallery / 157 张 gallery、173 座示意图，4 行 `is_active/is_readable` 写前后均为 `false/false`。
  - **Migration B**：生产 ledger `20260727165934_s3a_mountain_activation_guard_r5`；apply 前 15 条 active 行 blockers=0。apply 后回读 function + `BEFORE INSERT OR UPDATE` trigger 存在，持续守卫 `is_active ⇒ is_readable + altitude + cover + description + risk_note`。前向 migration `20260727184640_s3a_activation_route_note_and_altitude_provenance.sql` 已 apply，追加 `route_note` 持续守卫，并对齐阿尔金山、涠洲岛与稻城三神山的公开海拔 provenance URL。
  - **§12 与分档**：359 座机械逐行核 cover / description / risk / route / altitude；内容闸门 blockers=0。当前 canonical 均无 `mountain_waypoints`，故 342 座按 spec §8 记 B / `needs_review`（缺点位但 UI 可隐藏），D11 的 17 座记 C / `blocked` 且保持不可见；署名不作上线闸门。
  - **分批激活**：排除既有 15 座后，按 checkpoint 执行 `1 + 19 + 307`，累计新增 327，最终 canonical active/readable `342/342`；全表 active/readable `342/345`（额外 3 条为历史保链 legacy）。阶段 1 阿尔金山主峰、阶段 2 首尾哀牢山/笔架山生产详情均 HTTP 200 且 HTML 含山名。
  - **最终分布**：难度 beginner 148 / intermediate 129 / advanced 34 / expert 31；准入 open 330 / closed 7 / unknown 4 / pilgrimage_only 1；trigger + §12 违规 0。17 座 D11 均 blocked、exposed=0。
  - **证据**：`data/mountains/t11-altitude-overrides.json`、`data/mountains/t11-quality-decisions.jsonl`、`data/mountains/t11-activation-snapshot.json`、`data/mountains/t11-activation-checkpoint.json`、`data/mountains/t11-activation-summary.json`、`data/mountains/photos/t11-image-sync-assets.jsonl`、`data/mountains/photos/t11-image-sync-snapshot.json`、`data/mountains/photos/t11-image-sync-checkpoint.json`、`data/mountains/photos/t11-image-sync-summary.json`；执行脚本为 `scripts/mountains/t11-quality-activation.mjs` 与 `scripts/mountains/t11-image-sync.mjs`。
- [ ] **T12 生产验收（用户人工 + Claude 一手核）**
  - DoD：抽样 N 座详情页/卡片截图：真距离(非公式)、真简介、风险/路线非空壳、无假数字；用户 PASS。

### Part 2 — 增强（不阻塞 v1，Part 1 收口后排）
- [ ] **T13 天气分层 + cron**：按名气/海拔定 `weather_priority_tier`（S/A/B/C）；挂 Vercel cron 打 `/api/weather/refresh-batch`（需 `WEATHER_REFRESH_SECRET`；QWeather key 可选，无则走免费 Open-Meteo）。
- [ ] **T14 轨迹/点位渠道评估**：评估两步路 / 六只脚 作为 `mountain_waypoints`+路线图来源（可行性/合规/抽取成本），先出评估再定做不做。
- [ ] **T15 深度内容迭代**：简介扩写至 spec 60–120 字、真风险、真点位——按覆盖优先序（省域锚点/常搜/高视觉/新手友好/代表高海拔）分批。

---

## 3. 渠道 × 拿不拿得到 × 需要你做什么

| 缺口 | 机器能自动拿到？ | 需要你做什么 |
|---|---|---|
| 坐标/海拔回填、难度、距离、时长 | ✅ 能 | 无（机器包） |
| 简介一句话重写 | ✅ 能(AI+规则) | 抽检认可梯度 |
| 风险提示、路线说明 | ✅ 能(模板/AI) | 认可模板口径 |
| DB 加列 + 导入 | ✅ 工程 | 开 Supabase 权限/确认（Codex 插件走） |
| 图片 | 你那条线 | 飞书选图 + 32 座自备/AI |
| 天气 cron | ✅ 工程 | Vercel 权限 + secret（QWeather key 可选） |
| 真轨迹/点位 | ⚠️ 需评估两步路/六只脚 | 若走：可能需账号/授权确认 |

---

## 4. 变更同步（纪律）
- 任何放宽 spec（如简介一句话）→ 在 `docs/mountain-content-spec.md` 标 v1 放宽。
- 涉及地图/天气 → 同步 `docs/map-weather-brief.md`。
- 每个 Codex sprint 严格串行；UI/内容改动验收 PASS 前不 push。
