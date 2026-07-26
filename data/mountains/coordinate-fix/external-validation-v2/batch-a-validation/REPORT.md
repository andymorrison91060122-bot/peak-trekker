# T13 外部批次 A（41 条）机械验证

## 结论摘要

- 41 条全部调用 Phase 0 的 `analyzePseudoPrecision` / `classifyAngularGrid`，没有另写判定器。
- 裁定：可采用 0 / 需外部补正 24 / 拒收 17。
- 与现有 v2 resolved OSM/GNS 真正重合的只有 2 条：`gongga-shan`、`jiucai-ping`。
- Peakbagger URL 尝试 30 个；实际成功读取 14 页，这 14 页标题/坐标全部与所报中国山峰不一致；其余网络不可达项不据此推断对错。
- 无机器链接的来源共 8 条：文献/景区/地理志 5 条，户外攻略/轨迹 3 条；均按要求标“不可机械核验”。
- 坐标系不能按整批下结论。用户要求的 WGS→GCJ(external) 距离已报告，但它不能证明 external 原本是 GCJ；有效判据仍是 GCJ→WGS(external) 与 external 对 WGS→GCJ(reference) 同时改善。

## 机械校准与质量核对口径

- `existing_resolved_osm_gns`：2 条。`gongga-shan` 原值距参考 73.1m，只能判 `wgs84_leaning_but_above_50m_gate`；`jiucai-ping` 距参考 6.5m，判 `likely_wgs84`。
- `nearby_osm_name_match_wgs84`：18 条；这是本轮/前轮直接查到的 OSM 名称匹配辅助参考，不是“我方既有 resolved”。其中 10 条 `likely_wgs84`、2 条超过 50m 门槛、6 条无法判定。
- `nearby_osm_spatial_only_wgs84`：1 条（`siguniang-erfeng`）；仅空间近邻、没有名称匹配，距参考 67.2m，不足以确认坐标系。
- 无机械参考：20 条。两步路的 `yubeng-route`、六只脚的 `hutiaoxia-gaolu-route` 均在此组，不能从自述或批次其他条目外推坐标系。
- 没有任何一条满足 `likely_gcj02` 的机械模式；这只表示本批未检出，不能据此声明整批都是 WGS-84。
- 省份核对：40 条与账本一致；`qilianshan-tuanjie-feng` 为边界/不同归属，已单独标记，未据此直接判错。
- 海拔差绝对值超过 100m 的 6 条：`dangling-xiaqiangniea` +215m、`jiaozi-xueshan` +107m、`gangrenboqi-cluster` +1648m、`yubeng-route` +350m、`duku-gonglu-route` -110m、`hutiaoxia-gaolu-route` +870m。
- 完整逐条省份关系、参考点类型和四组转换距离见 `batch-a-41-validation.csv` / `.jsonl`；表中没有把我方 seed 当坐标系验证源，seed 只用于位移可见性。

## 人工嫌疑与对照组

### 人工嫌疑 8 条

| # | 山峰 / key | 真实有效精度 | 伪精度判定 | 坐标系机械判定 | seed 位移 km | 海拔差 m | 出处可核性 | 建议 |
|---:|---|---|---|---|---:|---:|---|---|
| 19 | 色季拉山主峰<br>`sejila-shan` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcminute | unverified_no_reference | 13.702 | 0 | reachable_wrong_object | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；所给 OSM 链接指向其他地点 |
| 34 | 启孜峰<br>`qizi-feng` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 4.037 | 0 | unreachable (Just a moment...) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 35 | 三奥雪山奥太基<br>`sanao-aotaiji` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 10.396 | 0 | unreachable (Just a moment...) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 36 | 三奥雪山奥太美<br>`sanao-aotaimei` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcminute | unverified_no_reference | 10.442 | 0 | unreachable (Just a moment...) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 37 | 三奥雪山奥太娜<br>`sanao-aotaina` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 12.404 | 0 | unreachable (Just a moment...) | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 38 | 党岭夏羌拉<br>`dangling-xiaqiangla` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | indeterminate; raw 2736.9m; WGS→GCJ(external) 2885.6m; GCJ→WGS(external) 2617.2m | 8.442 | 0 | unreachable (Just a moment...) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=indeterminate；出处链接不可用 |
| 40 | 夏塔古道最高点（木扎尔特达坂）<br>`xiata-gudao-route` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 2.695 | 0 | reachable_wrong_entity_or_coordinate (Peakbagger.com Error Page) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过；仅可作为 area/线路代表点，不得作为 summit 圆心 |
| 41 | 甲尔猛措<br>`jiaer-mengcuo` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 0 | 0 | unverifiable_no_machine_link | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处不可机械核验；仅可作为 area/线路代表点，不得作为 summit 圆心 |

### 对照组 4 条

| # | 山峰 / key | 真实有效精度 | 伪精度判定 | 坐标系机械判定 | seed 位移 km | 海拔差 m | 出处可核性 | 建议 |
|---:|---|---|---|---|---:|---:|---|---|
| 30 | 四姑娘山大峰<br>`siguniang-dafeng` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 2.727 | 0 | reachable_wrong_entity_or_coordinate (Freezeout Mountain, Washington) | **拒收**: 坐标系机械判定=unverified_no_reference；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过 |
| 31 | 四姑娘山二峰<br>`siguniang-erfeng` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | wgs84_leaning_but_above_50m_gate; raw 67.2m; WGS→GCJ(external) 254.8m; GCJ→WGS(external) 388.6m | 3.489 | 0 | reachable_wrong_entity_or_coordinate (Joker Mountain, Washington) | **拒收**: 坐标系机械判定=wgs84_leaning_but_above_50m_gate；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过 |
| 32 | 四姑娘山三峰<br>`siguniang-sanfeng` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 4.178 | 0 | unreachable (Just a moment...) | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 33 | 哈巴雪山主峰<br>`haba-xueshan` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | indeterminate; raw 4011m; WGS→GCJ(external) 3679.3m; GCJ→WGS(external) 4351.5m | 26.993 | 0 | unreachable (Just a moment...) | **需外部补正**: 坐标系机械判定=indeterminate；出处链接不可用 |

对照组四条均落在整角秒格点，而不是整角分；这符合 DMS 秒级来源的形态。检测器能证明“在角秒格点”，不能单独证明数据真实，但它们不属于角分级伪精度。

## 41 条逐条裁定

| # | 山峰 / key | 真实有效精度 | 伪精度判定 | 坐标系机械判定 | seed 位移 km | 海拔差 m | 出处可核性 | 建议 |
|---:|---|---|---|---|---:|---:|---|---|
| 1 | 贡嘎山（木雅贡嘎）<br>`gongga-shan` | 单轴角秒格点；另一轴按 5dp 记录 | weak_single_axis; lat=off_grid; lng=whole_arcsecond | wgs84_leaning_but_above_50m_gate; raw 73.1m; WGS→GCJ(external) 416.6m; GCJ→WGS(external) 299.3m | 4.79 | -47.1 | reachable_wrong_entity_or_coordinate (Soda Peak, Washington) | **拒收**: 坐标系机械判定=wgs84_leaning_but_above_50m_gate；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过 |
| 2 | 库拉岗日峰<br>`kulagangri-feng` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 1.5m; WGS→GCJ(external) 435.5m; GCJ→WGS(external) 438.6m | 2.932 | 0 | reachable_wrong_entity_or_coordinate (Many Trails Peak, Washington) | **需外部补正**: 所给 Peakbagger 链接指向其他山，但坐标另有 OSM/GNS 机械支持 |
| 3 | 阿尼玛卿峰（玛卿岗日）<br>`animaqing-feng` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 19.8m; WGS→GCJ(external) 160m; GCJ→WGS(external) 192.8m | 5.726 | 0 | reachable_wrong_entity_or_coordinate (Tatie Peak, Washington) | **需外部补正**: 所给 Peakbagger 链接指向其他山，但坐标另有 OSM/GNS 机械支持 |
| 4 | 格聂峰（格聂神山主峰）<br>`genie-shan` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 49.7m; WGS→GCJ(external) 289.6m; GCJ→WGS(external) 388.5m | 18.675 | -29.5 | reachable_wrong_entity_or_coordinate (Shull Mountain, Washington) | **需外部补正**: 所给 Peakbagger 链接指向其他山，但坐标另有 OSM/GNS 机械支持 |
| 5 | 田海子山主峰<br>`gongga-tianhaizi-shan` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 3.7m; WGS→GCJ(external) 334.8m; GCJ→WGS(external) 331.6m | 4.985 | 0 | reachable_wrong_entity_or_coordinate (Campbell Butte, Oregon) | **需外部补正**: 所给 Peakbagger 链接指向其他山，但坐标另有 OSM/GNS 机械支持 |
| 6 | 小贡嘎峰（日乌且峰）<br>`gongga-xiaogongga-feng` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | wgs84_leaning_but_above_50m_gate; raw 58.2m; WGS→GCJ(external) 367.6m; GCJ→WGS(external) 344.2m | 23.057 | 0 | reachable_wrong_entity_or_coordinate (Pyramid Butte, Oregon) | **拒收**: 坐标系机械判定=wgs84_leaning_but_above_50m_gate；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过 |
| 7 | 白海子山主峰<br>`gongga-baihaizi-shan` | 4 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 33m; WGS→GCJ(external) 339.2m; GCJ→WGS(external) 334m | 3.448 | 0 | unreachable (Just a moment...) | **需外部补正**: 出处链接不可用 |
| 8 | 团结峰（岗则吾结）<br>`qilianshan-tuanjie-feng` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | indeterminate; raw 882.5m; WGS→GCJ(external) 866.8m; GCJ→WGS(external) 901.9m | 1.652 | 0 | unreachable | **需外部补正**: 坐标系机械判定=indeterminate；出处链接不可用；落点省份与账本归属不一致 |
| 9 | 雪宝顶主峰<br>`xuebao-ding` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 4m; WGS→GCJ(external) 337.2m; GCJ→WGS(external) 333.7m | 5.142 | 0 | reachable_wrong_entity_or_coordinate (Hozomeen Mountain - South Peak, Washington) | **需外部补正**: 所给 Peakbagger 链接指向其他山，但坐标另有 OSM/GNS 机械支持 |
| 10 | 夏羌涅阿（党岭主峰）<br>`dangling-xiaqiangniea` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 23.8m; WGS→GCJ(external) 312.1m; GCJ→WGS(external) 312.5m | 9.315 | 215 | unreachable | **需外部补正**: 出处链接不可用 |
| 11 | 都日峰（小雪宝顶）<br>`duri-feng` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | wgs84_leaning_but_above_50m_gate; raw 59.7m; WGS→GCJ(external) 278.6m; GCJ→WGS(external) 397.6m | 71.86 | 0 | unreachable (Just a moment...) | **需外部补正**: 坐标系机械判定=wgs84_leaning_but_above_50m_gate；出处链接不可用；与 seed 位移 71.86km，需人工复核 |
| 12 | 扎拉雀尼峰（白马雪山主峰）<br>`baima-xueshan-zhalaqueni-feng` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | indeterminate; raw 171.8m; WGS→GCJ(external) 555.8m; GCJ→WGS(external) 276.5m | 3.996 | 0 | unreachable | **需外部补正**: 坐标系机械判定=indeterminate；出处链接不可用 |
| 13 | 大雪塘（西岭雪山主峰）<br>`xiling-xueshan` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 16.4m; WGS→GCJ(external) 337.4m; GCJ→WGS(external) 329.9m | 24.773 | 0 | unreachable (Just a moment...) | **需外部补正**: 出处链接不可用 |
| 14 | 岗什卡雪峰<br>`gangshka-xuefeng` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 11.6m; WGS→GCJ(external) 184.9m; GCJ→WGS(external) 180.9m | 0.941 | 0 | reachable_wrong_entity_or_coordinate (Majestic Mountain - South Peak, Washington) | **需外部补正**: 所给 Peakbagger 链接指向其他山，但坐标另有 OSM/GNS 机械支持 |
| 15 | 嘎娃嘎普峰（高黎贡山主峰）<br>`gaoligongshan-gawagapu-feng` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 6.2m; WGS→GCJ(external) 390m; GCJ→WGS(external) 381m | 11.765 | 0 | unreachable (Just a moment...) | **需外部补正**: 出处链接不可用 |
| 16 | 马牙雪山主峰（白尕达）<br>`maya-xueshan` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | unverified_no_reference | 15.6 | 0 | unreachable (Just a moment...) | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 17 | 轿子雪山（轿顶）<br>`jiaozi-xueshan` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 12.555 | 107 | reachable_wrong_entity_or_coordinate (Devils Dome, Washington) | **拒收**: 坐标系机械判定=unverified_no_reference；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过 |
| 18 | 达瓦更扎<br>`dawagengza` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | unverified_no_reference | 26.863 | -34 | reachable_wrong_object | **拒收**: 坐标系机械判定=unverified_no_reference；所给 OSM 链接指向其他地点；仅可作为 area/线路代表点，不得作为 summit 圆心 |
| 19 | 色季拉山主峰<br>`sejila-shan` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcminute | unverified_no_reference | 13.702 | 0 | reachable_wrong_object | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；所给 OSM 链接指向其他地点 |
| 20 | 小韭菜坪（乌蒙山主峰）<br>`jiucai-ping` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | likely_wgs84; raw 6.5m; WGS→GCJ(external) 459.8m; GCJ→WGS(external) 470.9m | 10.861 | 0 | unreachable (Just a moment...) | **需外部补正**: 出处链接不可用 |
| 21 | 无量山主峰笔架山<br>`wuliang-shan` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 24.02 | 0 | unverifiable_no_machine_link | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处不可机械核验 |
| 22 | 万佛山主峰老佛顶<br>`wanfo-shan-anhui` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 8.567 | 0 | unverifiable_no_machine_link | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处不可机械核验 |
| 23 | 张家界七星山主峰<br>`zhangjiajie-qixing-shan` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcminute | unverified_no_reference | 7.414 | 0 | unverifiable_no_machine_link | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处不可机械核验 |
| 24 | 丹霞山巴寨峰<br>`danxiashan-bazhai` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 14.008 | 0 | unverifiable_no_machine_link | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处不可机械核验 |
| 25 | 普陀山佛顶山（白华顶）<br>`putuoshan-foding-shan` | 5 位有效小数 | none; lat=off_grid; lng=off_grid | indeterminate; raw 100.1m; WGS→GCJ(external) 581.7m; GCJ→WGS(external) 389.6m | 3.798 | -0.1 | unavailable_or_deleted_object | **需外部补正**: 坐标系机械判定=indeterminate；出处链接不可用 |
| 26 | 卓玛拉垭口（冈仁波齐转山线）<br>`gangrenboqi-cluster` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | indeterminate; raw 1681m; WGS→GCJ(external) 1714.9m; GCJ→WGS(external) 1733.1m | 3.92 | 1648 | reachable_wrong_entity_or_coordinate (Peakbagger.com Error Page) | **拒收**: 坐标系机械判定=indeterminate；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过；资料海拔与账本差 1648m；仅可作为 area/线路代表点，不得作为 summit 圆心 |
| 27 | 雨崩神湖垭口（雨崩徒步线）<br>`yubeng-route` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 10.162 | 350 | unverifiable_no_machine_link | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处不可机械核验；仅可作为 area/线路代表点，不得作为 summit 圆心 |
| 28 | 哈希勒根达坂（独库公路）<br>`duku-gonglu-route` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcminute | unverified_no_reference | 149.56 | -110 | reachable_wrong_entity_or_coordinate (Peakbagger.com Error Page) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过；与 seed 位移 149.56km，需人工复核；仅可作为 area/线路代表点，不得作为 summit 圆心 |
| 29 | 28 道拐垭口（虎跳峡高路线）<br>`hutiaoxia-gaolu-route` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 10.982 | 870 | unverifiable_no_machine_link | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处不可机械核验；资料海拔与账本差 870m；仅可作为 area/线路代表点，不得作为 summit 圆心 |
| 30 | 四姑娘山大峰<br>`siguniang-dafeng` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 2.727 | 0 | reachable_wrong_entity_or_coordinate (Freezeout Mountain, Washington) | **拒收**: 坐标系机械判定=unverified_no_reference；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过 |
| 31 | 四姑娘山二峰<br>`siguniang-erfeng` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | wgs84_leaning_but_above_50m_gate; raw 67.2m; WGS→GCJ(external) 254.8m; GCJ→WGS(external) 388.6m | 3.489 | 0 | reachable_wrong_entity_or_coordinate (Joker Mountain, Washington) | **拒收**: 坐标系机械判定=wgs84_leaning_but_above_50m_gate；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过 |
| 32 | 四姑娘山三峰<br>`siguniang-sanfeng` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 4.178 | 0 | unreachable (Just a moment...) | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 33 | 哈巴雪山主峰<br>`haba-xueshan` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | indeterminate; raw 4011m; WGS→GCJ(external) 3679.3m; GCJ→WGS(external) 4351.5m | 26.993 | 0 | unreachable (Just a moment...) | **需外部补正**: 坐标系机械判定=indeterminate；出处链接不可用 |
| 34 | 启孜峰<br>`qizi-feng` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 4.037 | 0 | unreachable (Just a moment...) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 35 | 三奥雪山奥太基<br>`sanao-aotaiji` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 10.396 | 0 | unreachable (Just a moment...) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 36 | 三奥雪山奥太美<br>`sanao-aotaimei` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcminute | unverified_no_reference | 10.442 | 0 | unreachable (Just a moment...) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 37 | 三奥雪山奥太娜<br>`sanao-aotaina` | 角秒粒度（约 1″，纬向约 31m） | medium_two_axis_arcsecond_or_mixed; lat=whole_arcsecond; lng=whole_arcsecond | unverified_no_reference | 12.404 | 0 | unreachable (Just a moment...) | **需外部补正**: 坐标系机械判定=unverified_no_reference；出处链接不可用 |
| 38 | 党岭夏羌拉<br>`dangling-xiaqiangla` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | indeterminate; raw 2736.9m; WGS→GCJ(external) 2885.6m; GCJ→WGS(external) 2617.2m | 8.442 | 0 | unreachable (Just a moment...) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=indeterminate；出处链接不可用 |
| 39 | 青海湖南山主峰<br>`qinghaihu-nanshan` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 1.89 | 0 | unverifiable_no_machine_link | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处不可机械核验 |
| 40 | 夏塔古道最高点（木扎尔特达坂）<br>`xiata-gudao-route` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 2.695 | 0 | reachable_wrong_entity_or_coordinate (Peakbagger.com Error Page) | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；所给 Peakbagger 链接指向其他山，且无独立坐标校准通过；仅可作为 area/线路代表点，不得作为 summit 圆心 |
| 41 | 甲尔猛措<br>`jiaer-mengcuo` | 角分粒度（最弱轴约 1′，纬向约 1.85km） | strong_two_axis_arcminute; lat=whole_arcminute; lng=whole_arcminute | unverified_no_reference | 0 | 0 | unverifiable_no_machine_link | **拒收**: 真实精度为角分粒度（最弱轴约 1′，纬向约 1.85km），未过 3dp 硬线；坐标系机械判定=unverified_no_reference；出处不可机械核验；仅可作为 area/线路代表点，不得作为 summit 圆心 |

## 剩余查询批次

- 当前 v2 未解决 + area 共 202 座，未因本批外部结果做任何录入扣减。
- 普通山峰 176 座；路线／区域 26 座；共 6 批。
- 批次：ordinary-batch-01.txt=40；ordinary-batch-02.txt=40；ordinary-batch-03.txt=40；ordinary-batch-04.txt=40；ordinary-batch-05.txt=16；route-area-batch-01.txt=26。

## 边界

- 没有修改 v2 坐标数据，没有录入外部坐标。
- 没有生产写入、migration apply、GPS 核验逻辑修改或 push。
