# FU-51/FU-77 Phase 0 · Entity Resolution Reconciliation

## Input integrity

| Path | Role | SHA-256 |
| --- | --- | --- |
| `data/mountains/seed-catalog.md` | 业务源 | `a9c733a12ab8ae51aa2d8f251f5bc93074124101a9a3cb5763eeeb60e42ccb03` |
| `data/mountains/seed-distance.md` | 业务源 | `5228f072fadac773c0e75fe64f5e0177267889fce4471ef7faf057076923b04b` |
| `data/mountains/disposition-ledger.json` | 判定源 | `a20d357ea657a3397c82139eee40062b9c0adab8a46088a8028776559f134b37` |
| `data/mountains/README.md` | provenance only，不参与 join | `5daffa3b22f9590af25279c8af088ea084b06c86fd22df96a136627cee11b4a6` |

## Record layers

| Layer | Count |
| --- | ---: |
| Source records | 812 |
| Source-bound candidates | 406 |
| Frozen source-resolved identities | 403 |
| Effective-mapped identities | 399 |
| Source-bound eligible decisions | 355 |
| Source-bound excluded decisions | 51 |
| Synthetic canonicals | 4 |
| Final effective canonicals | 359 |

- Frozen source: 406 -> 403 -> survivors 362 / excluded 44.
- Effective equation: 406 = 355 eligible + 40 reject + 11 merge.
- Identity equation: 399 = 359 effective eligible + 40 rejected.

## Source alignment

- catalog rows: 406
- distance rows: 406
- catalog distinct names: 397
- distance distinct names: 397
- catalog ∖ distance names: 0
- distance ∖ catalog names: 0
- catalog columns: 7=396, 6=10
- distance columns: 3=406

## Decision counts

| Decision | Frozen source | Source-bound overrides | Final effective |
| --- | ---: | ---: | ---: |
| keep | 353 | 344 | 348 |
| keep_route | 9 | 11 | 11 |
| reject | 41 | 40 | 0 |
| merge | 3 | 11 | 0 |

## Entity type counts

| Entity type | Frozen source | Final effective |
| --- | ---: | ---: |
| peak | 325 | 325 |
| massif_member | 31 | 23 |
| region_cluster | 41 | 0 |
| route_corridor | 9 | 11 |

## Parse quality

| Field | exact_literal | ambiguous_literal | missing |
| --- | ---: | ---: | ---: |
| altitude | 340 | 66 | 0 |
| length | 403 | 3 | 0 |
| duration | 0 | 0 | 406 |

- catalog rows without GPS: 10

## Six-column catalog rows

| Name | Province |
| --- | --- |
| 乔戈里峰（K2） | 新疆维吾尔自治区 |
| 加舒尔布鲁木I峰 | 新疆维吾尔自治区 |
| 布洛阿特峰 | 新疆维吾尔自治区 |
| 加舒尔布鲁木II峰 | 新疆维吾尔自治区 |
| 慕士塔格峰 | 新疆维吾尔自治区 |
| 公格尔峰 | 新疆维吾尔自治区 |
| 公格尔九别峰 | 新疆维吾尔自治区 |
| 托木尔峰 | 新疆维吾尔自治区 |
| 汗腾格里峰 | 新疆维吾尔自治区 |
| 博格达峰 | 新疆维吾尔自治区 |

## Entity correction summary

- A-group parentized mountain bodies: 35
- D-group Yulong primary summit corrections: 1
- Synthetic merged mountain bodies: 4
- Final route corridors: 11

### Synthetic route topology

| Effective key | Routes | Source candidates |
| --- | ---: | --- |
| `yuzhu-feng` | 2 | `yuzhu-feng-beipo`, `yuzhu-feng-nanpo` |
| `huanggang-shan` | 2 | `huanggang-shan-fujian`, `huanggang-shan-jiangxi`, `wuyishan-huanggang-merge` |
| `wuling-shan` | 2 | `wuling-shan-beijing`, `wuling-shan-hebei` |
| `tiantang-zhai` | 1 | `tiantang-zhai-anhui`, `tiantang-zhai-hubei` |

## Merge resolution

| Candidate | Source-resolved | Effective target |
| --- | --- | --- |
| `aobao-geda-merge` | `helan-shan` | `helan-shan` |
| `guancen-shan` | `lue-shan` | `lue-shan` |
| `huanggang-shan-fujian` | `huanggang-shan-fujian` | `huanggang-shan` |
| `huanggang-shan-jiangxi` | `huanggang-shan-jiangxi` | `huanggang-shan` |
| `tiantang-zhai-anhui` | `tiantang-zhai-anhui` | `tiantang-zhai` |
| `tiantang-zhai-hubei` | `tiantang-zhai-hubei` | `tiantang-zhai` |
| `wuling-shan-beijing` | `wuling-shan-beijing` | `wuling-shan` |
| `wuling-shan-hebei` | `wuling-shan-hebei` | `wuling-shan` |
| `wuyishan-huanggang-merge` | `huanggang-shan-fujian` | `huanggang-shan` |
| `yuzhu-feng-beipo` | `yuzhu-feng-beipo` | `yuzhu-feng` |
| `yuzhu-feng-nanpo` | `yuzhu-feng-nanpo` | `yuzhu-feng` |

## Entity-resolution trace

| Source key | Source name | Frozen resolved | Effective key | Decision / entity | Parent summit | Routes | Access |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| `aerjin-shan` | 阿尔金山主峰 | `aerjin-shan` | `aerjin-shan` | keep / peak | - | 0 | unknown |
| `ailao-shan` | 哀牢山 | `ailao-shan` | `ailao-shan` | keep / peak | - | 0 | unknown |
| `animaqing-feng` | 阿尼玛卿峰 | `animaqing-feng` | `animaqing-feng` | keep / peak | - | 0 | unknown |
| `ao-shan` | 鳌山 | `ao-shan` | `ao-shan` | keep / peak | - | 0 | unknown |
| `aobao-geda-merge` | 敖包疙瘩 | `helan-shan` | `helan-shan` | merge / peak | - | 0 | unknown |
| `arshan-tianchi-cluster` | 阿尔山天池周边山峰 | `arshan-tianchi-cluster` | `arshan-tianchi-cluster` | reject / region_cluster | - | 0 | unknown |
| `bagong-shan` | 八公山 | `bagong-shan` | `bagong-shan` | keep / peak | - | 0 | unknown |
| `baicaopan` | 野三坡白草畔 | `baicaopan` | `baicaopan` | keep / peak | - | 0 | unknown |
| `baihua-shan` | 百花山 | `baihua-shan` | `baihua-shan` | keep / peak | - | 0 | unknown |
| `baima-jian` | 白马尖 | `baima-jian` | `baima-jian` | keep / peak | - | 0 | unknown |
| `baima-xueshan-zhalaqueni-feng` | 白马雪山扎拉雀尼峰 | `baima-xueshan-zhalaqueni-feng` | `baima-xueshan-zhalaqueni-feng` | keep / peak | - | 0 | unknown |
| `baishan-zu` | 百山祖 | `baishan-zu` | `baishan-zu` | keep / peak | - | 0 | unknown |
| `baishi-shan` | 白石山 | `baishi-shan` | `baishi-shan` | keep / peak | - | 0 | unknown |
| `baishuiyang-cluster` | 白水洋鸳鸯溪周边山峰 | `baishuiyang-cluster` | `baishuiyang-cluster` | reject / region_cluster | - | 0 | unknown |
| `baiyun-shan-guangdong` | 白云山 | `baiyun-shan-guangdong` | `baiyun-shan-guangdong` | keep / peak | - | 0 | unknown |
| `baiyunshan-yuhuang-ding-henan` | 白云山玉皇顶 | `baiyunshan-yuhuang-ding-henan` | `baiyun-shan-luoyang` | keep / peak | 玉皇顶 | 0 | unknown |
| `baizhang-ling` | 百丈岭 | `baizhang-ling` | `baizhang-ling` | keep / peak | - | 0 | unknown |
| `balang-shan` | 巴朗山 | `balang-shan` | `balang-shan` | keep / peak | - | 0 | unknown |
| `bamian-shan` | 八面山 | `bamian-shan` | `bamian-shan` | keep / peak | - | 0 | unknown |
| `banji-feng` | 半脊峰 | `banji-feng` | `banji-feng` | keep / peak | - | 0 | unknown |
| `baoquan-cluster` | 宝泉周边山峰 | `baoquan-cluster` | `baoquan-cluster` | reject / region_cluster | - | 0 | unknown |
| `baota-shan` | 宝塔山 | `baota-shan` | `baota-shan` | keep / peak | - | 0 | unknown |
| `basongcuo-cluster` | 巴松措周边山峰 | `basongcuo-cluster` | `basongcuo-cluster` | reject / region_cluster | - | 0 | unknown |
| `baxian-shan` | 八仙山 | `baxian-shan` | `baxian-shan` | keep / peak | - | 0 | unknown |
| `beidahu-cluster` | 北大壶周边山峰 | `beidahu-cluster` | `beidahu-cluster` | reject / region_cluster | - | 0 | unknown |
| `beiling-shan` | 北灵山 | `beiling-shan` | `beiling-shan` | keep / peak | - | 0 | unknown |
| `beiwudang-shan` | 北武当山 | `beiwudang-shan` | `beiwudang-shan` | keep / peak | - | 0 | unknown |
| `bijia-shan-liaoning` | 笔架山 | `bijia-shan-liaoning` | `bijia-shan-liaoning` | keep / peak | - | 0 | unknown |
| `bingyugou-cluster` | 冰峪沟周边山峰 | `bingyugou-cluster` | `bingyugou-cluster` | reject / region_cluster | - | 0 | unknown |
| `bogeda-feng` | 博格达峰 | `bogeda-feng` | `bogeda-feng` | keep / peak | - | 0 | unknown |
| `broad-peak` | 布洛阿特峰 | `broad-peak` | `broad-peak` | keep / peak | - | 0 | unknown |
| `bukadaban-feng` | 布喀达坂峰 | `bukadaban-feng` | `bukadaban-feng` | keep / peak | - | 0 | unknown |
| `caishi-ji` | 采石矶 | `caishi-ji` | `caishi-ji` | keep / peak | - | 0 | unknown |
| `cang-shan` | 藏山 | `cang-shan` | `cang-shan` | keep / peak | - | 0 | unknown |
| `cangshan-malong-feng` | 苍山马龙峰 | `cangshan-malong-feng` | `cangshan-yunnan` | keep / peak | 马龙峰 | 0 | unknown |
| `cangyan-shan` | 苍岩山 | `cangyan-shan` | `cangyan-shan` | keep / peak | - | 0 | unknown |
| `cha-shan` | 茶山 | `cha-shan` | `cha-shan` | keep / peak | - | 0 | unknown |
| `chaka-yanhu-cluster` | 茶卡盐湖周边山峰 | `chaka-yanhu-cluster` | `chaka-yanhu-cluster` | reject / region_cluster | - | 0 | unknown |
| `changbaishan-baiyun-feng` | 长白山白云峰 | `changbaishan-baiyun-feng` | `changbaishan` | keep / peak | 白云峰 | 0 | unknown |
| `chaya-shan-tianmo-feng` | 嵖岈山天磨峰 | `chaya-shan-tianmo-feng` | `chaya-shan` | keep / peak | 天磨峰 | 0 | unknown |
| `chen-shan` | 辰山 | `chen-shan` | `chen-shan` | keep / peak | - | 0 | unknown |
| `chuandi-ding` | 船底顶 | `chuandi-ding` | `chuandi-ding` | keep / peak | - | 0 | unknown |
| `dabai-shan` | 大白山 | `dabai-shan` | `dabai-shan` | keep / peak | - | 0 | unknown |
| `dabieshan-bodao-feng` | 大别山薄刀峰 | `dabieshan-bodao-feng` | `dabieshan-bodao-feng` | keep / peak | - | 0 | unknown |
| `dadong-shan` | 大东山 | `dadong-shan` | `dadong-shan` | keep / peak | - | 0 | unknown |
| `dahong-shan` | 大洪山 | `dahong-shan` | `dahong-shan` | keep / peak | - | 0 | unknown |
| `daiyun-shan` | 戴云山 | `daiyun-shan` | `daiyun-shan` | keep / peak | - | 0 | unknown |
| `dajue-shan` | 大觉山 | `dajue-shan` | `dajue-shan` | keep / peak | - | 0 | unknown |
| `dalari-feng` | 打拉日峰 | `dalari-feng` | `dalari-feng` | keep / peak | - | 0 | unknown |
| `daluo-shan` | 大罗山 | `daluo-shan` | `daluo-shan` | keep / peak | - | 0 | unknown |
| `damao-shan` | 大茂山 | `damao-shan` | `damao-shan` | keep / peak | - | 0 | unknown |
| `daming-shan-guangxi` | 大明山 | `daming-shan-guangxi` | `daming-shan-guangxi` | keep / peak | - | 0 | unknown |
| `daming-shan-zhejiang` | 大明山 | `daming-shan-zhejiang` | `daming-shan-zhejiang` | keep / peak | - | 0 | unknown |
| `dangling-xiaqiangla` | 党岭夏羌拉 | `dangling-xiaqiangla` | `dangling-xiaqiangla` | keep / massif_member | - | 0 | unknown |
| `dangling-xiaqiangniea` | 党岭夏羌涅阿 | `dangling-xiaqiangniea` | `dangling-xiaqiangniea` | keep / massif_member | - | 0 | unknown |
| `danxiashan-bazhai` | 丹霞山巴寨 | `danxiashan-bazhai` | `danxiashan-bazhai` | keep / peak | - | 0 | unknown |
| `daqing-shan` | 大青山主峰 | `daqing-shan` | `daqing-shan` | keep / peak | - | 0 | unknown |
| `darong-shan` | 大容山 | `darong-shan` | `darong-shan` | keep / peak | - | 0 | unknown |
| `datudingzi-shan` | 大秃顶子山 | `datudingzi-shan` | `datudingzi-shan` | keep / peak | - | 0 | unknown |
| `dawagengza` | 达瓦更扎 | `dawagengza` | `dawagengza` | keep / peak | - | 0 | unknown |
| `dawei-shan` | 大围山 | `dawei-shan` | `dawei-shan` | keep / peak | - | 0 | unknown |
| `dazhao-si-cluster` | 大昭寺周边山峰 | `dazhao-si-cluster` | `dazhao-si-cluster` | reject / region_cluster | - | 0 | unknown |
| `diaoluo-shan` | 吊罗山 | `diaoluo-shan` | `diaoluo-shan` | keep / peak | - | 0 | unknown |
| `dinghu-shan` | 鼎湖山 | `dinghu-shan` | `dinghu-shan` | keep / peak | - | 0 | unknown |
| `dongbai-shan` | 东白山 | `dongbai-shan` | `dongbai-shan` | keep / peak | - | 0 | unknown |
| `donghu-moshan` | 东湖磨山 | `donghu-moshan` | `donghu-moshan` | keep / peak | - | 0 | unknown |
| `dongjianghu-cluster` | 东江湖周边山峰 | `dongjianghu-cluster` | `dongjianghu-cluster` | reject / region_cluster | - | 0 | unknown |
| `dongling-shan` | 东灵山 | `dongling-shan` | `dongling-shan` | keep / peak | - | 0 | unknown |
| `duku-gonglu-route` | 独库公路沿线山峰 | `duku-gonglu-route` | `duku-gonglu-route` | keep_route / route_corridor | - | 0 | unknown |
| `duri-feng` | 都日峰 | `duri-feng` | `duri-feng` | keep / peak | - | 0 | unknown |
| `dushu-jian` | 独竖尖 | `dushu-jian` | `dushu-jian` | keep / peak | - | 0 | unknown |
| `duxiu-feng` | 独秀峰 | `duxiu-feng` | `duxiu-feng` | keep / peak | - | 0 | unknown |
| `emeishan-wanfo-ding` | 峨眉山万佛顶 | `emeishan-wanfo-ding` | `emeishan` | keep / peak | 万佛顶 | 0 | unknown |
| `enshi-daxiagu-cluster` | 恩施大峡谷周边山峰 | `enshi-daxiagu-cluster` | `enshi-daxiagu-cluster` | reject / region_cluster | - | 0 | unknown |
| `erlong-shan` | 二龙山 | `erlong-shan` | `erlong-shan` | keep / peak | - | 0 | unknown |
| `fanjingshan-hongyun-jinding` | 梵净山红云金顶 | `fanjingshan-hongyun-jinding` | `fanjingshan` | keep / peak | 红云金顶 | 0 | unknown |
| `fenghuang-gucheng-cluster` | 凤凰古城周边山峰 | `fenghuang-gucheng-cluster` | `fenghuang-gucheng-cluster` | reject / region_cluster | - | 0 | unknown |
| `fenghuang-shan-guangdong` | 凤凰山 | `fenghuang-shan-guangdong` | `fenghuang-shan-guangdong` | keep / peak | - | 0 | unknown |
| `fenghuang-shan-heilongjiang` | 凤凰山 | `fenghuang-shan-heilongjiang` | `fenghuang-shan-heilongjiang` | keep / peak | - | 0 | unknown |
| `fenghuang-shan-liaoning` | 凤凰山 | `fenghuang-shan-liaoning` | `fenghuang-shan-liaoning` | keep / peak | - | 0 | unknown |
| `fenghuang-tuo` | 凤凰坨 | `fenghuang-tuo` | `fenghuang-tuo` | keep / peak | - | 0 | unknown |
| `gang-shan-liaoning` | 岗山 | `gang-shan-liaoning` | `gang-shan-liaoning` | keep / peak | - | 0 | unknown |
| `gangpengqing-feng` | 岗彭庆峰 | `gangpengqing-feng` | `gangpengqing-feng` | keep / peak | - | 0 | unknown |
| `gangrenboqi-cluster` | 冈仁波齐周边山峰 | `gangrenboqi-cluster` | `gangrenboqi-cluster` | keep_route / route_corridor | - | 0 | unknown |
| `gangshka-xuefeng` | 岗什卡雪峰 | `gangshka-xuefeng` | `gangshka-xuefeng` | keep / peak | - | 0 | unknown |
| `gaoligongshan-gawagapu-feng` | 高黎贡山嘎娃嘎普峰 | `gaoligongshan-gawagapu-feng` | `gaoligongshan-gawagapu-feng` | keep / peak | - | 0 | unknown |
| `gasherbrum-1-feng` | 加舒尔布鲁木I峰 | `gasherbrum-1-feng` | `gasherbrum-1-feng` | keep / peak | - | 0 | unknown |
| `gasherbrum-2-feng` | 加舒尔布鲁木II峰 | `gasherbrum-2-feng` | `gasherbrum-2-feng` | keep / peak | - | 0 | unknown |
| `gechuan-jian` | 搁船尖 | `gechuan-jian` | `gechuan-jian` | keep / peak | - | 0 | unknown |
| `geladandong-feng` | 各拉丹冬峰 | `geladandong-feng` | `geladandong-feng` | keep / peak | - | 0 | unknown |
| `gele-shan` | 歌乐山 | `gele-shan` | `gele-shan` | keep / peak | - | 0 | unknown |
| `genie-shan` | 格聂神山主峰 | `genie-shan` | `genie-shan` | keep / peak | - | 0 | unknown |
| `gongga-baihaizi-shan` | 白海子山主峰 | `gongga-baihaizi-shan` | `gongga-baihaizi-shan` | keep / massif_member | - | 0 | unknown |
| `gongga-jiazi-feng` | 贡嘎嘉子峰 | `gongga-jiazi-feng` | `gongga-jiazi-feng` | keep / massif_member | - | 0 | unknown |
| `gongga-leduomanyin-feng` | 贡嘎勒多曼因峰 | `gongga-leduomanyin-feng` | `gongga-leduomanyin-feng` | keep / massif_member | - | 0 | unknown |
| `gongga-nama-feng` | 那玛峰 | `gongga-nama-feng` | `gongga-nama-feng` | keep / massif_member | - | 0 | unknown |
| `gongga-riwuqie-feng` | 贡嘎日乌且峰 | `gongga-riwuqie-feng` | `gongga-riwuqie-feng` | keep / massif_member | - | 0 | unknown |
| `gongga-shan` | 贡嘎雪山主峰 | `gongga-shan` | `gongga-shan` | keep / peak | - | 0 | unknown |
| `gongga-tianhaizi-shan` | 田海子山主峰 | `gongga-tianhaizi-shan` | `gongga-tianhaizi-shan` | keep / massif_member | - | 0 | unknown |
| `gongga-xiaogongga-feng` | 贡嘎小贡嘎峰 | `gongga-xiaogongga-feng` | `gongga-xiaogongga-feng` | keep / massif_member | - | 0 | unknown |
| `gongyu-yan` | 公盂岩 | `gongyu-yan` | `gongyu-yan` | keep / peak | - | 0 | unknown |
| `gouwei-zhang` | 狗尾嶂 | `gouwei-zhang` | `gouwei-zhang` | keep / peak | - | 0 | unknown |
| `gu-shan-fujian` | 鼓山 | `gu-shan-fujian` | `gu-shan-fujian` | keep / peak | - | 0 | unknown |
| `gua-shan` | 卦山 | `gua-shan` | `gua-shan` | keep / peak | - | 0 | unknown |
| `guancen-shan` | 管涔山主峰 | `lue-shan` | `lue-shan` | merge / peak | - | 0 | unknown |
| `guanegou-cluster` | 官鹅沟周边山峰 | `guanegou-cluster` | `guanegou-cluster` | reject / region_cluster | - | 0 | unknown |
| `guangwu-shan` | 光雾山 | `guangwu-shan` | `guangwu-shan` | keep / peak | - | 0 | unknown |
| `guanmen-shan` | 关门山 | `guanmen-shan` | `guanmen-shan` | keep / peak | - | 0 | unknown |
| `guanzhai-shan` | 冠豸山 | `guanzhai-shan` | `guanzhai-shan` | keep / peak | - | 0 | unknown |
| `gui-feng` | 龟峰 | `gui-feng` | `gui-feng` | keep / peak | - | 0 | unknown |
| `guide-danxia-cluster` | 贵德丹霞周边山峰 | `guide-danxia-cluster` | `guide-danxia-cluster` | reject / region_cluster | - | 0 | unknown |
| `guifeng-shan` | 圭峰山 | `guifeng-shan` | `guifeng-shan` | keep / peak | - | 0 | unknown |
| `guniu-jiang` | 牯牛降 | `guniu-jiang` | `guniu-jiang` | keep / peak | - | 0 | unknown |
| `haba-xueshan` | 哈巴雪山主峰 | `haba-xueshan` | `haba-xueshan` | keep / peak | - | 0 | unknown |
| `hailaer-xishan` | 海拉尔西山国家森林公园主峰 | `hailaer-xishan` | `hailaer-xishan` | keep / peak | - | 0 | unknown |
| `haituo-shan` | 海坨山 | `haituo-shan` | `haituo-shan` | keep / peak | - | 0 | unknown |
| `hantengeli-feng` | 汗腾格里峰 | `hantengeli-feng` | `hantengeli-feng` | keep / peak | - | 0 | unknown |
| `heban-shan` | 鹤伴山 | `heban-shan` | `heban-shan` | keep / peak | - | 0 | unknown |
| `heishan-gu` | 黑山谷 | `heishan-gu` | `heishan-gu` | keep / peak | - | 0 | unknown |
| `helan-shan` | 贺兰山 | `helan-shan` | `helan-shan` | keep / peak | - | 0 | unknown |
| `hengshan-tianfeng-ling` | 恒山天峰岭 | `hengshan-tianfeng-ling` | `hengshan-shanxi` | keep / peak | 天峰岭 | 0 | unknown |
| `hengshan-zhurong-feng` | 衡山祝融峰 | `hengshan-zhurong-feng` | `hengshan-hunan` | keep / peak | 祝融峰 | 0 | unknown |
| `huabo-shan` | 花脖山 | `huabo-shan` | `huabo-shan` | keep / peak | - | 0 | unknown |
| `huaguoshan-yunv-feng` | 花果山玉女峰 | `huaguoshan-yunv-feng` | `huaguoshan-jiangsu` | keep / peak | 玉女峰 | 0 | unknown |
| `huangbai-shan` | 黄柏山主峰 | `huangbai-shan` | `huangbai-shan` | keep / peak | - | 0 | unknown |
| `huangcao-liang` | 黄草梁 | `huangcao-liang` | `huangcao-liang` | keep / peak | - | 0 | unknown |
| `huanggang-liang` | 黄岗梁 | `huanggang-liang` | `huanggang-liang` | keep / peak | - | 0 | unknown |
| `huanggang-shan-fujian` | 黄岗山 | `huanggang-shan-fujian` | `huanggang-shan` | merge / peak | - | 0 | unknown |
| `huanggang-shan-jiangxi` | 黄岗山 | `huanggang-shan-jiangxi` | `huanggang-shan` | merge / peak | - | 0 | unknown |
| `huanghua-liang` | 黄花梁 | `huanghua-liang` | `huanghua-liang` | keep / peak | - | 0 | unknown |
| `huangmao-jian` | 黄茅尖 | `huangmao-jian` | `huangmao-jian` | keep / peak | - | 0 | unknown |
| `huangniu-shi` | 黄牛石 | `huangniu-shi` | `huangniu-shi` | keep / peak | - | 0 | unknown |
| `huangshan-lianhua-feng` | 黄山莲花峰 | `huangshan-lianhua-feng` | `huangshan` | keep / peak | 莲花峰 | 0 | unknown |
| `huangshan-xihai-route` | 黄山西海大峡谷环线 | `huangshan-xihai-route` | `huangshan-xihai-route` | keep_route / route_corridor | - | 0 | unknown |
| `huapi-ling` | 桦皮岭 | `huapi-ling` | `huapi-ling` | keep / peak | - | 0 | unknown |
| `huashan-nanfeng` | 华山南峰 | `huashan-nanfeng` | `huashan` | keep / peak | 南峰 | 0 | unknown |
| `huhe-bashige` | 呼和巴什格 | `huhe-bashige` | `huhe-bashige` | keep / peak | - | 0 | unknown |
| `huihang-gudao-route` | 徽杭古道沿线山峰 | `huihang-gudao-route` | `huihang-gudao-route` | keep_route / route_corridor | - | 0 | unknown |
| `huitengxile-huanghuagou` | 辉腾锡勒黄花沟主峰 | `huitengxile-huanghuagou` | `huitengxile-huanghuagou` | keep / peak | - | 0 | unknown |
| `huoyan-shan` | 火焰山 | `huoyan-shan` | `huoyan-shan` | keep / peak | - | 0 | unknown |
| `huping-shan` | 壶瓶山 | `huping-shan` | `huping-shan` | keep / peak | - | 0 | unknown |
| `hutiaoxia-gaolu-route` | 虎跳峡高路徒步线 | `hutiaoxia-gaolu-route` | `hutiaoxia-gaolu-route` | keep_route / route_corridor | - | 0 | unknown |
| `jiaer-mengcuo` | 甲尔猛措 | `jiaer-mengcuo` | `jiaer-mengcuo` | keep / peak | - | 0 | unknown |
| `jianfeng-ling` | 尖峰岭 | `jianfeng-ling` | `jianfeng-ling` | keep / peak | - | 0 | unknown |
| `jianglang-shan` | 江郎山 | `jianglang-shan` | `jianglang-shan` | keep / peak | - | 0 | unknown |
| `jiangsanglamu-feng` | 姜桑拉姆峰 | `jiangsanglamu-feng` | `jiangsanglamu-feng` | keep / peak | - | 0 | unknown |
| `jianmen-guan` | 剑门关 | `jianmen-guan` | `jianmen-guan` | keep / peak | - | 0 | unknown |
| `jiaoding-shan` | 轿顶山 | `jiaoding-shan` | `jiaoding-shan` | keep / peak | - | 0 | unknown |
| `jiaozi-xueshan` | 轿子雪山 | `jiaozi-xueshan` | `jiaozi-xueshan` | keep / peak | - | 0 | unknown |
| `jietongsusong-feng` | 解同速松峰 | `jietongsusong-feng` | `jietongsusong-feng` | keep / peak | - | 0 | unknown |
| `jigongshan-baoxiao-feng` | 鸡公山报晓峰 | `jigongshan-baoxiao-feng` | `jigongshan` | keep / peak | 报晓峰 | 0 | unknown |
| `jiming-shan` | 鸡鸣山 | `jiming-shan` | `jiming-shan` | keep / peak | - | 0 | unknown |
| `jinfo-shan` | 金佛山 | `jinfo-shan` | `jinfo-shan` | keep / peak | - | 0 | unknown |
| `jinggang-shan` | 井冈山 | `jinggang-shan` | `jinggang-shan` | keep / peak | - | 0 | unknown |
| `jingpohu-cluster` | 镜泊湖周边山峰 | `jingpohu-cluster` | `jingpohu-cluster` | reject / region_cluster | - | 0 | unknown |
| `jingting-shan` | 敬亭山 | `jingting-shan` | `jingting-shan` | keep / peak | - | 0 | unknown |
| `jingyuetan-cluster` | 净月潭周边山峰 | `jingyuetan-cluster` | `jingyuetan-cluster` | reject / region_cluster | - | 0 | unknown |
| `jinlong-shan` | 金龙山 | `jinlong-shan` | `jinlong-shan` | keep / peak | - | 0 | unknown |
| `jinshanling-cluster` | 金山岭长城周边山峰 | `jinshanling-cluster` | `jinshanling-cluster` | reject / region_cluster | - | 0 | unknown |
| `jinsixia-cluster` | 金丝峡周边山峰 | `jinsixia-cluster` | `jinsixia-cluster` | reject / region_cluster | - | 0 | unknown |
| `jinyun-shan` | 缙云山 | `jinyun-shan` | `jinyun-shan` | keep / peak | - | 0 | unknown |
| `jiucai-ling` | 韭菜岭 | `jiucai-ling` | `jiucai-ling` | keep / peak | - | 0 | unknown |
| `jiucai-ping` | 韭菜坪 | `jiucai-ping` | `jiucai-ping` | keep / peak | - | 0 | unknown |
| `jiuding-shan` | 九顶山 | `jiuding-shan` | `jiuding-shan` | keep / peak | - | 0 | unknown |
| `jiugongshan-laoya-jian` | 九宫山老鸦尖 | `jiugongshan-laoya-jian` | `jiugongshan` | keep / peak | 老鸦尖 | 0 | unknown |
| `jiuhuashan-shiwang-feng` | 九华山十王峰 | `jiuhuashan-shiwang-feng` | `jiuhuashan` | keep / peak | 十王峰 | 0 | unknown |
| `jiulong-shan-zhejiang` | 九龙山 | `jiulong-shan-zhejiang` | `jiulong-shan-zhejiang` | keep / peak | - | 0 | unknown |
| `jiushan-ding` | 九山顶 | `jiushan-ding` | `jiushan-ding` | keep / peak | - | 0 | unknown |
| `jiuwan-shan` | 九万山 | `jiuwan-shan` | `jiuwan-shan` | keep / peak | - | 0 | unknown |
| `jizu-shan` | 鸡足山 | `jizu-shan` | `jizu-shan` | keep / peak | - | 0 | unknown |
| `junfeng-shan` | 军峰山 | `junfeng-shan` | `junfeng-shan` | keep / peak | - | 0 | unknown |
| `kanasi-cluster` | 喀纳斯周边山峰 | `kanasi-cluster` | `kanasi-cluster` | reject / region_cluster | - | 0 | unknown |
| `kanbula-cluster` | 坎布拉周边山峰 | `kanbula-cluster` | `kanbula-cluster` | reject / region_cluster | - | 0 | unknown |
| `kawagebo-weifeng` | 卡瓦格博峰（卫峰） | `kawagebo-weifeng` | `kawagebo` | keep / peak | - | 0 | closed |
| `kongtong-shan` | 崆峒山 | `kongtong-shan` | `kongtong-shan` | keep / peak | - | 0 | unknown |
| `kongur-feng` | 公格尔峰 | `kongur-feng` | `kongur-feng` | keep / peak | - | 0 | unknown |
| `kongur-jiubie-feng` | 公格尔九别峰 | `kongur-jiubie-feng` | `kongur-jiubie-feng` | keep / massif_member | - | 0 | unknown |
| `kulagangri-feng` | 库拉岗日峰 | `kulagangri-feng` | `kulagangri-feng` | keep / peak | - | 0 | unknown |
| `kunyushan-taibo-ding` | 昆嵛山泰礴顶 | `kunyushan-taibo-ding` | `kunyushan` | keep / peak | 泰礴顶 | 0 | unknown |
| `lafa-shan` | 拉法山 | `lafa-shan` | `lafa-shan` | keep / peak | - | 0 | unknown |
| `lang-shan-hunan` | 崀山 | `lang-shan-hunan` | `lang-shan-hunan` | keep / peak | - | 0 | unknown |
| `lang-shan-jiangsu` | 狼山 | `lang-shan-jiangsu` | `lang-shan-jiangsu` | keep / peak | - | 0 | unknown |
| `langya-shan-anhui` | 琅琊山 | `langya-shan-anhui` | `langya-shan-anhui` | keep / peak | - | 0 | unknown |
| `langya-shan-hebei` | 狼牙山 | `langya-shan-hebei` | `langya-shan-hebei` | keep / peak | - | 0 | unknown |
| `laojunshan-mazong-ling` | 老君山马鬃岭 | `laojunshan-mazong-ling` | `laojunshan-henan` | keep / peak | 马鬃岭 | 0 | unknown |
| `laoshan-jufeng` | 崂山巨峰 | `laoshan-jufeng` | `laoshan` | keep / peak | 巨峰 | 0 | unknown |
| `laotudingzi` | 老秃顶子 | `laotudingzi` | `laotudingzi` | keep / peak | - | 0 | unknown |
| `laoyacha-nao` | 老鸦岔垴 | `laoyacha-nao` | `laoyacha-nao` | keep / peak | - | 0 | unknown |
| `laoye-ling` | 老爷岭 | `laoye-ling` | `laoye-ling` | keep / peak | - | 0 | unknown |
| `laozhanggou-cluster` | 老掌沟周边山峰 | `laozhanggou-cluster` | `laozhanggou-cluster` | reject / region_cluster | - | 0 | unknown |
| `li-shan` | 骊山 | `li-shan` | `li-shan` | keep / peak | - | 0 | unknown |
| `liang-shan-shandong` | 水泊梁山 | `liang-shan-shandong` | `liang-shan-shandong` | keep / peak | - | 0 | unknown |
| `libo-zhangjiang-cluster` | 荔波樟江周边山峰 | `libo-zhangjiang-cluster` | `libo-zhangjiang-cluster` | reject / region_cluster | - | 0 | unknown |
| `ling-shan-jiangsu` | 灵山 | `ling-shan-jiangsu` | `ling-shan-jiangsu` | keep / peak | - | 0 | unknown |
| `ling-shan-jiangxi` | 灵山 | `ling-shan-jiangxi` | `ling-shan-jiangxi` | keep / peak | - | 0 | unknown |
| `lingtong-shan` | 灵通山 | `lingtong-shan` | `lingtong-shan` | keep / peak | - | 0 | unknown |
| `lionggongdao-zhufeng` | 刘公岛主峰 | `lionggongdao-zhufeng` | `lionggongdao-zhufeng` | keep / peak | - | 0 | unknown |
| `lishan-shunwang-ping` | 历山舜王坪 | `lishan-shunwang-ping` | `lishan-shunwang-ping` | keep / peak | - | 0 | unknown |
| `liuding-shan` | 六鼎山 | `liuding-shan` | `liuding-shan` | keep / peak | - | 0 | unknown |
| `liupan-shan` | 六盘山 | `liupan-shan` | `liupan-shan` | keep / peak | - | 0 | unknown |
| `longhu-shan` | 龙虎山 | `longhu-shan` | `longhu-shan` | keep / peak | - | 0 | unknown |
| `longwanqun-cluster` | 龙湾群周边山峰 | `longwanqun-cluster` | `longwanqun-cluster` | reject / region_cluster | - | 0 | unknown |
| `longxu-shan` | 龙须山 | `longxu-shan` | `longxu-shan` | keep / peak | - | 0 | unknown |
| `loushan-guan` | 娄山关 | `loushan-guan` | `loushan-guan` | keep / peak | - | 0 | unknown |
| `lue-shan` | 芦芽山 | `lue-shan` | `lue-shan` | keep / peak | - | 0 | unknown |
| `luofushan-feiyun-ding` | 罗浮山飞云顶 | `luofushan-feiyun-ding` | `luofushan` | keep / peak | 飞云顶 | 0 | unknown |
| `luozi-feng` | 洛子峰 | `luozi-feng` | `luozi-feng` | keep / peak | - | 0 | unknown |
| `lushan-hanyang-feng` | 庐山汉阳峰 | `lushan-hanyang-feng` | `lushan` | keep / peak | 汉阳峰 | 0 | unknown |
| `lushan-shandong` | 鲁山主峰 | `lushan-shandong` | `lushan-shandong` | keep / peak | - | 0 | unknown |
| `luyuanping-cluster` | 鹿院坪周边山峰 | `luyuanping-cluster` | `luyuanping-cluster` | reject / region_cluster | - | 0 | unknown |
| `luzi-feng` | 鲁孜峰 | `luzi-feng` | `luzi-feng` | keep / peak | - | 0 | unknown |
| `maiji-shan` | 麦积山 | `maiji-shan` | `maiji-shan` | keep / peak | - | 0 | unknown |
| `makalu-feng` | 马卡鲁峰 | `makalu-feng` | `makalu-feng` | keep / peak | - | 0 | unknown |
| `mang-shan-beijing` | 蟒山 | `mang-shan-beijing` | `mang-shan-beijing` | keep / peak | - | 0 | unknown |
| `mang-shan-hunan` | 莽山 | `mang-shan-hunan` | `mang-shan-hunan` | keep / peak | - | 0 | unknown |
| `mangdang-shan` | 芒砀山主峰 | `mangdang-shan` | `mangdang-shan` | keep / peak | - | 0 | unknown |
| `manhan-shan` | 蛮汉山 | `manhan-shan` | `manhan-shan` | keep / peak | - | 0 | unknown |
| `mao-shan` | 茅山 | `mao-shan` | `mao-shan` | keep / peak | - | 0 | unknown |
| `maoer-shan-guangxi` | 猫儿山 | `maoer-shan-guangxi` | `maoer-shan-guangxi` | keep / peak | - | 0 | unknown |
| `maoer-shan-jilin` | 帽儿山 | `maoer-shan-jilin` | `maoer-shan-jilin` | keep / peak | - | 0 | unknown |
| `maolangou-cluster` | 茅兰沟周边山峰 | `maolangou-cluster` | `maolangou-cluster` | reject / region_cluster | - | 0 | unknown |
| `maya-xueshan` | 马牙雪山 | `maya-xueshan` | `maya-xueshan` | keep / peak | - | 0 | unknown |
| `meihua-shan-fujian` | 梅花山 | `meihua-shan-fujian` | `meihua-shan-fujian` | keep / peak | - | 0 | unknown |
| `mengdagangri-feng` | 蒙达岗日峰 | `mengdagangri-feng` | `mengdagangri-feng` | keep / peak | - | 0 | unknown |
| `mian-shan` | 绵山 | `mian-shan` | `mian-shan` | keep / peak | - | 0 | unknown |
| `miaofeng-shan` | 妙峰山 | `miaofeng-shan` | `miaofeng-shan` | keep / peak | - | 0 | unknown |
| `mingsha-shan` | 鸣沙山 | `mingsha-shan` | `mingsha-shan` | keep / peak | - | 0 | unknown |
| `mingxianling-cluster` | 明显陵周边山峰 | `mingxianling-cluster` | `mingxianling-cluster` | reject / region_cluster | - | 0 | unknown |
| `mingyue-shan` | 明月山 | `mingyue-shan` | `mingyue-shan` | keep / peak | - | 0 | unknown |
| `mogan-shan` | 莫干山 | `mogan-shan` | `mogan-shan` | keep / peak | - | 0 | unknown |
| `mulan-shan` | 木兰山 | `mulan-shan` | `mulan-shan` | keep / peak | - | 0 | unknown |
| `muztagata-feng` | 慕士塔格峰 | `muztagata-feng` | `muztagata-feng` | keep / peak | - | 0 | unknown |
| `namchabarwa-weifeng` | 南迦巴瓦峰卫峰 | `namchabarwa-weifeng` | `namchabarwa` | keep / peak | - | 0 | restricted |
| `namucuo-cluster` | 纳木错周边山峰 | `namucuo-cluster` | `namucuo-cluster` | reject / region_cluster | - | 0 | unknown |
| `namunani-feng` | 纳木那尼峰 | `namunani-feng` | `namunani-feng` | keep / peak | - | 0 | unknown |
| `nanfeng-mian` | 南风面 | `nanfeng-mian` | `nanfeng-mian` | keep / peak | - | 0 | unknown |
| `nangong-shan` | 南宫山 | `nangong-shan` | `nangong-shan` | keep / peak | - | 0 | unknown |
| `nanhuang-gudao-route` | 南黄古道沿线山峰 | `nanhuang-gudao-route` | `nanhuang-gudao-route` | keep_route / route_corridor | - | 0 | unknown |
| `nankun-shan` | 南昆山 | `nankun-shan` | `nankun-shan` | keep / peak | - | 0 | unknown |
| `nanyandang-shan` | 南雁荡山 | `nanyandang-shan` | `nanyandang-shan` | keep / peak | - | 0 | unknown |
| `nianbaoyuze-weifeng` | 年保玉则卫峰 | `nianbaoyuze-weifeng` | `nianbaoyuze` | keep / peak | - | 0 | closed |
| `ningjinkangsha-feng` | 宁金抗沙峰 | `ningjinkangsha-feng` | `ningjinkangsha-feng` | keep / peak | - | 0 | unknown |
| `niubei-shan` | 牛背山 | `niubei-shan` | `niubei-shan` | keep / peak | - | 0 | unknown |
| `nyainqentanglha-weifeng` | 念青唐古拉峰卫峰 | `nyainqentanglha-weifeng` | `nyainqentanglha` | keep / peak | - | 0 | restricted |
| `paiya-shan` | 排牙山 | `paiya-shan` | `paiya-shan` | keep / peak | - | 0 | unknown |
| `pan-shan` | 盘山 | `pan-shan` | `pan-shan` | keep / peak | - | 0 | unknown |
| `pingshan-xiagu-cluster` | 屏山峡谷周边山峰 | `pingshan-xiagu-cluster` | `pingshan-xiagu-cluster` | reject / region_cluster | - | 0 | unknown |
| `putuoshan-foding-shan` | 普陀山佛顶山 | `putuoshan-foding-shan` | `putuoshan-foding-shan` | keep / peak | - | 0 | unknown |
| `qian-shan` | 千山 | `qian-shan` | `qian-shan` | keep / peak | - | 0 | unknown |
| `qianfo-shan-sichuan` | 千佛山 | `qianfo-shan-sichuan` | `qianfo-shan-sichuan` | keep / peak | - | 0 | unknown |
| `qianling-shan` | 黔灵山 | `qianling-shan` | `qianling-shan` | keep / peak | - | 0 | unknown |
| `qiaogeli-feng-k2` | 乔戈里峰（K2） | `qiaogeli-feng-k2` | `qiaogeli-feng-k2` | keep / peak | - | 0 | unknown |
| `qilian-dacaoyuan-cluster` | 祁连大草原周边山峰 | `qilian-dacaoyuan-cluster` | `qilian-dacaoyuan-cluster` | reject / region_cluster | - | 0 | unknown |
| `qilianshan-tuanjie-feng` | 祁连山团结峰 | `qilianshan-tuanjie-feng` | `qilianshan-tuanjie-feng` | keep / peak | - | 0 | unknown |
| `qingchengshan-laojun-ge` | 青城山老君阁 | `qingchengshan-laojun-ge` | `qingchengshan-laojun-ge` | keep / peak | - | 0 | unknown |
| `qinghaihu-nanshan` | 青海湖南山 | `qinghaihu-nanshan` | `qinghaihu-nanshan` | keep / peak | - | 0 | unknown |
| `qingliang-feng` | 清凉峰 | `qingliang-feng` | `qingliang-feng` | keep / peak | - | 0 | unknown |
| `qingyan-guzhen-cluster` | 青岩古镇周边山峰 | `qingyan-guzhen-cluster` | `qingyan-guzhen-cluster` | reject / region_cluster | - | 0 | unknown |
| `qingyuan-shan` | 清源山 | `qingyuan-shan` | `qingyuan-shan` | keep / peak | - | 0 | unknown |
| `qingyun-shan-fujian` | 青云山 | `qingyun-shan-fujian` | `qingyun-shan-fujian` | keep / peak | - | 0 | unknown |
| `qiniang-shan` | 七娘山 | `qiniang-shan` | `qiniang-shan` | keep / peak | - | 0 | unknown |
| `qiongmugangri-feng` | 穷母岗日峰 | `qiongmugangri-feng` | `qiongmugangri-feng` | keep / peak | - | 0 | unknown |
| `qiyue-shan` | 齐岳山 | `qiyue-shan` | `qiyue-shan` | keep / peak | - | 0 | unknown |
| `qiyun-shan-anhui` | 齐云山 | `qiyun-shan-anhui` | `qiyun-shan-anhui` | keep / peak | - | 0 | unknown |
| `qiyun-shan-jiangxi` | 齐云山 | `qiyun-shan-jiangxi` | `qiyun-shan-jiangxi` | keep / peak | - | 0 | unknown |
| `qizi-feng` | 启孜峰 | `qizi-feng` | `qizi-feng` | keep / peak | - | 0 | unknown |
| `queer-shan` | 雀儿山主峰 | `queer-shan` | `queer-shan` | keep / peak | - | 0 | unknown |
| `sanao-aotaiji` | 三奥雪山奥太基 | `sanao-aotaiji` | `sanao-aotaiji` | keep / massif_member | - | 0 | unknown |
| `sanao-aotaimei` | 三奥雪山奥太美 | `sanao-aotaimei` | `sanao-aotaimei` | keep / massif_member | - | 0 | unknown |
| `sanao-aotaina` | 三奥雪山奥太娜 | `sanao-aotaina` | `sanao-aotaina` | keep / massif_member | - | 0 | unknown |
| `sanbai-shan` | 三百山 | `sanbai-shan` | `sanbai-shan` | keep / peak | - | 0 | unknown |
| `sangdankangsang-feng` | 桑丹康桑峰 | `sangdankangsang-feng` | `sangdankangsang-feng` | keep / peak | - | 0 | unknown |
| `sanqingshan-yujing-feng` | 三清山玉京峰 | `sanqingshan-yujing-feng` | `sanqingshan` | keep / peak | 玉京峰 | 0 | unknown |
| `sanxiadaba-cluster` | 三峡大坝周边山峰 | `sanxiadaba-cluster` | `sanxiadaba-cluster` | reject / region_cluster | - | 0 | unknown |
| `sejila-shan` | 色季拉山 | `sejila-shan` | `sejila-shan` | keep / peak | - | 0 | unknown |
| `shao-shan` | 韶山 | `shao-shan` | `shao-shan` | keep / peak | - | 0 | unknown |
| `she-shan` | 佘山 | `she-shan` | `she-shan` | keep / peak | - | 0 | unknown |
| `shengtang-shan` | 圣堂山 | `shengtang-shan` | `shengtang-shan` | keep / peak | - | 0 | unknown |
| `shennong-ding` | 神农顶 | `shennong-ding` | `shennong-ding` | keep / peak | - | 0 | unknown |
| `shennongjia-laojun-shan` | 神农架老君山 | `shennongjia-laojun-shan` | `shennongjia-laojun-shan` | keep / peak | - | 0 | unknown |
| `shennongshan-zijin-ding` | 神农山紫金顶 | `shennongshan-zijin-ding` | `shennongshan` | keep / peak | 紫金顶 | 0 | unknown |
| `shenxian-ju` | 神仙居 | `shenxian-ju` | `shenxian-ju` | keep / peak | - | 0 | unknown |
| `shigao-shan` | 石膏山 | `shigao-shan` | `shigao-shan` | keep / peak | - | 0 | unknown |
| `shika-xueshan` | 石卡雪山 | `shika-xueshan` | `shika-xueshan` | keep / peak | - | 0 | unknown |
| `shikeng-kong` | 石坑崆 | `shikeng-kong` | `shikeng-kong` | keep / peak | - | 0 | unknown |
| `shilin-cluster` | 石林 | `shilin-cluster` | `shilin-cluster` | reject / region_cluster | - | 0 | unknown |
| `shishapangma-lenggang-feng` | 冷岗峰 | `shishapangma-lenggang-feng` | `shishapangma-lenggang-feng` | keep / massif_member | - | 0 | unknown |
| `shiwan-dashan` | 十万大山 | `shiwan-dashan` | `shiwan-dashan` | keep / peak | - | 0 | unknown |
| `shuangta-shan` | 双塔山 | `shuangta-shan` | `shuangta-shan` | keep / peak | - | 0 | unknown |
| `shunan-zhuhai` | 蜀南竹海 | `shunan-zhuhai` | `shunan-zhuhai` | keep / peak | - | 0 | unknown |
| `siguniang-dafeng` | 四姑娘山大峰 | `siguniang-dafeng` | `siguniang-dafeng` | keep / massif_member | - | 0 | unknown |
| `siguniang-erfeng` | 四姑娘山二峰 | `siguniang-erfeng` | `siguniang-erfeng` | keep / massif_member | - | 0 | unknown |
| `siguniang-luotuo-feng` | 四姑娘山骆驼峰 | `siguniang-luotuo-feng` | `siguniang-luotuo-feng` | keep / massif_member | - | 0 | unknown |
| `siguniang-sanfeng` | 四姑娘山三峰 | `siguniang-sanfeng` | `siguniang-sanfeng` | keep / massif_member | - | 0 | unknown |
| `siguniang-yaomei-feng` | 四姑娘山幺妹峰 | `siguniang-yaomei-feng` | `siguniang-yaomei-feng` | keep / massif_member | - | 0 | unknown |
| `simian-shan` | 四面山 | `simian-shan` | `simian-shan` | keep / peak | - | 0 | unknown |
| `siming-shan` | 四明山 | `siming-shan` | `siming-shan` | keep / peak | - | 0 | unknown |
| `siren-tong` | 四人同 | `siren-tong` | `siren-tong` | keep / peak | - | 0 | unknown |
| `songshan-junji-feng` | 嵩山峻极峰 | `songshan-junji-feng` | `songshan` | keep / peak | 峻极峰 | 0 | unknown |
| `sumu-shan` | 苏木山 | `sumu-shan` | `sumu-shan` | keep / peak | - | 0 | unknown |
| `taer-si-cluster` | 塔尔寺周边山峰 | `taer-si-cluster` | `taer-si-cluster` | reject / region_cluster | - | 0 | unknown |
| `taibaishan-baxian-tai` | 太白山拔仙台 | `taibaishan-baxian-tai` | `taibaishan` | keep / peak | 拔仙台 | 0 | unknown |
| `taimu-shan` | 太姥山 | `taimu-shan` | `taimu-shan` | keep / peak | - | 0 | unknown |
| `taishan-yuhuang-ding` | 泰山玉皇顶 | `taishan-yuhuang-ding` | `taishan` | keep / peak | 玉皇顶 | 0 | unknown |
| `taizi-jian` | 太子尖 | `taizi-jian` | `taizi-jian` | keep / peak | - | 0 | unknown |
| `tanglaangqu-feng` | 唐拉昂曲峰 | `tanglaangqu-feng` | `tanglaangqu-feng` | keep / peak | - | 0 | unknown |
| `taohuayuan-cluster` | 桃花源周边山峰 | `taohuayuan-cluster` | `taohuayuan-cluster` | reject / region_cluster | - | 0 | unknown |
| `tianhua-shan` | 天华山 | `tianhua-shan` | `tianhua-shan` | keep / peak | - | 0 | unknown |
| `tianjieshan-laoye-ding` | 天界山老爷顶 | `tianjieshan-laoye-ding` | `tianjieshan` | keep / peak | 老爷顶 | 0 | unknown |
| `tianma-shan-shanghai` | 天马山 | `tianma-shan-shanghai` | `tianma-shan-shanghai` | keep / peak | - | 0 | unknown |
| `tianmu-shan` | 天目山 | `tianmu-shan` | `tianmu-shan` | keep / peak | - | 0 | unknown |
| `tianmushan-qijian-route` | 天目山七尖穿越线 | `tianmushan-qijian-route` | `tianmushan-qijian-route` | keep_route / route_corridor | - | 0 | unknown |
| `tianping-shan` | 天平山 | `tianping-shan` | `tianping-shan` | keep / peak | - | 0 | unknown |
| `tianshan-tianchi-cluster` | 天山天池周边山峰 | `tianshan-tianchi-cluster` | `tianshan-tianchi-cluster` | reject / region_cluster | - | 0 | unknown |
| `tiantaishan-huading-shan` | 天台山华顶山 | `tiantaishan-huading-shan` | `tiantaishan-huading-shan` | keep / peak | - | 0 | unknown |
| `tiantang-ding` | 天堂顶 | `tiantang-ding` | `tiantang-ding` | keep / peak | - | 0 | unknown |
| `tiantang-zhai-anhui` | 天堂寨 | `tiantang-zhai-anhui` | `tiantang-zhai` | merge / peak | - | 0 | unknown |
| `tiantang-zhai-hubei` | 天堂寨 | `tiantang-zhai-hubei` | `tiantang-zhai` | merge / peak | - | 0 | unknown |
| `tianzhushan-tianzhu-feng` | 天柱山天柱峰 | `tianzhushan-tianzhu-feng` | `tianzhushan-anhui` | keep / peak | 天柱峰 | 0 | unknown |
| `tonggong-jian` | 童公尖 | `tonggong-jian` | `tonggong-jian` | keep / peak | - | 0 | unknown |
| `tuo-liang` | 驼梁 | `tuo-liang` | `tuo-liang` | keep / peak | - | 0 | unknown |
| `tuomuer-feng` | 托木尔峰 | `tuomuer-feng` | `tuomuer-feng` | keep / peak | - | 0 | unknown |
| `wanfo-shan-anhui` | 万佛山 | `wanfo-shan-anhui` | `wanfo-shan-anhui` | keep / peak | - | 0 | unknown |
| `wangmang-ling` | 王莽岭 | `wangmang-ling` | `wangmang-ling` | keep / peak | - | 0 | unknown |
| `wangmangling-xiyaigou-route` | 太行山王莽岭-锡崖沟环线 | `wangmangling-xiyaigou-route` | `wangmangling-xiyaigou-route` | keep_route / route_corridor | - | 0 | unknown |
| `wangwushan-tiantan-feng` | 王屋山天坛峰 | `wangwushan-tiantan-feng` | `wangwushan` | keep / peak | 天坛峰 | 0 | unknown |
| `wangxiang-yan` | 太行大峡谷王相岩 | `wangxiang-yan` | `wangxiang-yan` | keep / peak | - | 0 | unknown |
| `wanxian-shan` | 万仙山主峰 | `wanxian-shan` | `wanxian-shan` | keep / peak | - | 0 | unknown |
| `wawu-shan` | 瓦屋山 | `wawu-shan` | `wawu-shan` | keep / peak | - | 0 | unknown |
| `weizhoudao-huoshankou` | 涠洲岛火山口主峰 | `weizhoudao-huoshankou` | `weizhou-volcanic-landform-route` | keep_route / route_corridor | - | 1 | open |
| `wudalianchi-cluster` | 五大连池火山群 | `wudalianchi-cluster` | `wudalianchi-cluster` | reject / region_cluster | - | 0 | unknown |
| `wudangshan-tianzhu-feng` | 武当山天柱峰 | `wudangshan-tianzhu-feng` | `wudangshan` | keep / peak | 天柱峰 | 0 | unknown |
| `wugongshan-guangdong` | 武功山广东段 | `wugongshan-guangdong` | `wugongshan-guangdong` | keep / peak | - | 0 | unknown |
| `wugongshan-jinding-jiangxi` | 武功山金顶 | `wugongshan-jinding-jiangxi` | `wugongshan-jiangxi` | keep / peak | 金顶 | 0 | unknown |
| `wulao-feng` | 五老峰 | `wulao-feng` | `wulao-feng` | keep / peak | - | 0 | unknown |
| `wuliang-shan` | 无量山 | `wuliang-shan` | `wuliang-shan` | keep / peak | - | 0 | unknown |
| `wuling-shan-beijing` | 雾灵山 | `wuling-shan-beijing` | `wuling-shan` | merge / peak | - | 0 | unknown |
| `wuling-shan-chongqing` | 武陵山 | `wuling-shan-chongqing` | `wuling-shan-chongqing` | keep / peak | - | 0 | unknown |
| `wuling-shan-hebei` | 雾灵山 | `wuling-shan-hebei` | `wuling-shan` | merge / peak | - | 0 | unknown |
| `wumeng-shan` | 乌蒙山 | `wumeng-shan` | `wumeng-shan` | keep / peak | - | 0 | unknown |
| `wutaishan-yedou-feng` | 五台山北台叶斗峰 | `wutaishan-yedou-feng` | `wutaishan` | keep / peak | 北台叶斗峰 | 0 | unknown |
| `wutong-shan` | 梧桐山 | `wutong-shan` | `wutong-shan` | keep / peak | - | 0 | unknown |
| `wuyishan-huanggang-merge` | 武夷山主峰黄岗山 | `huanggang-shan-fujian` | `huanggang-shan` | merge / peak | - | 0 | unknown |
| `wuyue-zhai` | 五岳寨 | `wuyue-zhai` | `wuyue-zhai` | keep / peak | - | 0 | unknown |
| `wuzhi-shan` | 五指山 | `wuzhi-shan` | `wuzhi-shan` | keep / peak | - | 0 | unknown |
| `xi-shan-yunnan` | 西山 | `xi-shan-yunnan` | `xi-shan-yunnan` | keep / peak | - | 0 | unknown |
| `xiang-shan` | 香山 | `xiang-shan` | `xiang-shan` | keep / peak | - | 0 | unknown |
| `xiangbi-shan` | 象鼻山 | `xiangbi-shan` | `xiangbi-shan` | keep / peak | - | 0 | unknown |
| `xiangtang-shan` | 响堂山 | `xiangtang-shan` | `xiangtang-shan` | keep / peak | - | 0 | unknown |
| `xiannv-shan` | 仙女山 | `xiannv-shan` | `xiannv-shan` | keep / peak | - | 0 | unknown |
| `xiaowutai-shan` | 小五台山 | `xiaowutai-shan` | `xiaowutai-shan` | keep / peak | - | 0 | unknown |
| `xiaoxinganling-liangshui` | 小兴安岭凉水主峰 | `xiaoxinganling-liangshui` | `xiaoxinganling-liangshui` | keep / peak | - | 0 | unknown |
| `xiata-gudao-route` | 夏塔古道沿线山峰 | `xiata-gudao-route` | `xiata-gudao-route` | keep_route / route_corridor | - | 0 | unknown |
| `xicheng-shan` | 析城山 | `xicheng-shan` | `xicheng-shan` | keep / peak | - | 0 | unknown |
| `xiling-xueshan` | 西岭雪山 | `xiling-xueshan` | `xiling-xueshan` | keep / peak | - | 0 | unknown |
| `xiqiao-shan` | 西樵山 | `xiqiao-shan` | `xiqiao-shan` | keep / peak | - | 0 | unknown |
| `xixiabangma-feng` | 希夏邦马峰主峰 | `xixiabangma-feng` | `xixiabangma-feng` | keep / peak | - | 0 | unknown |
| `xuebao-ding` | 雪宝顶主峰 | `xuebao-ding` | `xuebao-ding` | keep / peak | - | 0 | unknown |
| `xuedou-shan` | 雪窦山 | `xuedou-shan` | `xuedou-shan` | keep / peak | - | 0 | unknown |
| `xuefeng-shan` | 雪峰山 | `xuefeng-shan` | `xuefeng-shan` | keep / peak | - | 0 | unknown |
| `xuelong-bao` | 雪隆包 | `xuelong-bao` | `xuelong-bao` | keep / peak | - | 0 | unknown |
| `xueshan-zhang` | 雪山嶂 | `xueshan-zhang` | `xueshan-zhang` | keep / peak | - | 0 | unknown |
| `yading-xiannairi` | 仙乃日卫峰 | `yading-xiannairi` | `yading-xiannairi` | keep / massif_member | - | 0 | closed |
| `yading-xianuoduoji` | 夏诺多吉卫峰 | `yading-xianuoduoji` | `yading-xianuoduoji` | keep / massif_member | - | 0 | closed |
| `yading-yangmaiyong` | 央迈勇卫峰 | `yading-yangmaiyong` | `yading-yangmaiyong` | keep / massif_member | - | 0 | closed |
| `yala-weifeng` | 雅拉雪山卫峰 | `yala-weifeng` | `yala-xueshan` | keep / peak | - | 0 | unknown |
| `yalongwan-canghai-lou` | 亚龙湾热带天堂森林公园主峰 | `yalongwan-canghai-lou` | `yalongwan-canghai-lou` | keep / peak | - | 0 | unknown |
| `yaluzangbu-daxiagu-cluster` | 雅鲁藏布大峡谷周边山峰 | `yaluzangbu-daxiagu-cluster` | `yaluzangbu-daxiagu-cluster` | reject / region_cluster | - | 0 | unknown |
| `yandangshan-baigang-jian` | 雁荡山百岗尖 | `yandangshan-baigang-jian` | `yandangshan-zhejiang` | keep / peak | 百岗尖 | 0 | unknown |
| `yangcao-shan` | 羊草山 | `yangcao-shan` | `yangcao-shan` | keep / peak | - | 0 | unknown |
| `yangzhuoyongcuo-cluster` | 羊卓雍措周边山峰 | `yangzhuoyongcuo-cluster` | `yangzhuoyongcuo-cluster` | reject / region_cluster | - | 0 | unknown |
| `yaoshan-yuhuang-ding` | 尧山玉皇顶 | `yaoshan-yuhuang-ding` | `yaoshan-henan` | keep / peak | 玉皇顶 | 0 | unknown |
| `yi-shan` | 峄山 | `yi-shan` | `yi-shan` | keep / peak | - | 0 | unknown |
| `yimengshan-guimeng-ding` | 沂蒙山龟蒙顶 | `yimengshan-guimeng-ding` | `yimengshan-guimeng` | keep / peak | 龟蒙顶 | 0 | unknown |
| `yingge-ling` | 鹦哥岭 | `yingge-ling` | `yingge-ling` | keep / peak | - | 0 | unknown |
| `yinna-shan` | 阴那山 | `yinna-shan` | `yinna-shan` | keep / peak | - | 0 | unknown |
| `yintiao-ling` | 阴条岭 | `yintiao-ling` | `yintiao-ling` | keep / peak | - | 0 | unknown |
| `yishan-yuhuang-ding` | 沂山玉皇顶 | `yishan-yuhuang-ding` | `yishan-shandong` | keep / peak | 玉皇顶 | 0 | unknown |
| `yiwulu-shan` | 医巫闾山 | `yiwulu-shan` | `yiwulu-shan` | keep / peak | - | 0 | unknown |
| `yuanbao-shan` | 元宝山 | `yuanbao-shan` | `yuanbao-shan` | keep / peak | - | 0 | unknown |
| `yubeng-route` | 雨崩徒步线 | `yubeng-route` | `yubeng-route` | keep_route / route_corridor | - | 0 | unknown |
| `yuelu-shan` | 岳麓山 | `yuelu-shan` | `yuelu-shan` | keep / peak | - | 0 | unknown |
| `yulong-xueshan-xuebao-ding` | 玉龙雪山雪宝顶 | `yulong-xueshan-xuebao-ding` | `yulong-xueshan` | keep / peak | 扇子陡 | 1 | restricted |
| `yunding-shan-fujian` | 云顶山 | `yunding-shan-fujian` | `yunding-shan-fujian` | keep / peak | - | 0 | unknown |
| `yunding-shan-shanxi` | 云顶山 | `yunding-shan-shanxi` | `yunding-shan-shanxi` | keep / peak | - | 0 | unknown |
| `yunlong-shan` | 云龙山 | `yunlong-shan` | `yunlong-shan` | keep / peak | - | 0 | unknown |
| `yunmeng-shan` | 云蒙山 | `yunmeng-shan` | `yunmeng-shan` | keep / peak | - | 0 | unknown |
| `yuntai-shan-guizhou` | 云台山 | `yuntai-shan-guizhou` | `yuntai-shan-guizhou` | keep / peak | - | 0 | unknown |
| `yuntaishan-zhuyu-feng-henan` | 云台山茱萸峰 | `yuntaishan-zhuyu-feng-henan` | `yuntai-shan-henan` | keep / peak | 茱萸峰 | 0 | unknown |
| `yuzhu-feng-beipo` | 玉珠峰北坡 | `yuzhu-feng-beipo` | `yuzhu-feng` | merge / peak | - | 0 | unknown |
| `yuzhu-feng-nanpo` | 玉珠峰南坡 | `yuzhu-feng-nanpo` | `yuzhu-feng` | merge / peak | - | 0 | unknown |
| `yuzhu-yuxu-feng` | 玉虚峰 | `yuzhu-yuxu-feng` | `yuzhu-yuxu-feng` | keep / massif_member | - | 0 | unknown |
| `zhagana-cluster` | 扎尕那周边山峰 | `zhagana-cluster` | `zhagana-cluster` | reject / region_cluster | - | 0 | unknown |
| `zhangjiajie-qixing-shan` | 张家界七星山 | `zhangjiajie-qixing-shan` | `zhangjiajie-qixing-shan` | keep / peak | - | 0 | unknown |
| `zhangjiajie-tianmen-shan` | 张家界天门山 | `zhangjiajie-tianmen-shan` | `zhangjiajie-tianmen-shan` | keep / peak | - | 0 | unknown |
| `zhangshi-yan` | 嶂石岩 | `zhangshi-yan` | `zhangshi-yan` | keep / peak | - | 0 | unknown |
| `zhangzi-feng` | 章子峰 | `zhangzi-feng` | `zhangzi-feng` | keep / peak | - | 0 | unknown |
| `zhaogong-shan` | 赵公山 | `zhaogong-shan` | `zhaogong-shan` | keep / peak | - | 0 | unknown |
| `zhashilunbu-cluster` | 扎什伦布寺周边山峰 | `zhashilunbu-cluster` | `zhashilunbu-cluster` | reject / region_cluster | - | 0 | unknown |
| `zhexi-daxiagu-cluster` | 浙西大峡谷周边山峰 | `zhexi-daxiagu-cluster` | `zhexi-daxiagu-cluster` | reject / region_cluster | - | 0 | unknown |
| `zhongnan-shan` | 终南山 | `zhongnan-shan` | `zhongnan-shan` | keep / peak | - | 0 | unknown |
| `zhumulangma-beipo` | 珠穆朗玛峰北坡 | `zhumulangma-beipo` | `zhumulangma-beipo` | keep / peak | - | 0 | unknown |
| `zhuoaoyou-feng` | 卓奥友峰 | `zhuoaoyou-feng` | `zhuoaoyou-feng` | keep / peak | - | 0 | unknown |
| `zhuoer-shan` | 卓尔山 | `zhuoer-shan` | `zhuoer-shan` | keep / peak | - | 0 | unknown |
| `zijin-shan-jiangsu` | 紫金山 | `zijin-shan-jiangsu` | `zijin-shan-jiangsu` | keep / peak | - | 0 | unknown |
| `zu-shan` | 祖山 | `zu-shan` | `zu-shan` | keep / peak | - | 0 | unknown |

## Unaccounted

| Check | Count |
| --- | ---: |
| catalog_unmapped | 0 |
| distance_unmapped | 0 |
| override_without_catalog | 0 |
| override_without_distance | 0 |
| candidate_missing_source_pair | 0 |
| unresolved_merge_targets | 0 |
| eligible_candidate_unmapped | 0 |
| rejected_candidate_promoted | 0 |
| effective_without_sources | 0 |
| total | 0 |
