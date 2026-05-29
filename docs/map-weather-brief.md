# Peak Trekker 地图与天气方案简报 v0.3

## 1. 文档目标

本文件用于明确 Peak Trekker 当前阶段的地图与天气能力边界、技术选型、缓存策略、降级策略和上线前实施路径。

本文件回答的是：

* 地图和天气在产品中到底承担什么角色
* 在接近 400 座山峰覆盖规模下，如何保持成本可控
* 如何避免被带向重导航赛道
* 如何在“可上线、可控、符合主线”之间取得平衡

---

## 2. 一句话结论

当前阶段正式方案为：

* **地图**：MapLibre GL JS + PMTiles / Protomaps 自托管 OSM 衍生底图 + 业务 GeoJSON 叠加
* **影像补充**：天地图影像层仅作为可选卫星 / fallback 图层
* **天气**：QWeather 作为生产主源
* **天气备份**：Open-Meteo 作为开发 / 对照 / fallback，不作为正式生产主源

---

## 3. 产品边界

## 3.1 地图职责

地图在当前阶段只承担：

* Mountain Detail 的静态路线参考
* Trek 页的轻量记录辅助
* Activity / Share 的路线快照辅助
* 关键点位和路线理解辅助

地图不承担：

* 专业导航
* 离线导航
* 路径纠偏
* 重地图交互中心
* 城市级地图产品体验

## 3.2 天气职责

天气在当前阶段只承担：

* 出发前轻量决策提示
* Detail 页的简单天气状态说明
* 记录前的辅助判断
* FAQ 中的能力说明与边界说明

天气不承担：

* 专业天气产品承诺
* 高精度复杂气象分析
* 全天候实时专业告警中心
* 独立天气产品体验

---

## 4. 地图最终方案

## 4.1 主渲染引擎

**MapLibre GL JS**

原因：

* 开源
* WebGL 渲染
* 性能与样式控制更适合现代 Web 地图
* 支持 GeoJSON source
* 后续可接路线、点位、轨迹、静态快照等能力

## 4.2 主底图

**PMTiles / Protomaps 自托管的 OSM 衍生底图**

原因：

* 不依赖 OSM 公共瓦片服务
* 可控
* 适合放在对象存储 + CDN 上
* 后续可按区域裁剪
* 更适合 Web 产品长期维护

## 4.3 业务叠加层

**自有 GeoJSON / 数据库输出的路线与点位层**

包括：

* 山峰位置
* 路线参考
* 关键点位
* 活动轨迹快照
* 后续 GPX 导入后的轨迹可视化

## 4.4 可选影像层

**天地图影像层**

角色：

* 中国区卫星图补充
* 某些 Detail / Trek 场景下的环境理解
* fallback layer

边界：

* 不作为主底图
* 不成为整套地图系统的核心依赖
* 只在真正需要卫星图时再接入

---

## 5. 地图页面形态

## 5.1 P0 页面分工

### Mountain Detail
以**静态路线参考图**为主。  
不优先做重交互地图。

### Trek
允许存在一个**轻量交互地图**，用于：

* 当前记录状态辅助
* 当前点位 / 路线参考
* 轻量位置理解

### Activity Detail
优先展示**静态轨迹快照图**，不是完整交互地图。

### Share Engine
优先使用**静态路线 / 轨迹快照**，不直接把交互地图塞进分享素材。

### Explore / Community
不引入重地图交互。  
卡片中只保留必要的路线 / 轨迹表达，不把地图抢成视觉中心。

---

## 6. 地图工程规则

## 6.1 不直接使用 OSM 公共瓦片作为正式生产底图

原因：

* 生产稳定性不可控
* 使用政策有限制
* 不适合作为正式产品长期依赖

## 6.2 坐标体系

当前阶段建议：

* 数据库存储统一使用 **WGS84**
* 浏览器 Geolocation 结果按 WGS84 处理
* MapLibre 主底图链路按 WGS84 统一

只有在后续明确接入国内商用底图 / 影像且发生混用时，才引入单独的坐标转换逻辑。

### 当前建议
P0 先不要把 GCJ-02 / WGS84 / 其他坐标系混在一起。  
先把主链路统一，避免额外复杂度。

## 6.3 路线与点位优先走业务层

不要把路线理解完全依赖底图。  
产品真正需要的是：

* 山峰本身的位置
* 参考路线
* 关键点位
* 风险说明

这些都应优先由业务数据控制，而不是交给地图 SDK 自己生成。

---

## 7. 天气最终方案

## 7.1 主天气源

**QWeather（和风天气）**

### 选择原因

* 中国区可用性更稳
* 适合正式产品使用
* 当前免费请求额度足以支撑 MVP
* 后续可平滑进入按量付费
* 适合山峰对象做缓存读取

## 7.2 备份 / 开发天气源

**Open-Meteo**

### 角色
* 开发环境
* 对照源
* fallback 源
* 模型验证辅助

### 边界
* 不作为当前正式生产主源
* 不在正式产品中承诺依赖其免费 non-commercial API 长期在线

---

## 8. 天气服务架构

## 8.1 基本原则

前端**不直接请求第三方天气 API**。  
统一由服务端请求第三方，再写入缓存表，由前端读取平台自己的标准化数据。

## 8.2 建议的服务结构

### Weather Provider Adapter
负责抽象第三方 provider：

* `qweather`
* `open_meteo`

### Weather Service
负责：

* 读取山峰坐标
* 选择 provider
* 刷新缓存
* 标准化字段
* 输出前端可直接消费的数据结构

### Weather Cache
负责按山峰热度分层缓存天气结果，避免每个用户都直接打第三方接口。

---

## 9. 400 座山下的缓存策略

## 9.1 原则

当山峰覆盖扩大到接近 400 座时，**不能采用“每座山每小时刷新一次”的策略**。  
QWeather 免费额度必须优先保障：

* 热门山峰
* 当前访问中的山峰
* Detail 页的核心天气展示
* 异常重试与缓存失效兜底

### 核心策略
采用：

* **热度分层**
* **按需回源**
* **stale-while-revalidate**
* **后续 weather zone 复用**

---

## 9.2 第一阶段缓存层级（按 mountain_id）

### S 层：核心热门山
适用对象：

* 首页 / Explore 高频露出山
* 当前季节最热门山
* 近期访问量最高的山
* 当前运营重点山

#### 刷新频率
**1 小时**

#### 数量建议
**20–30 座**

---

### A 层：常规活跃山
适用对象：

* 有稳定访问
* 某些省域核心山
* 近 7 天持续有人查看的山

#### 刷新频率
**6 小时**

#### 数量建议
**60–100 座**

---

### B 层：长尾已上线山
适用对象：

* 已收录
* 访问量低
* 作为覆盖完整度存在

#### 刷新频率
**24 小时**

#### 数量建议
**200–300 座**

---

### C 层：冷门 / 新增 / 未命中缓存山
适用对象：

* 刚录入
* 很少访问
* 很久没人看
* 非热点山

#### 刷新策略
**不做定时预热，只在用户访问时触发请求**

#### 缓存时间
**24–48 小时**

---

## 9.3 推荐配比（400 山版本）

推荐先按以下配比落地：

* **S 层：25 座，1 小时刷新**
* **A 层：75 座，6 小时刷新**
* **B 层：250 座，24 小时刷新**
* **C 层：其余按需**

### 估算请求量

#### S 层
25 × 24 × 30 = **18,000 / 月**

#### A 层
75 × 4 × 30 = **9,000 / 月**

#### B 层
250 × 1 × 30 = **7,500 / 月**

### 合计
**约 34,500 / 月**

这会预留约 **15,000+ / 月** 的缓冲空间，用于：

* 冷门山首次访问回源
* 异常重试
* 后台校验
* 数据补录
* 少量测试与环境验证

---

## 9.4 返回策略

### 新鲜缓存
直接返回。

### 过期缓存但仍可接受
先返回旧缓存，再后台异步刷新。  
前端展示“更新时间”，不阻塞阅读。

### 完全无缓存
首次同步回源并写缓存，再返回页面。

---

## 9.5 热度升级 / 降级

建议每天或每周跑一次任务，根据最近 7 天的访问数据自动调整：

* 升到 S 层
* 降到 A 层
* 降到 B 层
* 长期无人访问则进入 C 层按需模式

### 热度判断可参考
* 山峰详情页访问量
* Explore 点击量
* 最近是否被分享 / 发布
* 当前是否处于运营推荐期
* 当前是否处于季节高峰期

---

## 9.6 第二阶段优化（按 weather_zone / grid 复用）

当山峰继续扩容后，缓存对象不应长期只按 `mountain_id` 维护。

### 优化方向
从：

* `mountain_id`

逐步升级到：

* `weather_zone_id`
* 或基于地理网格 / 区域中心点的缓存单元

### 目标
让地理位置接近、天气参考价值相近的山峰，共用一份天气缓存，减少重复请求。

### 适用场景
* 同一山系
* 同一景区
* 相邻山峰
* 运营上可归为一个天气区域的山群

---

## 10. GeoAPI 使用原则

## 10.1 不在用户浏览链路里使用 GeoAPI

原因：

* GeoAPI 与天气基础服务共用同一个免费池
* 不应在用户每次打开页面时消耗解析额度

## 10.2 GeoAPI 只用于

* 山峰录入
* 山峰补录
* 后台修正坐标
* 数据清洗和批量导入

## 10.3 运行时页面只读取

* `mountains.latitude`
* `mountains.longitude`
* `mountains.altitude`
* 后续可增加 `weather_zone_id`

---

## 11. 天气返回字段范围（P0）

P0 前端只显示这些字段即可：

* 当前天气状态
* 当前温度
* 风速 / 风级
* 降水概率或降水量
* 今日最高 / 最低温
* 更新时间
* 必要时的简短风险提示

不做：

* 复杂小时级图表面板
* 多模型切换
* 复杂预报对比
* 过度专业化气象术语展示

---

## 12. 数据模型建议

## 12.1 mountains 表（建议补齐）

每座山尽量补齐：

* `id`
* `name`
* `province`
* `latitude`
* `longitude`
* `altitude`
* `difficulty`
* `license_requirement`

### 后续可增加
* `weather_zone_id`
* `weather_priority_tier`
* `weather_enabled`

## 12.2 weather_cache 表（建议新增）

建议至少包含：

* `mountain_id`（第一阶段）
* `weather_zone_id`（第二阶段可选）
* `provider`
* `lat`
* `lon`
* `fetched_at`
* `expires_at`
* `current_weather_json`
* `hourly_summary_json`
* `daily_summary_json`
* `status`

## 12.3 routes / waypoints

路线和点位优先用：

* 数据库存储
* GeoJSON 输出
* 管理后台维护

这样地图只是渲染器，不是业务逻辑源头。

---

## 13. 失败与降级策略

## 13.1 地图失败

当地图资源失败时：

* Mountain Detail 仍应能展示文字版路线说明
* 关键点位仍应能展示列表
* 风险提示仍应可见
* 页面不能因地图失败而崩溃

## 13.2 天气失败

当天气请求失败或缓存不可用时：

* Detail 页天气区可隐藏或降级
* 给出“天气信息暂不可用”的轻说明
* 不阻塞开始记录
* 不阻塞活动与分享主链路

## 13.3 低频山峰的天气降级

对于长尾山峰，允许出现：

* 非小时级更新
* “今日已更新”而非“1 小时内更新”
* 缓存稍旧但仍可读

前提是：

* 页面明确展示更新时间
* 文案中强调“供出发参考”
* 不伪装成实时专业天气

---

## 14. 实施顺序（P0）

### 第一步
锁定本简报与产品边界。

### 第二步
落地天气 adapter + cache 表结构。

### 第三步
补齐 mountains 的 `latitude/longitude/altitude`，尽量避免运行时 GeoAPI。

### 第四步
先接 QWeather 主源，完成 Detail 页轻量天气展示。

### 第五步
地图部分先落地：
* Mountain Detail 静态路线参考图
* Trek 轻量交互地图
* Activity / Share 轨迹快照图

### 第六步
建立热度分层和缓存任务。

### 第七步
把路线、点位、天气、FAQ 文案全部接入产品页与说明页。

---

## 15. 验收要求

## 15.1 地图验收

* 地图只承担轻量参考，不表现成专业导航
* Mountain Detail 有静态路线参考
* Trek 有轻量交互地图或等效参考能力
* Activity / Share 可展示静态轨迹快照
* 地图失败时页面不崩

## 15.2 天气验收

* Detail 页能展示轻量天气信息
* 前端不直连第三方天气 API
* 有缓存表或等效缓存层
* 热门山峰不会重复打爆第三方接口
* 长尾山峰允许更低刷新频率，但必须展示更新时间
* 天气失败时有合理降级，不阻塞主线

## 15.3 边界验收

* 没有把地图能力扩成重导航
* 没有把天气能力扩成专业天气产品
* 没有把实现复杂度拖离当前产品主线

## 15.4 PMTiles per-mountain pipeline

### 15.4.1 本节范围

FU-47(b) 仅落地 Mountain Detail / Activity Detail 对已有 PMTiles 的读取与展示，并产出 per-mountain 生成 pipeline 设计。
不在本 sprint 内执行 300 山峰全量生成、不上传新增 PMTiles、不改数据库 schema。

### 15.4.2 工具链选型

推荐工具链：

* `tippecanoe`: 从每座山的 30km bbox OSM/GeoJSON 切片生成 z=9-12 `.pmtiles`
* `pmtiles`: 校验与 inspect 生成结果
* Node/TS 脚本：从 `mountains.latitude / longitude / altitude` 读取山峰中心点并生成任务清单
* Supabase Storage CLI / SDK：上传到 `map-tiles` bucket

本地安装建议：

* macOS: `brew install tippecanoe`
* CI: 用带 `tippecanoe` 的自定义 image 或在 job 开始阶段安装固定版本
* 所有生成脚本必须输出 manifest，记录 `mountain_id / bbox / zoom / bytes / sha256 / object_path`

### 15.4.3 30km bbox 生成脚本设计

输入：

* `mountains.id`
* `mountains.name`
* `mountains.latitude`
* `mountains.longitude`
* `mountains.weather_priority_tier`

流程：

1. 以山峰经纬度为中心计算 30km × 30km 正方形 bbox。
2. 将 bbox 转换为 WGS84 经纬度范围，保留 6 位小数。
3. 为每座山生成临时裁剪数据。
4. 调用 `tippecanoe` 输出 z=9-12 PMTiles：
   * `--minimum-zoom=9`
   * `--maximum-zoom=12`
   * `--drop-densest-as-needed`
   * `--extend-zooms-if-still-dropping`
   * flavor 使用 dark baseline 对应样式
5. 运行 `pmtiles inspect` 校验 bbox / minzoom / maxzoom / tile count。
6. 写入 manifest，供 review / 上传 / 回滚使用。

### 15.4.4 Supabase Storage 命名与上传

Production naming convention:

```text
basemap/{mountain-slug}-bbox30-z9-12.pmtiles
```

当前 baseline 示例：

```text
basemap/huashan-bbox30-z9-12.pmtiles
```

上传策略：

* bucket: `map-tiles`
* cache-control: `public, max-age=31536000, immutable`
* 上传前先比对 manifest 中的 sha256 与 size，避免重复覆盖
* 新版本若需要替换，优先使用带日期或 hash 的 object path，避免旧客户端缓存错读

### 15.4.5 成本估算

华山 baseline `huashan-bbox30-z9-12.pmtiles` 实测约 649,374 bytes。按 300 座估算：

* Storage: 约 185.8 MiB（仅 per-mountain bbox30 z=9-12 包；FU-52 起不再把 z=7 全国主包计入 production baseline）
* 若每座热门山每月 1,000 次地图打开，单山流量约 619 MiB/月
* 300 山峰不会均匀达到热门访问量；应结合 `weather_priority_tier` 分批生成和监控带宽

### 15.4.6 Cache invalidation

PMTiles object path 一旦被客户端引用，就按长期缓存处理。失效策略：

* 重大底图替换：生成新 object path，例如 `basemap/huashan-bbox30-z9-12-20260601.pmtiles`
* `src/lib/map/map-assets.ts` registry 更新到新 path
* 旧 path 保留至少一个发布周期，避免灰度用户空图
* Vercel 部署完成后用浏览器验证旧 path / 新 path 均不导致页面崩溃

### 15.4.7 FU-51 上线前 checklist

上线前 pipeline 需逐项确认：

* 生成脚本支持 dry-run，不写 Storage
* manifest 可人工 review
* 每个 PMTiles 都有 bbox / zoom / size / sha256
* Storage 上传支持跳过已存在且 sha256 一致的文件
* app registry 只登记 production baseline，不登记实验候选
* Storage 仅保留 production baseline per-mountain 包；FU-52 确认删除 z=7 全国包与 Huashan 实验候选前必须先人工 review 删除清单
* Mountain Detail 对无 PMTiles 山不走全国 z=7 兜底
* Activity Detail 缺 mountain-bbox PMTiles 时走 trace-only（无底图 + SVG fit-bounds trace overlay），不再使用 z=7 背景（见 §15.5.4 v0.3.4）
* 浏览器证据覆盖 PMTiles ok / text fallback / unavailable / Activity trace-only fallback

---

## 15.5 客户端实施 baseline (FU-47(a) 锁定)

本节定义 per-mountain PMTiles 在 Mountain Detail / Activity Detail / Trek 等所有 product surface 的统一客户端实施规范。FU-47(a) Phase 4 已经过 30km bbox × z=9-12 × dark × 1:1 多轮 visual review 并由用户验收锁定；后续 sprint 接入不允许偏离，偏离需在 plan 中显式说明并经用户 PASS。

### 15.5.1 容器与几何

- 容器 aspect-ratio：1:1（CSS `aspectRatio: '1 / 1'`）
- 容器需在 mount 前有可测量尺寸；resize 时必须重新走 fit/lock 序列
- bbox：每座山 30 km × 30 km 正方形，经纬度 envelope 围山峰中心
- bbox 坐标精度:6 位小数

### 15.5.2 视野初始化与锁定序列

MapLibre Map 实例化后必须按以下 9 步执行（FU-47(a) Phase 4 视觉验过的工作顺序，缺一步均会出现视野错位）：

1. `const camera = map.cameraForBounds(bbox, { padding: 0 })`
2. `const rawZoom = camera?.zoom`
3. `const fitZoom = Math.min(rawZoom, asset.maxZoom)`  // 钳制 ≤ asset.maxZoom (= 12)
4. `map.setMaxBounds(null)`                              // 先解锁
5. `map.fitBounds(bbox, { padding: 0, animate: false })` // padding 必须为 0
6. `map.setMinZoom(0)`                                   // 临时置 0
7. `map.setMaxZoom(asset.maxZoom)`                       // = 12
8. `map.setMinZoom(fitZoom)`                             // dynamic 下限
9. `map.setMaxBounds(map.getBounds())`                   // lock post-fit envelope

效果：初始视野精确卡在 30 km bbox 内，用户只能在 `[fitZoom, z=12]` 范围 zoom，pan 拖动不能越过 post-fit envelope。

### 15.5.3 交互模式

product surface 默认全启用以下交互，由用户通过 NavigationControl / 触屏 / 滚轮等方式自由 zoom / pan within envelope：

- `map.scrollZoom.enable()`
- `map.touchZoomRotate.enable()`
- `map.doubleClickZoom.enable()`
- `map.keyboard.enable()`
- `map.boxZoom.enable()`
- `map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')`

NavigationControl 提供原生 +/− 按钮。product surface 由 NavigationControl 唯一承担 zoom UI，**不引入额外的自定义放大按钮**（防止与原生 NavigationControl 视觉冲突，2026-05-28 user 二次验收锁定）。

### 15.5.4 业务叠加层

所有路线 / waypoints / 端点 / pin 必须用 MapLibre GeoJSON source + layer 体系，真实经纬度地理对齐底图。**不允许**用 SVG abstract viewBox overlay 替代（viewBox 抽象坐标不会跟随底图 zoom / pan，会"飘"出真实地理位置）。

最低规范：

- 路线 LineString：`addSource({ type: 'geojson', data: <LineString> })` + line layer
- 端点（起 / 终）：GeoJSON Points + circle layer + symbol label layer
- Waypoints：GeoJSON Points + symbol/circle layer，含 elevation 标签
- 山顶 pin（state b summit-only）：GeoJSON Point + symbol layer（顶峰 + 海拔 label）

**Activity Detail 缺 mountain-bbox PMTiles fallback**：当 activity 关联的 mountain 无 per-mountain PMTiles 或 mountain-bbox PMTiles 运行时失败时，**不再降级到 z=7 全国主包底图**（z=7 全国 bbox 范围过大，trace 视觉比例失真，2026-05-28 user 二次验收明示）。直接走 **trace-only** 模式：

- 深色 topo-like surface + 独立 fit-bounds SVG trace overlay
- 起 / 山顶 / 回营 SVG markers + 3-stat strip 保留
- "仅可预览轨迹" 文案
- 视觉尺寸等同 share poster

z=7 全国主包不作为 Activity Detail 产品 fallback。FU-52 起 `src/lib/map/map-assets.ts` 也不再登记 national z7 包；`/debug/map-prototype` 改用 Huashan per-mountain baseline 验证。SVG fit-bounds overlay 不挂 MapLibre layer 是为了保持分享海报视觉尺寸（若挂 MapLibre layer 会按底图 zoom 比例压成几像素无法分享）。

### 15.5.5 Layer allowlist

basemap 仅保留 24 层（FU-47(a) Phase 4 视觉验过的最小集）：

background, earth, landcover, landuse_park, landuse_urban_green, landuse_beach, water, water_stream, water_river, roads_major_casing_late, roads_highway_casing_late, roads_major_casing_early, roads_major, roads_highway_casing_early, roads_highway, roads_rail, boundaries_country, boundaries, water_waterway_label, water_label_ocean, earth_label_islands, water_label_lakes, places_region, places_locality, places_country

其余 layer 必须过滤。补充新 layer（例如未来加 contour 等高线）必须新开 sprint 走视觉验收，不允许 silently 扩 allowlist。

### 15.5.6 Flavor

- Default：dark（production 锁定）
- Debug override：`?flavor=light|black|grayscale|white`（开发态可切，production 不暴露）

### 15.5.7 Resize 处理

监听 window resize → debounce 100-200ms → 重新走 §15.5.2 全 9 步序列。不允许只 fitBounds 不重设 setMaxBounds（会导致 envelope 与新容器尺寸错位）。

### 15.5.8 PMTiles protocol 注册

每个 MapLibre 实例创建前必须 register pmtiles protocol；跨实例必须共享 singleton 防止重复 register 错误：

```
let pmtilesProtocolRegistered = false

if (!pmtilesProtocolRegistered) {
  const protocol = new Protocol()
  try {
    maplibregl.addProtocol('pmtiles', protocol.tile)
  } catch (error) {
    if (!String(error).includes('already exists')) throw error
  }
  pmtilesProtocolRegistered = true
}
```

### 15.5.9 SSR / Hydration 安全

MapLibre / pmtiles / @protomaps/basemaps 必须 dynamic import 在 client-only boundaries 内，不在 SSR 阶段执行。

任何 query param 驱动的 mode 切换（例如 mock state / forceError）必须在 server 端通过 `searchParams` 提前读取并通过 prop 传给 client，**不允许** client-only `useState(() => readQueryParam())` 在 hydration 后才切换状态（会引发 React hydration mismatch，触发 page error）。

### 15.5.10 Imperative handle / ref

product surface 需要外部按钮触发 zoomIn / zoomOut / fitBounds 时，通过 useImperativeHandle 或 callback ref 暴露 map instance subset（zoomIn / zoomOut / fitBounds）给上层。不允许保留无 onClick 的装饰按钮。

### 15.5.11 偏离声明 (B13 强制)

后续 sprint 实施 PMTiles client 体验时，若需偏离本节任何参数（例如改 padding 非 0 / 改 layer allowlist / 改 interactive 默认值 / 改 fit 序列），必须在 Plan 中显式列偏离点 + 理由 + 视觉对照，由用户在 Plan PASS 阶段决定。silent deviation 等同协议红线违反（codex-risk-behavior-policy B13）。

---

## 16. 对其他文档的联动要求

本简报生效后，需要同步影响以下文档：

### `target-prd.md`
补充：
* 轻量天气按山峰热度分层刷新
* 不承诺所有山峰同频更新
* 长尾山峰可展示较低频缓存天气

### `ui-interaction-spec.md`
补充：
* 天气区必须显示更新时间
* 长尾山天气的降级样式
* 地图 / 天气不抢主 CTA
* 低频天气文案的用户视角表达

### `acceptance-checklist.md`
补充：
* 天气更新时间显示验收
* 热门山 / 长尾山不同刷新层级的验收
* 低频山天气降级不阻塞主线的验收

### `mountain-content-spec.md`
补充：
* `latitude / longitude / altitude` 成为正式基础字段
* 后续可增加 `weather_zone_id`
* 山峰补录时不依赖用户浏览链路 GeoAPI

### `release-priority-matrix.md`
补充：
* 地图 / 天气实现中必须包含缓存分层
* 400 山情况下不再按“全量小时级刷新”假设来估算资源

---

## 17. 本文件的结论

当山峰覆盖扩展到接近 400 座时，地图与天气方案的关键不是“每座山都做高频更新”，而是：

> **地图可控、天气分层、热门优先、长尾可降级、边界清楚。**

Peak Trekker 当前阶段不应该为了“所有山都实时天气”而牺牲主线的稳定性、可控性和上线速度。

### v0.3.6 — 2026-05-29

- FU-52: PMTiles storage baseline 收口为 per-mountain bbox30 z=9-12 包；`china-z7-20260519.pmtiles` 全国包与 Huashan 实验候选进入删除清单，V3 经用户确认后再执行 Storage 删除。
- `src/lib/map/map-assets.ts` 不再登记 national z7 asset；`/debug/map-prototype` 存储估算改为 per-mountain 包 × 山峰数，不再叠加全国主包。
- §15.4.5 / §15.4.7 / §15.5.4 同步：Mountain Detail / Activity Detail / Trek 缺 mountain-bbox 时继续走既有 fallback / trace-only 逻辑，不引入 z=7 全国底图。

### v0.3.5 — 2026-05-28

- §15.5.4 Activity trace-only fallback 文案精简：`底图暂不可用 · 轨迹预览仍可查看` → `仅可预览轨迹`（user 三次验收反馈，更短更直接）。

### v0.3.4 — 2026-05-28

- §15.5.3 product surface 由 NavigationControl 唯一承担 zoom UI；移除"自定义放大按钮必须接 zoomIn"要求（防止与原生控件视觉冲突，user 二次验收反馈）。
- §15.5.4 Activity Detail 缺 mountain-bbox PMTiles 时**不再降级到 z=7 全国主包**，直接走 trace-only（无底图 + SVG fit-bounds trace overlay），视觉等同 share poster。历史上 z=7 全国主包曾仅保留给 debug 场景，FU-52 起已从 active code path 移除。
- §15.4.7 上线 checklist 同步更新：Activity Detail fallback 描述从 "z=7 背景 + SVG overlay" 改为 "trace-only（无底图 + SVG fit-bounds trace overlay）"；浏览器证据清单从 "z=7 fallback" 改为 "Activity trace-only fallback"。

### v0.3.3 — 2026-05-28

- 新增 §15.5 客户端实施 baseline（FU-47(a) 锁定）：沉淀 30km bbox × z=9-12 × dark × 1:1 的 9 步初始化序列 / 5 项交互 enable + NavigationControl / GeoJSON layer 替代 SVG abstract / 24 个 layer allowlist / resize 重算 / PMTiles protocol singleton / SSR-safe query param / imperative handle 等实施规范。FU-47(b) patch v1 起所有 PMTiles client surface 必须严格遵循。
- §15.5.4 当时曾明确 z=7 national fallback 的 SVG overlay 例外；该历史例外已在 FU-47(b) v0.3.4 与 FU-52 v0.3.6 中收口为 trace-only / per-mountain baseline，不再作为 active product 或 debug code path。

### v0.3.2 — 2026-05-28

- FU-47(b): 明确 Mountain Detail / Activity Detail 接入 per-mountain PMTiles 的 runtime 策略。
- 新增 §15.4 PMTiles per-mountain pipeline：tippecanoe 工具链、30km bbox 生成、Supabase Storage naming、成本估算、cache invalidation 与 FU-51 checklist。
- 约束同步：Mountain Detail 无 per-mountain PMTiles 时不使用全国 z=7 兜底；Activity Detail z=7 兜底时轨迹必须用独立 fit-bounds overlay 保持可读视觉尺寸。

### v0.3.1 — 2026-04-29

- 字段命名统一：`elevation` → `altitude`（与运行时 schema 对齐）。
- 不变更："elevation gain"（爬升量）等物理量描述保留原表达。
