# Ledger Enrichment Review

## Scope

- Entity closure: 359/359
- Coordinates are used only as authority references for coarse location behavior; no value is labeled verified.
- 距离=单一路线字面量的山体级距离；多线路实体只保留 per-route 距离，不提升为山体单值（平台声称·未逐山核验）。
- Source distance library: seed distance library citing 8264/两步路; not per-mountain URL/track verified.
- 时长=山地粗估2km/h、非真轨迹耗时；仅 beginner/intermediate 且单一路线为往返/环线、距离不超过16km时生成。
- Part2 接两步路/六只脚真距离+真耗时+轨迹。
- Existing non-empty coordinates remain seed_literal unless explicitly enriched by an authority reference or curated canonical.
- 产品执照不等于政府登山许可，也不限制用户登山；它只是产品内部的等级元数据。
- 山峰存在周期性封山与临时管控（如防火期、生态修复期），开放线路可能逐段调整；出行前请以当地景区/主管部门最新公告为准。

## Source Class Distribution

| Field | Source class | Count |
|---|---|---:|
| coordinate | authority_reference | 13 |
| coordinate | curated_canonical | 6 |
| coordinate | seed_literal | 340 |
| altitude | authority_reference | 5 |
| altitude | null | 5 |
| altitude | seed_literal | 349 |
| length | seed_claimed_platform_source | 359 |

## Access Status

| Status | Count |
|---|---:|
| closed | 7 |
| open | 347 |
| pilgrimage_only | 1 |
| unknown | 4 |

### Non-open / unknown records

- `gangrenboqi-cluster` 冈仁波齐周边山峰: pilgrimage_only / religious / 仅保留转山线路；主峰无成功登顶记录，当地视为神山。外转里程因起点口径不同约52–57km。 | source=源数据明写「主峰禁止攀登，转山路线成熟」；无任何成功登顶记录；外转52-57km(起点口径差)
- `gongga-nama-feng` 那玛峰: unknown / n/a / 现有官方信息对那玛峰开放状态表述不一致，本轮不选边，出行前应核对当地最新公告。 | source=官方口径自相矛盾，证据不足：①康定市教体局2026-04-21答复称那玛峰位于贡嘎山自然保护区核心区、不符合开放条件（康定市仅乌库楚、雅姆雪山两座6/1起开放）；②2025-11-15康定市公告点名封闭、恢复开放另行公告，且无任何解除公告；③但2025-09甘孜州教体局曾称「那玛峰是个开放区域」。两说冲突且均为官方，故不选边。
- `kawagebo` 卡瓦格博峰: closed / both / 卡瓦格博峰至今无人登顶；德钦县及梅里雪山国家公园现行通告对相关区域实施禁入管理。 | source=德钦县2025-10-14四部门通告 + 梅里雪山国家公园2026-04-30禁入通告；未登峰(1987-1996九次尝试全败)；藏区八大神山之首
- `namchabarwa` 南迦巴瓦峰: unknown / n/a / 现有资料不足以确定长期开放状态；南迦巴瓦峰攀登难度极高，出行前应核对当地最新公告。 | source=证据不足：无成文禁令，但主峰长期无人可登（属难度问题，非准入）
- `nianbaoyuze` 年保玉则: closed / regulation / 年保玉则景区自2018年4月起停止接待，现有资料未显示已恢复开放。 | source=2018-04起景区全域停止接待至今未复开；三江源国家级自然保护区核心区
- `nyainqentanglha` 念青唐古拉峰: unknown / n/a / 现有资料不足以确定长期开放状态；念青唐古拉峰攀登难度高，出行前应核对当地最新公告。 | source=证据不足：无成文禁令，但主峰长期无人可登（属难度问题，非准入）
- `queer-shan` 雀儿山主峰: closed / regulation / 雀儿山自2020年关闭，2024年公告称尚未向社会开放登山活动。 | source=甘孜州教育和体育局+四川省登山户外运动协会《关于禁止雀儿山攀登的公告》2024-05-17（公章原件）：自2020年因安全问题关闭以来至今未向社会开放一切登山活动，严禁未经批准擅自进入雀儿山区域进行登山活动
- `yading-xiannairi` 仙乃日: closed / both / 仙乃日位于亚丁国家级自然保护区，历次公告明确相关未开发未开放区域禁止擅自进入。 | source=亚丁国家级自然保护区禁入公告(2019-06/2023-09/2024-09/2025-11-17标题含「登山」)；属未公布山峰；三怙主神山
- `yading-xianuoduoji` 夏诺多吉: closed / both / 夏诺多吉位于亚丁国家级自然保护区，历次公告明确相关未开发未开放区域禁止擅自进入。 | source=亚丁国家级自然保护区禁入公告（2019-06/2023-09/2024-09/2025-11-17）；属未公布山峰；三怙主神山
- `yading-yangmaiyong` 央迈勇: closed / both / 央迈勇位于亚丁国家级自然保护区，历次公告明确相关未开发未开放区域禁止擅自进入。 | source=亚丁国家级自然保护区禁入公告（2019-06/2023-09/2024-09/2025-11-17）；属未公布山峰；三怙主神山
- `yala-xueshan` 雅拉雪山: unknown / n/a / 雅拉雪山主峰至今无人登顶，现有资料不足以确定长期开放状态。 | source=证据不足：无成文禁令，但主峰长期无人可登（属难度问题，非准入）
- `yulong-xueshan` 玉龙雪山: closed / regulation / 玉龙县2026年1月7日通告禁止进入海拔3500米以上区域开展徒步、登山和探险。 | source=玉龙纳西族自治县人民政府2026-01-07通告：禁3500m以上区域徒步/登山/探险；主峰5596m必然覆盖

## Added Claim Basis

| Basis | Count |
|---|---:|
| needs_review | 18 |

## S1.4 Intro Permit Cleanup

| Key | Before | After |
|---|---|---|
| `aerjin-shan` | 甘肃西部阿克塞境内的阿尔金山主峰，攀登需具备高海拔经验并按规定办理正规手续。 | 阿尔金山主峰位于甘肃省阿克塞境内，是甘肃西部高山地貌的重要山峰。 |
| `animaqing-feng` | 藏区神山阿尼玛卿峰横卧昆仑山东段，6282米雪脊需高海拔经验与正规手续。 | 藏区四大神山之一阿尼玛卿峰，海拔6282米，也是昆仑山脉东段主峰。 |
| `baima-xueshan-zhalaqueni-feng` | 滇金丝猴原生地环绕白马雪山扎拉雀尼峰，5429米攀登需高海拔经验与正规手续。 | 国家级自然保护区内的白马雪山扎拉雀尼峰，海拔5429米，也是滇金丝猴原生地。 |
| `banji-feng` | 冰川与冰坡构成半脊峰的技术路段，5430米攀登需高海拔经验与正规手续。 | 冰川与冰坡构成半脊峰的技术攀登路段，主峰海拔5430米。 |
| `bukadaban-feng` | 昆仑山东段的布喀达坂峰高达6860米，技术攀登须有专业向导并办理官方许可。 | 青海省最高峰布喀达坂峰，海拔6860米，也是昆仑山脉东段核心山峰。 |
| `dalari-feng` | 喜马拉雅中段的打拉日峰高达6777米，大本营往返攀登须办理正规手续。 | 喜马拉雅山脉中段核心山峰打拉日峰，海拔6777米。 |
| `dangling-xiaqiangla` | 高海拔雪线围绕党岭夏羌拉，5470米攀登需高海拔经验并办理正规手续。 | 党岭村至大本营的往返路线通向党岭夏羌拉，主峰海拔5470米。 |
| `dangling-xiaqiangniea` | 高海拔雪线围绕党岭夏羌涅阿，5260米攀登需高海拔经验并办理正规手续。 | 党岭村至大本营的往返路线通向党岭夏羌涅阿，主峰海拔5260米。 |
| `duri-feng` | 高海拔雪线围绕松潘都日峰，5437米攀登需高海拔经验并办理正规手续。 | 松潘县至大本营的往返路线通向都日峰，主峰海拔5437米。 |
| `gangpengqing-feng` | 喜马拉雅西段岗彭庆峰高达7299米，技术攀登须有专业向导并办理官方许可。 | 喜马拉雅山脉西段核心山峰岗彭庆峰，海拔7299米。 |
| `gangshka-xuefeng` | 祁连山东段最高峰岗什卡雪峰高达5254.5米，攀登需高海拔经验与正规手续。 | 祁连山脉东段最高峰岗什卡雪峰，海拔5254.5米。 |
| `gaoligongshan-gawagapu-feng` | 高黎贡山主峰嘎娃嘎普峰立于保护区，5128米攀登需高海拔经验与正规手续。 | 国家级自然保护区内的高黎贡山嘎娃嘎普峰，海拔5128米，也是高黎贡山主峰。 |
| `gasherbrum-2-feng` | 世界第十三高峰加舒尔布鲁木II峰，8035米技术攀登须配专业装备与官方许可。 | 喀喇昆仑山脉核心山峰加舒尔布鲁木II峰，海拔8035米，位列世界第十三高峰。 |
| `geladandong-feng` | 长江源头各拉丹冬峰也是唐古拉山主峰，6621米技术攀登须获官方许可。 | 长江源头的各拉丹冬峰，海拔6621米，也是唐古拉山脉主峰。 |
| `genie-shan` | 四川第三高峰格聂神山主峰高达6204米，登山需高海拔经验并办理正规手续。 | 藏区神山格聂神山主峰，海拔6204米，也是四川第三高峰。 |
| `gongga-baihaizi-shan` | 贡嘎卫峰白海子山主峰高达5924米，技术攀登须由专业向导组织并办理许可。 | 贡嘎卫峰白海子山主峰，海拔5924米，是一座技术型雪山。 |
| `gongga-jiazi-feng` | 大岩壁构成贡嘎嘉子峰的技术核心，6540米西壁攀登须配技术装备并办理许可。 | 大岩壁构成贡嘎嘉子峰的技术攀登特征，山峰海拔6540米，也是贡嘎卫峰。 |
| `gongga-leduomanyin-feng` | 冰川路段构成贡嘎勒多曼因峰的技术核心，6112米攀登须配技术装备并办理许可。 | 传统冰川路线通向贡嘎勒多曼因峰，山峰海拔6112米，也是贡嘎卫峰。 |
| `gongga-nama-feng` | 贡嘎群峰观景点那玛峰高达5588米，攀登需高海拔经验并办理正规手续。 | 贡嘎群峰观景点那玛峰，海拔5588米，也是贡嘎卫峰。 |
| `gongga-riwuqie-feng` | 冰壁与岩壁构成贡嘎日乌且峰的技术路段，6376米攀登须配技术装备并办理许可。 | 冰壁与岩壁构成贡嘎日乌且峰的技术路段，山峰海拔6376米，也是贡嘎卫峰。 |
| `gongga-shan` | 蜀山之王贡嘎主峰高达7556米，极高山技术攀登须配专业装备并获官方许可。 | “蜀山之王”贡嘎雪山主峰，海拔7556米，也是四川省最高峰。 |
| `gongga-tianhaizi-shan` | 冰壁与岩壁交织田海子山主峰，6070米技术攀登须配技术装备并办理许可。 | 冰壁与岩壁混合路段构成田海子山主峰的技术特征，山峰海拔6070米，也是贡嘎卫峰。 |
| `gongga-xiaogongga-feng` | 技术雪线围绕贡嘎小贡嘎峰，5928米攀登需高海拔经验并办理正规手续。 | 贡嘎群峰中的贡嘎小贡嘎峰，海拔5928米，经典路线由子梅村经大本营往返主峰。 |
| `haba-xueshan` | 云南高海拔雪山标杆哈巴雪山，5396米主峰须具备高海拔经验并办理正规许可。 | 云南高海拔雪山标杆哈巴雪山主峰，海拔5396米，经典路线由哈巴村经大本营往返主峰。 |
| `hantengeli-feng` | 天山第二高峰汗腾格里峰逼近7000米，技术攀登须取得官方许可。 | 天山山脉第二高峰汗腾格里峰，海拔6995米，是近七千米级技术型雪山。 |
| `jiangsanglamu-feng` | 喜马拉雅中段的姜桑拉姆峰升至6325米，攀登须具备高海拔经验并办理正规许可。 | 喜马拉雅山脉中段核心山峰姜桑拉姆峰，海拔6325米，经典路线经大本营往返主峰。 |
| `jietongsusong-feng` | 喜马拉雅东段的解同速松峰升至6240米，攀登须具备高海拔经验并办理正规许可。 | 喜马拉雅山脉东段核心山峰解同速松峰，海拔6240米，经典路线经大本营往返主峰。 |
| `kawagebo` | 卡瓦格博峰属于高海拔进阶目标，出发前需具备高海拔经验并办理正规手续。 | 卡瓦格博峰位于云南省迪庆高山地带，是梅里雪山山系的冰雪主峰。 |
| `kongur-feng` | 昆仑山最高峰公格尔峰升至7649米，技术攀登须取得官方许可。 | 昆仑山最高峰公格尔峰，海拔7649米，也是帕米尔高原核心山峰。 |
| `kongur-jiubie-feng` | 公格尔九别峰与公格尔峰并立，7530米技术攀登须取得官方许可。 | 公格尔峰的姊妹峰公格尔九别峰，海拔7530米，经典路线为传统攀登路线。 |
| `kulagangri-feng` | 藏区神山库拉岗日峰立于山南，7538米技术攀登须取得官方许可。 | 山南最高峰库拉岗日峰，海拔7538米，也是藏区四大神山之一。 |
| `luozi-feng` | 世界第四高峰洛子峰与珠峰并立，攀登须依托专业向导并取得国家级许可。 | 世界第四高峰洛子峰，海拔8516米，也是珠峰的姊妹峰，传统路线位于南坡。 |
| `luzi-feng` | 启孜峰姊妹峰鲁孜峰耸立至6154米，参与高海拔攀登须办理正规许可。 | 启孜峰姊妹峰鲁孜峰，海拔6154米，是技术型雪山，经典路线由羊八井经大本营往返主峰。 |
| `makalu-feng` | 世界第五高峰马卡鲁峰高达8463米，技术攀登须取得国家级登山许可。 | 世界第五高峰马卡鲁峰，海拔8463米，经典路线沿传统西北坡展开。 |
| `mengdagangri-feng` | 喜马拉雅山东段的蒙达岗日峰高达6426米，高海拔攀登须办理正规许可。 | 喜马拉雅山脉东段核心山峰蒙达岗日峰，海拔6426米，经典路线经大本营往返主峰。 |
| `muztagata-feng` | 人称"冰川之父"的慕士塔格峰，7546米冰川漫坡，常作为高海拔登山的训练目标，须官方许可。 | 人称"冰川之父"的慕士塔格峰，7546米冰川漫坡，常作为高海拔登山的训练目标。 |
| `namchabarwa` | 面向高海拔进阶攀登的南迦巴瓦峰，参与者须具备高海拔经验并依正规手续行动。 | 南迦巴瓦峰位于西藏自治区，是喜马拉雅东段的高海拔冰雪山峰。 |
| `namunani-feng` | 与冈仁波齐隔湖相望的纳木那尼峰，高达7694米，攀登须取得官方许可。 | 与冈仁波齐隔湖相望的阿里神山纳木那尼峰，海拔7694米，传统线路沿西坡展开。 |
| `nianbaoyuze` | 面向高海拔进阶目标的年保玉则，参与者须具备高海拔经验并依正规手续行动。 | 年保玉则位于青海省，冰雪峰群与高原湖泊共同构成高原山地景观。 |
| `ningjinkangsha-feng` | 拉轨岗日主峰宁金抗沙峰高达7206米，技术攀登须取得官方许可。 | 宁金抗沙峰是拉轨岗日山脉主峰，海拔7206米，传统线路沿南坡通向山峰。 |
| `nyainqentanglha` | 面向高海拔进阶攀登的念青唐古拉峰，参与者须具备高海拔经验并依正规手续行动。 | 念青唐古拉峰位于西藏自治区，是念青唐古拉山脉的高海拔冰雪山峰。 |
| `qilianshan-tuanjie-feng` | 祁连山脉最高峰团结峰高达5808米，高海拔攀登须办理正规许可。 | 祁连山脉最高峰团结峰，海拔5808米，传统线路连接肃北县与团结峰大本营。 |
| `qiongmugangri-feng` | 念青唐古拉西段的穷母岗日峰高达7048米，技术攀登须取得官方许可。 | 穷母岗日峰位于念青唐古拉山脉西段，海拔7048米，是该山脉西段的核心山峰。 |
| `qizi-feng` | 羊八井线路通向启孜峰6206米雪线，高海拔攀登须具备经验并办理正规许可。 | 羊八井线路通向六千米级雪山启孜峰，海拔6206米，途中经过启孜峰大本营。 |
| `queer-shan` | 川藏北线最高峰雀儿山以冰壁攀登著称，技术攀登须配备专业向导并办理许可。 | 以冰壁攀登著称的经典雪山雀儿山主峰，是川藏北线最高峰，海拔6168米。 |
| `sanao-aotaiji` | 三奥雪山主峰奥太基高达5286米，高海拔攀登须具备经验并办理正规许可。 | 三奥雪山主峰奥太基，海拔5286米，线路由黑水县城经大本营通往主峰。 |
| `sanao-aotaimei` | 三奥雪山核心奥太美耸立至5257米，高海拔攀登须具备经验并办理正规许可。 | 三奥雪山核心峰奥太美，海拔5257米，线路由黑水县城经大本营通往主峰。 |
| `sanao-aotaina` | 三奥雪山群中的奥太娜耸立至5210米，高海拔攀登须具备经验并办理正规许可。 | 黑水县城线路通向三奥雪山奥太娜，峰顶海拔5210米，途中经过大本营。 |
| `sangdankangsang-feng` | 念青唐古拉北段的桑丹康桑峰高达6590米，高海拔攀登须办理正规许可。 | 桑丹康桑峰位于念青唐古拉山脉北段，海拔6590米，是藏区二十五座神山之一。 |
| `shishapangma-lenggang-feng` | 希夏邦马卫峰冷岗峰高达6225米，高海拔攀登须具备经验并办理正规许可。 | 希夏邦马峰的卫峰冷岗峰，海拔6225米，线路由聂拉木县经大本营通往主峰。 |
| `siguniang-dafeng` | 海子沟深处的四姑娘山大峰，5025米开阔雪坡考验高海拔经验，攀登需正规手续。 | 海子沟线路通向四姑娘山大峰，峰顶海拔5025米，途中经过大峰大本营。 |
| `siguniang-erfeng` | 海子沟路线通向四姑娘山二峰5276米冰雪路段，参与者须具备高海拔经验并办理正规许可。 | 包含少量冰雪路段的四姑娘山二峰，海拔5276米，线路由日隆镇经海子沟和大本营通往主峰。 |
| `siguniang-luotuo-feng` | 冰川与岩壁构成四姑娘山骆驼峰，5484米技术路线须凭经验和正规许可参与。 | 冰川与岩壁路段构成四姑娘山骆驼峰线路，海拔5484米，路线经长坪沟和大本营通往主峰。 |
| `siguniang-sanfeng` | 攀岩路段通向四姑娘山三峰，5355米高海拔技术路线须凭经验和正规许可参与。 | 攀岩路段构成四姑娘山三峰线路，海拔5355米，路线由日隆镇经海子沟和大本营通往主峰。 |
| `siguniang-yaomei-feng` | 蜀山之后幺妹峰高达6250米，技术攀登须配备专业向导并取得官方许可。 | “蜀山之后”四姑娘山幺妹峰是四川第二高峰，海拔6250米，也是中国技术型攀登标杆山峰。 |
| `tanglaangqu-feng` | 念青唐古拉山脉核心雪峰唐拉昂曲，6330米攀登需高海拔经验与正规许可。 | 念青唐古拉山脉核心峰唐拉昂曲，海拔6330米，线路由羊八井经大本营通往主峰。 |
| `tuomuer-feng` | 天山最高峰托木尔峰耸立至7443米，攀登须持官方许可并由专业团队保障。 | 天山山脉最高峰托木尔峰，海拔7443米，经典线路为托木尔峰传统路线。 |
| `xiling-xueshan` | 成都群山之巅的西岭雪山，景区之外通往5364米主峰需高海拔经验与正规手续。 | 西岭雪山位于四川省，冰雪山体与景区登山线构成成都西部的高山景观。 |
| `xixiabangma-feng` | 中国境内的八千米高峰希夏邦马，8012米攀登须获国家许可并依靠专业向导与技术装备。 | 唯一完全位于中国境内的八千米级极高峰希夏邦马峰，峰顶海拔8012米，传统线路沿南坡展开。 |
| `xuebao-ding` | 岷山主峰雪宝顶耸立至5588米，西壁攀登须由专业向导携技术装备并办理许可。 | 岷山山脉主峰雪宝顶，海拔5588米，经典线路沿传统西壁路线展开。 |
| `xuelong-bao` | 冰川与岩壁交织雪隆包，5527米往返攀登需高海拔经验、正规许可与专业装备。 | 冰川与岩壁路段构成雪隆包线路，峰顶海拔5527米，路线由孟屯河谷经大本营通往主峰。 |
| `yading-xiannairi` | 高海拔进阶目标仙乃日，行前须具备高海拔经验并办理正规手续。 | 仙乃日位于四川省稻城亚丁，与央迈勇、夏诺多吉并列为三怙主神山。 |
| `yading-xianuoduoji` | 高海拔进阶目标夏诺多吉，行前须具备高海拔经验并办理正规手续。 | 夏诺多吉位于四川省稻城亚丁，与仙乃日、央迈勇并列为三怙主神山。 |
| `yading-yangmaiyong` | 高海拔进阶目标央迈勇，行前须具备高海拔经验并办理正规手续。 | 央迈勇位于四川省稻城亚丁，与仙乃日、夏诺多吉并列为三怙主神山。 |
| `yala-xueshan` | 5820米雅拉雪山属于高海拔进阶目标，行前须有高海拔经验并办理正规手续。 | 雅拉雪山位于四川省甘孜高原，冰雪主峰与高山峡谷构成山地景观。 |
| `yulong-xueshan` | 玉龙雪山冰川公园景区线开放游览，景区之外的高海拔目标需经验与正规手续。 | 玉龙雪山位于云南省，以扇子陡为代表高点，冰川与高山景观构成丽江雪山地标。 |
| `yuzhu-yuxu-feng` | 昆仑山脉核心雪峰玉虚峰耸立至5933米，攀登需高海拔经验与正规许可。 | 玉珠峰姊妹峰玉虚峰也是昆仑核心峰与藏区神山，海拔5933米，线路由格尔木经大本营通往主峰。 |
| `zhangzi-feng` | 珠峰北侧的章子峰耸立至7543米，技术攀登须获官方许可并依靠专业团队与装备。 | 珠峰北峰章子峰属于七千米级技术型雪山，海拔7543米，传统线路沿北坡展开。 |
| `zhumulangma-beipo` | 世界最高峰珠穆朗玛耸立至8848.86米，北坡攀登须获国家许可并配专业团队与技术装备。 | 世界最高峰珠穆朗玛峰的北坡，峰顶海拔8848.86米，是喜马拉雅山脉主峰的传统攀登线路。 |
| `zhuoaoyou-feng` | 世界第六高峰卓奥友峰高达8201米，西北坡攀登须获国家许可并依靠专业向导与技术装备。 | 世界第六高峰卓奥友峰属于八千米级雪山，海拔8201米，传统线路沿西北坡展开。 |

## Route Semantics

| Semantic | Count |
|---|---:|
| conflict | 6 |
| loop | 61 |
| null | 9 |
| one_way | 31 |
| round_trip | 244 |
| traverse | 7 |
| unmarked | 1 |

## Duration

| Result | Count |
|---|---:|
| estimated | 258 |
| not_estimated_difficulty | 65 |
| not_estimated_length_cap | 13 |
| not_estimated_length_missing | 15 |
| not_estimated_route_semantic | 8 |

## Length Resolution

- 单线绑定代表线：344
- 多线路仅保留 per-route：6
- 待处理：15

## 坐标精度补录 backlog

- `nianbaoyuze` 年保玉则: curated_canonical，待补更高精度来源
- `yading-xiannairi` 仙乃日: curated_canonical，待补更高精度来源
- `yading-xianuoduoji` 夏诺多吉: curated_canonical，待补更高精度来源
- `yading-yangmaiyong` 央迈勇: curated_canonical，待补更高精度来源
- `yala-xueshan` 雅拉雪山: curated_canonical，待补更高精度来源
- `yulong-xueshan` 玉龙雪山: curated_canonical，待补更高精度来源

## Enrichment Sources

| Key | Entity | Coordinate | Altitude | Coordinate source | Altitude source | Bbox | Multi candidate / spread |
|---|---|---|---|---|---|---|---|
| `bogeda-feng` | 博格达峰 | 43.793232, 88.344441 | 5445m | gns:bogeda-feng | catalog:catalog:0401 | true | true / 15911m |
| `broad-peak` | 布洛阿特峰 | 35.810927, 76.568086 | 8051m | gns:broad-peak | catalog:catalog:0394 | true | false / 0m |
| `gasherbrum-1-feng` | 加舒尔布鲁木I峰 | 35.724925, 76.697502 | 8080m | gns:gasherbrum-1-feng | catalog:catalog:0393 | true | false / 0m |
| `gasherbrum-2-feng` | 加舒尔布鲁木II峰 | 35.759071, 76.65375 | 8035m | gns:gasherbrum-2-feng | catalog:catalog:0395 | true | false / 0m |
| `hantengeli-feng` | 汗腾格里峰 | 42.213292, 80.175985 | 6995m | gns:hantengeli-feng | catalog:catalog:0400 | true | false / 0m |
| `kawagebo` | 卡瓦格博峰 | 28.440043, 98.687263 | 6740m | gns:kawagebo | authority:sport-kawagebo | true | false / 0m |
| `kongur-feng` | 公格尔峰 | 38.579444, 75.315278 | 7649m | gns:kongur-feng | catalog:catalog:0397 | true | false / 0m |
| `kongur-jiubie-feng` | 公格尔九别峰 | 38.666667, 75.166667 | 7530m | gns:kongur-jiubie-feng | catalog:catalog:0398 | true | false / 0m |
| `muztagata-feng` | 慕士塔格峰 | 38.283333, 75.116667 | 7546m | gns:muztagata-feng | catalog:catalog:0396 | true | false / 0m |
| `namchabarwa` | 南迦巴瓦峰 | 29.666667, 95.166667 | 7782m | gns:namchabarwa | authority:sport-mountain-grade-standard | true | false / 0m |
| `nianbaoyuze` | 年保玉则 | 33.28, 101.14 | 5369m | curated:claude-canonical-six-v1 | authority:qinghai-nianbaoyuze | true | false / 0m |
| `nyainqentanglha` | 念青唐古拉峰 | 30.383333, 90.566667 | 7162m | gns:nyainqentanglha | authority:sport-mountain-grade-standard | true | false / 0m |
| `qiaogeli-feng-k2` | 乔戈里峰（K2） | 35.88159, 76.512927 | 8611m | gns:qiaogeli-feng-k2 | catalog:catalog:0392 | true | false / 0m |
| `tuomuer-feng` | 托木尔峰 | 42.037094, 80.116439 | 7443m | gns:tuomuer-feng | catalog:catalog:0399 | true | false / 0m |
| `yading-xiannairi` | 仙乃日 | 28.39, 100.33 | - | curated:claude-canonical-six-v1 | catalog:catalog:0277, authority:sichuan-yading, manual-conflict:yading-xiannairi:altitude:s1.4 | true | false / 0m |
| `yading-xianuoduoji` | 夏诺多吉 | 28.43, 100.36 | - | curated:claude-canonical-six-v1 | catalog:catalog:0278, authority:sichuan-yading, manual-conflict:yading-xianuoduoji:altitude:s1.4 | true | false / 0m |
| `yading-yangmaiyong` | 央迈勇 | 28.33, 100.31 | - | curated:claude-canonical-six-v1 | catalog:catalog:0279, authority:sichuan-yading, manual-conflict:yading-yangmaiyong:altitude:s1.4 | true | false / 0m |
| `yala-xueshan` | 雅拉雪山 | 30.72, 101.47 | 5820m | curated:claude-canonical-six-v1 | catalog:catalog:0270 | true | false / 0m |
| `yulong-xueshan` | 玉龙雪山 | 27.1, 100.18 | 5590.2m | curated:claude-canonical-six-v1 | authority:yunnan-yulong-2025-survey | true | false / 0m |

## Residual Length Gaps

- `helan-shan` 贺兰山: conflict
- `huanggang-shan` 黄岗山: conflict
- `kawagebo` 卡瓦格博峰: conflict
- `lue-shan` 芦芽山: conflict
- `namchabarwa` 南迦巴瓦峰: conflict
- `nianbaoyuze` 年保玉则: conflict
- `nyainqentanglha` 念青唐古拉峰: conflict
- `wuling-shan` 雾灵山: conflict
- `yading-xiannairi` 仙乃日: conflict
- `yading-xianuoduoji` 夏诺多吉: conflict
- `yading-yangmaiyong` 央迈勇: conflict
- `yala-xueshan` 雅拉雪山: conflict
- `yubeng-route` 雨崩徒步线: conflict
- `yulong-xueshan` 玉龙雪山: conflict
- `yuzhu-feng` 玉珠峰: conflict

## Route Note Backlog

- `kawagebo` 卡瓦格博峰: bound route candidate missing
- `namchabarwa` 南迦巴瓦峰: bound route candidate missing
- `nianbaoyuze` 年保玉则: bound route candidate missing
- `nyainqentanglha` 念青唐古拉峰: bound route candidate missing
- `yading-xiannairi` 仙乃日: bound route candidate missing
- `yading-xianuoduoji` 夏诺多吉: bound route candidate missing
- `yading-yangmaiyong` 央迈勇: bound route candidate missing
- `yala-xueshan` 雅拉雪山: bound route candidate missing
- `yulong-xueshan` 玉龙雪山: bound route candidate missing

## Intro Review (359)

- `aerjin-shan` 阿尔金山主峰: 阿尔金山主峰位于甘肃省阿克塞境内，是甘肃西部高山地貌的重要山峰。 | added_claims=[{"claim":"阿尔金山主峰位于甘肃省阿克塞境内，是甘肃西部高山地貌的重要山峰。","basis":"needs_review","note":"阿克塞境内的甘肃西部山峰定位来自用户已锁定的S1.3纠偏"}]
- `ailao-shan` 哀牢山: 原始森林铺满哀牢山国家级自然保护区，成熟步道穿行在3166米山地间。 | added_claims=[]
- `animaqing-feng` 阿尼玛卿峰: 藏区四大神山之一阿尼玛卿峰，海拔6282米，也是昆仑山脉东段主峰。 | added_claims=[]
- `ao-shan` 鳌山: 秦岭第二高峰鳌山，以3475米高山草甸串起经典鳌太穿越的苍茫山脊。 | added_claims=[]
- `bagong-shan` 八公山: 淝水之战与淮南子文化交汇八公山，完善步道环绕241.2米历史名山。 | added_claims=[]
- `baicaopan` 野三坡白草畔: 高山草甸与森林覆盖野三坡白草畔，1983米景区也是夏日避暑去处。 | added_claims=[]
- `baihua-shan` 百花山: 森林与草甸铺展北京百花山，1991米保护区内已有完善景区步道。 | added_claims=[]
- `baima-jian` 白马尖: 大别山最高峰白马尖以森林峡谷见长，1777米山路已有成熟徒步线路。 | added_claims=[]
- `baima-xueshan-zhalaqueni-feng` 白马雪山扎拉雀尼峰: 国家级自然保护区内的白马雪山扎拉雀尼峰，海拔5429米，也是滇金丝猴原生地。 | added_claims=[]
- `baishan-zu` 百山祖: 百山祖冷杉生长在浙江第二高峰，1856.7米保护区内可循成熟步道。 | added_claims=[]
- `baishi-shan` 白石山: 大理岩峰林托起白石山，悬空栈道穿过2096米的北方奇山景观。 | added_claims=[]
- `baiyun-shan-guangdong` 白云山: 羊城第一秀白云山嵌入广州城中，环线步道由景区正门通往摩星岭。 | added_claims=[{"claim":"白云山代表高点为摩星岭","basis":"needs_review","note":"简介已使用该世界知识关系，但冻结源未明确支持，需人工补证"}]
- `baiyun-shan-luoyang` 洛阳白云山: 中原极顶洛阳白云山森林浓密，2216米玉皇顶线路也是避暑去处。 | added_claims=[{"claim":"洛阳白云山代表高点为玉皇顶","basis":"needs_review","note":"简介已使用该世界知识关系，但冻结源未明确支持，需人工补证"}]
- `baizhang-ling` 百丈岭: 浙西三尖核心百丈岭串联森林与古道，平缓环线穿行在1334米山地间。 | added_claims=[]
- `balang-shan` 巴朗山: 川西门户巴朗山铺展高山草甸与云海，5040米山地可循成熟往返线路。 | added_claims=[]
- `bamian-shan` 八面山: 罗霄山脉核心八面山铺开高山草甸，2042.1米山脊是华南经典徒步目的地。 | added_claims=[]
- `banji-feng` 半脊峰: 冰川与冰坡构成半脊峰的技术攀登路段，主峰海拔5430米。 | added_claims=[]
- `baota-shan` 宝塔山: 延安城市象征宝塔山承载红色记忆，完善步道环绕1135.5米景区山地。 | added_claims=[]
- `baxian-shan` 八仙山: 天津次生林在八仙山保护区铺展，1052米聚仙峰线路生态景观丰富。 | added_claims=[]
- `beiling-shan` 北灵山: 高山草甸铺展北灵山，1922米环线也是京郊热门露营徒步去处。 | added_claims=[]
- `beiwudang-shan` 北武当山: 道教名山北武当山以花岗岩峰林见长，景区步道通往2254米金顶。 | added_claims=[]
- `bijia-shan-liaoning` 笔架山: 天桥奇观连接渤海湾笔架山，完善景区步道通往78.3米海岛山岳。 | added_claims=[]
- `bogeda-feng` 博格达峰: 天山东段主峰博格达峰，冰雪之巅俯临天山天池，是新疆醒目的雪山地标。 | added_claims=[]
- `broad-peak` 布洛阿特峰: 世界第十二高峰布洛阿特峰，8051米冰岩高悬于喀喇昆仑山脉。 | added_claims=[]
- `bukadaban-feng` 布喀达坂峰: 青海省最高峰布喀达坂峰，海拔6860米，也是昆仑山脉东段核心山峰。 | added_claims=[]
- `caishi-ji` 采石矶: 长江三大名矶之一采石矶承载李白文化，景区环线绕行翠螺山。 | added_claims=[]
- `cang-shan` 藏山: 赵氏孤儿传说为藏山留下千年回响，成熟石阶从景区铺向约1700米山巅。 | added_claims=[]
- `cangshan-yunnan` 苍山: 大理苍山以马龙峰为主峰，4122米山地已有成熟往返徒步线路。 | added_claims=[]
- `cangyan-shan` 苍岩山: 悬空寺嵌入苍岩山历史山景，完善步道由景区正门通往玉皇顶。 | added_claims=[]
- `cha-shan` 茶山: 河北第二高峰茶山铺开高山草甸，2524米环线也是小众露营徒步去处。 | added_claims=[]
- `changbaishan` 长白山: 火山天池为长白山点亮东北天际，2691米白云峰立于苍茫林海之上。 | added_claims=[]
- `chaya-shan` 嵖岈山: 西游记取景地嵖岈山遍布花岗岩奇石，完善环线穿过天磨峰景观。 | added_claims=[]
- `chen-shan` 辰山: 矿坑花园藏在上海辰山植物园，完善环线串起71.4米城市山岳。 | added_claims=[]
- `chuandi-ding` 船底顶: 华南经典穿越线翻越船底顶，1586米山地连接罗坑、平坑与新洞。 | added_claims=[]
- `dabai-shan` 大白山: 寒温带原生林覆盖大兴安岭北段大白山，1528.7米保护区已有成熟路线。 | added_claims=[]
- `dabieshan-bodao-feng` 大别山薄刀峰: 花岗岩峰林铺展大别山薄刀峰，1404.2米森林公园已有成熟环线。 | added_claims=[]
- `dadong-shan` 大东山: 广东经典徒步线，大东山的原始森林与山间温泉，藏着岭南少见的野趣。 | added_claims=[]
- `dahong-shan` 大洪山: 佛教文化与绿林起义记忆交汇大洪山，完善步道通往宝珠峰。 | added_claims=[]
- `daiyun-shan` 戴云山: 闽中屋脊戴云山也是福建第二高峰，1856米保护区内已有成熟往返线路。 | added_claims=[]
- `dajue-shan` 大觉山: 峡谷漂流与山岳景观汇聚大觉山，景区环线通往1364米大觉岩。 | added_claims=[]
- `dalari-feng` 打拉日峰: 喜马拉雅山脉中段核心山峰打拉日峰，海拔6777米。 | added_claims=[]
- `daluo-shan` 大罗山: 花岗岩龙脊与水库构成大罗山景观，温州城郊环线选择丰富。 | added_claims=[]
- `damao-shan` 大茂山: 古北岳大茂山藏着森林与瀑布，1898米保护区适合小众山野徒步。 | added_claims=[]
- `daming-shan-guangxi` 大明山: 南宁最高峰大明山铺开保护区山景，1760.4米龙头峰线路也是避暑去处。 | added_claims=[]
- `daming-shan-zhejiang` 大明山: 峡谷、瀑布与悬空栈道汇聚浙西大明山，1489.9米环线通往千亩田。 | added_claims=[]
- `dangling-xiaqiangla` 党岭夏羌拉: 党岭村至大本营的往返路线通向党岭夏羌拉，主峰海拔5470米。 | added_claims=[]
- `dangling-xiaqiangniea` 党岭夏羌涅阿: 党岭村至大本营的往返路线通向党岭夏羌涅阿，主峰海拔5260米。 | added_claims=[]
- `danxiashan-bazhai` 丹霞山巴寨: 世界自然遗产丹霞山巴寨展现丹霞地貌奇观，619.2米往返线路已成熟。 | added_claims=[]
- `daqing-shan` 大青山主峰: 阴山中段大青山主峰铺开草甸与森林，2338米山地也是呼和浩特最高点。 | added_claims=[]
- `darong-shan` 大容山: 高山草甸与湖泊点亮大容山森林公园，完善步道通往1275.6米梅花顶。 | added_claims=[]
- `datudingzi-shan` 大秃顶子山: 张广才岭主峰大秃顶子山也是黑龙江最高峰，四季可见滑雪与徒步风景。 | added_claims=[]
- `dawagengza` 达瓦更扎: 雪山与云海构成达瓦更扎的观景舞台，约3900米山地已有成熟往返线路。 | added_claims=[]
- `dawei-shan` 大围山: 杜鹃花海铺满长沙近郊大围山，完善景区步道通往1607.9米七星岭。 | added_claims=[]
- `diaoluo-shan` 吊罗山: 热带原始林与瀑布覆盖吊罗山森林公园，1499米往返线也是避暑去处。 | added_claims=[]
- `dinghu-shan` 鼎湖山: 中国首个自然保护区鼎湖山守住北回归线绿洲，环线通往鸡笼山。 | added_claims=[]
- `dongbai-shan` 东白山: 高山草甸与风车铺展浙中最高峰东白山，1194.6米山地是热门露营去处。 | added_claims=[]
- `donghu-moshan` 东湖磨山: 东湖磨山嵌入武汉城市山水，完善环线由景区正门通往楚天台。 | added_claims=[]
- `dongling-shan` 东灵山: 北京最高峰东灵山铺展开阔草甸，2303米往返线是京郊经典徒步选择。 | added_claims=[]
- `duku-gonglu-route` 独库公路沿线山峰: 天山景观沿独库公路铺展，那拉提徒步环线串起成熟山野路线。 | added_claims=[]
- `duri-feng` 都日峰: 松潘县至大本营的往返路线通向都日峰，主峰海拔5437米。 | added_claims=[]
- `dushu-jian` 独竖尖: 武夷山脉深处的独竖尖，以2128米山脊串起江西经典穿越风景。 | added_claims=[]
- `duxiu-feng` 独秀峰: 桂林山水名句发源于独秀峰，靖江王府环抱216米历史文化名山。 | added_claims=[]
- `emeishan` 峨眉山: 普贤道场峨眉山云海翻涌，古老石阶由金顶延伸至3099米万佛顶。 | added_claims=[]
- `erlong-shan` 二龙山: 湖泊与森林环绕城市近郊二龙山，完善景区环线提供休闲山野体验。 | added_claims=[]
- `fanjingshan` 梵净山: 世界自然遗产梵净山拔地而起，红云金顶与弥勒道场共同写下黔东灵山气象。 | added_claims=[]
- `fenghuang-shan-guangdong` 凤凰山: 佛教文化融入深圳凤凰山，完善城市步道环绕望烟楼主峰。 | added_claims=[]
- `fenghuang-shan-heilongjiang` 凤凰山: 高山花园与峡谷瀑布交汇黑龙江凤凰山，1696.2米路线适合避暑徒步。 | added_claims=[]
- `fenghuang-shan-liaoning` 凤凰山: 辽东第一山凤凰山以险峻山景和悬空栈道见长，完善步道通往攒云峰。 | added_claims=[]
- `fenghuang-tuo` 凤凰坨: 森林覆盖京郊小众山岳凤凰坨，1529米往返线适合轻装徒步。 | added_claims=[]
- `gang-shan-liaoning` 岗山: 辽宁最高峰岗山深藏龙岗山脉，1373.1米保护区森林覆盖浓密。 | added_claims=[]
- `gangpengqing-feng` 岗彭庆峰: 喜马拉雅山脉西段核心山峰岗彭庆峰，海拔7299米。 | added_claims=[]
- `gangrenboqi-cluster` 冈仁波齐周边山峰: 藏地转山信仰环绕冈仁波齐，塔钦出发的52公里环线承载朝圣者脚步。 | added_claims=[]
- `gangshka-xuefeng` 岗什卡雪峰: 祁连山脉东段最高峰岗什卡雪峰，海拔5254.5米。 | added_claims=[]
- `gaoligongshan-gawagapu-feng` 高黎贡山嘎娃嘎普峰: 国家级自然保护区内的高黎贡山嘎娃嘎普峰，海拔5128米，也是高黎贡山主峰。 | added_claims=[]
- `gasherbrum-1-feng` 加舒尔布鲁木I峰: 世界第十一高峰加舒尔布鲁木I峰，8080米冰岩矗立于喀喇昆仑山脉。 | added_claims=[]
- `gasherbrum-2-feng` 加舒尔布鲁木II峰: 喀喇昆仑山脉核心山峰加舒尔布鲁木II峰，海拔8035米，位列世界第十三高峰。 | added_claims=[]
- `gechuan-jian` 搁船尖: 徽开古道穿过搁船尖喀斯特山地，明教发源地串起成熟环线。 | added_claims=[]
- `geladandong-feng` 各拉丹冬峰: 长江源头的各拉丹冬峰，海拔6621米，也是唐古拉山脉主峰。 | added_claims=[]
- `gele-shan` 歌乐山: 红色记忆融入重庆歌乐山，完善景区环线由正门通往云顶寺。 | added_claims=[]
- `genie-shan` 格聂神山主峰: 藏区神山格聂神山主峰，海拔6204米，也是四川第三高峰。 | added_claims=[]
- `gongga-baihaizi-shan` 白海子山主峰: 贡嘎卫峰白海子山主峰，海拔5924米，是一座技术型雪山。 | added_claims=[]
- `gongga-jiazi-feng` 贡嘎嘉子峰: 大岩壁构成贡嘎嘉子峰的技术攀登特征，山峰海拔6540米，也是贡嘎卫峰。 | added_claims=[]
- `gongga-leduomanyin-feng` 贡嘎勒多曼因峰: 传统冰川路线通向贡嘎勒多曼因峰，山峰海拔6112米，也是贡嘎卫峰。 | added_claims=[]
- `gongga-nama-feng` 那玛峰: 贡嘎群峰观景点那玛峰，海拔5588米，也是贡嘎卫峰。 | added_claims=[]
- `gongga-riwuqie-feng` 贡嘎日乌且峰: 冰壁与岩壁构成贡嘎日乌且峰的技术路段，山峰海拔6376米，也是贡嘎卫峰。 | added_claims=[]
- `gongga-shan` 贡嘎雪山主峰: “蜀山之王”贡嘎雪山主峰，海拔7556米，也是四川省最高峰。 | added_claims=[]
- `gongga-tianhaizi-shan` 田海子山主峰: 冰壁与岩壁混合路段构成田海子山主峰的技术特征，山峰海拔6070米，也是贡嘎卫峰。 | added_claims=[]
- `gongga-xiaogongga-feng` 贡嘎小贡嘎峰: 贡嘎群峰中的贡嘎小贡嘎峰，海拔5928米，经典路线由子梅村经大本营往返主峰。 | added_claims=[]
- `gongyu-yan` 公盂岩: 喀斯特地貌环绕华东小众公盂岩，前坑村至公盂村串起露营徒步环线。 | added_claims=[]
- `gouwei-zhang` 狗尾嶂: 高山草甸与云海铺展广东第四高峰狗尾嶂，1684米环线难度适中。 | added_claims=[]
- `gu-shan-fujian` 鼓山: 涌泉寺坐落于福州鼓山，完善步道串起城市核心山岳的清幽景致。 | added_claims=[]
- `gua-shan` 卦山: 古松与天宁寺相映成景，卦山以佛教文化和文保底蕴铺开山间步道。 | added_claims=[]
- `guangwu-shan` 光雾山: 米仓古道穿过光雾山红叶胜境，完善步道引向2507米山地深处。 | added_claims=[]
- `guanmen-shan` 关门山: 枫叶、森林与瀑布层层展开，关门山以完整步道串起多层山野景观。 | added_claims=[]
- `guanzhai-shan` 冠豸山: “北夷南豸，丹霞双绝”，冠豸山以奇峻丹霞和完善步道迎接来客。 | added_claims=[]
- `gui-feng` 龟峰: 丹霞奇石铺开龟峰的世界遗产画卷，环线步道串起骆驼峰景观。 | added_claims=[]
- `guifeng-shan` 圭峰山: 江门城市山野从圭峰山展开，森林公园步道环绕云峰主峰而行。 | added_claims=[]
- `guniu-jiang` 牯牛降: “华东最后一片原始森林”藏于牯牛降，成熟路线深入自然保护区。 | added_claims=[]
- `haba-xueshan` 哈巴雪山主峰: 云南高海拔雪山标杆哈巴雪山主峰，海拔5396米，经典路线由哈巴村经大本营往返主峰。 | added_claims=[]
- `hailaer-xishan` 海拉尔西山国家森林公园主峰: 樟子松原生林铺满海拉尔西山，完善步道连接城市与664.2米主峰。 | added_claims=[]
- `haituo-shan` 海坨山: 高山草甸与云海构成海坨山的京郊视野，冬奥核心区就在山野周边。 | added_claims=[]
- `hantengeli-feng` 汗腾格里峰: 天山山脉第二高峰汗腾格里峰，海拔6995米，是近七千米级技术型雪山。 | added_claims=[]
- `heban-shan` 鹤伴山: 森林景观铺展在滨州近郊鹤伴山，完善步道通向728.8米山巅。 | added_claims=[]
- `heishan-gu` 黑山谷: 峡谷与瀑布交织成黑山谷的渝黔山色，完善步道穿行约1900米山地。 | added_claims=[]
- `helan-shan` 贺兰山: 宁夏回族自治区境内的贺兰山，3556米高程勾勒出西北山地的起伏轮廓。 | added_claims=[]
- `hengshan-hunan` 衡山: 南岳衡山兼具佛道文化底蕴，景区步道一路通向1300.2米祝融峰。 | added_claims=[]
- `hengshan-shanxi` 恒山: 北岳恒山沉淀深厚道教文化，景区步道由山门通往2016.1米天峰岭。 | added_claims=[]
- `huabo-shan` 花脖山: 瀑布与森林包围辽宁第二高峰花脖山，成熟路线通向1336.1米主峰。 | added_claims=[]
- `huaguoshan-jiangsu` 花果山: 《西游记》文化为花果山增添想象，完善步道通往江苏最高峰玉女峰。 | added_claims=[{"claim":"花果山内部高点为玉女峰","basis":"needs_review","note":"简介已使用该世界知识关系，但冻结源未明确支持，需人工补证"}]
- `huangbai-shan` 黄柏山主峰: 豫鄂交界森林铺满黄柏山，成熟路线从景区通向1352.6米大牛山主峰。 | added_claims=[]
- `huangcao-liang` 黄草梁: 京西古道、长城遗址与高山草甸在黄草梁相遇，柏峪线路延伸至象鼻山。 | added_claims=[]
- `huanggang-liang` 黄岗梁: 森林与草原在黄岗梁交界，大兴安岭最高峰立于2029米山地深处。 | added_claims=[]
- `huanggang-shan` 黄岗山: 桐木村与篁村两条线路分别通向黄岗山，2157.8米山巅横跨闽赣山野。 | added_claims=[]
- `huanghua-liang` 黄花梁: 开阔草甸铺满京西黄花梁，江水河村环线穿过1850米平缓山脊。 | added_claims=[]
- `huangmao-jian` 黄茅尖: “江浙第一高峰”黄茅尖立于凤阳山保护区，成熟路线通往1929米主峰。 | added_claims=[]
- `huangniu-shi` 黄牛石: 粤赣交界的高山草甸铺向黄牛石，成熟环线穿行于1430米山脊。 | added_claims=[]
- `huangshan` 黄山: 奇松、怪石与云海铺展黄山画卷，莲花峰在1864.8米处托起群峰。 | added_claims=[]
- `huangshan-xihai-route` 黄山西海大峡谷环线: 峡谷与峰林构成黄山西海大峡谷环线，排云亭至天海串起核心景观。 | added_claims=[]
- `huapi-ling` 桦皮岭: 草原天路从桦皮岭向西延伸，高山草甸与森林铺满2128.7米山脊。 | added_claims=[]
- `huashan` 华山: “奇险天下第一山”华山壁立关中，经典环线穿过西峰直抵2154.9米南峰。 | added_claims=[]
- `huhe-bashige` 呼和巴什格: 荒漠草原环绕呼和巴什格，2364米狼山主峰立于阴山山脉西段。 | added_claims=[]
- `huihang-gudao-route` 徽杭古道沿线山峰: 古道与峡谷串起徽杭古道穿越线，这条经典徒步路线由浙基田通往永来村。 | added_claims=[]
- `huitengxile-huanghuagou` 辉腾锡勒黄花沟主峰: 草原与风电景观铺满辉腾锡勒黄花沟，景区步道通向约2100米主峰。 | added_claims=[]
- `huoyan-shan` 火焰山: 炽热地貌与《西游记》取景记忆汇聚火焰山，完善步道延伸至831.7米山地。 | added_claims=[]
- `huping-shan` 壶瓶山: “湖南屋脊”壶瓶山立于自然保护区，成熟路线通向2098.7米主峰。 | added_claims=[]
- `hutiaoxia-gaolu-route` 虎跳峡高路徒步线: 峡谷景观一路伴随虎跳峡高路，成熟穿越线由虎跳峡镇延伸至中虎跳。 | added_claims=[]
- `jiaer-mengcuo` 甲尔猛措: 森林、瀑布与海子构成甲尔猛措的山地画面，上孟乡环线深入约4000米山地。 | added_claims=[]
- `jianfeng-ling` 尖峰岭: 热带山海林景观汇聚尖峰岭，成熟路线穿过国家级自然保护区通往主峰。 | added_claims=[]
- `jianglang-shan` 江郎山: 三爿石塑造江郎山丹霞奇观，世界自然遗产步道通向816.8米峰顶。 | added_claims=[]
- `jiangsanglamu-feng` 姜桑拉姆峰: 喜马拉雅山脉中段核心山峰姜桑拉姆峰，海拔6325米，经典路线经大本营往返主峰。 | added_claims=[]
- `jianmen-guan` 剑门关: “蜀道难”的山川记忆凝在剑门关，鸟道环线穿过三国文化景观。 | added_claims=[]
- `jiaoding-shan` 轿顶山: 贡嘎群峰在轿顶山四周铺开，3552米开阔山脊提供一圈雪山全景。 | added_claims=[]
- `jiaozi-xueshan` 轿子雪山: 杜鹃花海与冰雪景观交替铺展，轿子雪山以4223米主峰立于昆明山野。 | added_claims=[]
- `jietongsusong-feng` 解同速松峰: 喜马拉雅山脉东段核心山峰解同速松峰，海拔6240米，经典路线经大本营往返主峰。 | added_claims=[]
- `jigongshan` 鸡公山: 民国风情建筑散落鸡公山间，这座传统避暑名山以完善步道连接报晓峰。 | added_claims=[]
- `jiming-shan` 鸡鸣山: “塞外小泰山”鸡鸣山沉淀历史文化，玉皇顶步道可俯瞰下花园全景。 | added_claims=[]
- `jinfo-shan` 金佛山: 喀斯特桌山地貌托起金佛山，世界自然遗产步道通向2238.2米风吹岭。 | added_claims=[]
- `jinggang-shan` 井冈山: 红色革命记忆沉淀在井冈山，完善步道以五指峰环线串起景区山色。 | added_claims=[{"claim":"井冈山线路关联五指峰","basis":"needs_review","note":"简介已使用该世界知识关系，但冻结源未明确支持，需人工补证"}]
- `jingting-shan` 敬亭山: 李白诗篇为敬亭山留下“江南诗山”之名，完善环线穿过324.1米山地。 | added_claims=[]
- `jinlong-shan` 金龙山: 红叶点亮哈尔滨近郊金龙山，森林公园步道通向826米主峰。 | added_claims=[]
- `jinyun-shan` 缙云山: 道教文化与自然保护区在缙云山相遇，城市步道环绕951米狮子峰。 | added_claims=[]
- `jiucai-ling` 韭菜岭: “湖南K2”韭菜岭穿过保护区山野，经典环线抵达2009.3米主峰。 | added_claims=[]
- `jiucai-ping` 韭菜坪: “贵州屋脊”韭菜坪铺展喀斯特石林与高山草甸，主峰升至2900.6米。 | added_claims=[]
- `jiuding-shan` 九顶山: 高山花海与草甸铺开九顶山的川西景观，成熟路线抵达4989米主峰。 | added_claims=[]
- `jiugongshan` 九宫山: 道教文化与避暑山色汇聚九宫山，完善步道通向1656.7米老鸦尖。 | added_claims=[]
- `jiuhuashan` 九华山: 地藏菩萨道场为九华山留下佛教底蕴，景区步道通往1342米十王峰。 | added_claims=[]
- `jiulong-shan-zhejiang` 九龙山: 原始森林覆盖九龙山自然保护区，成熟路线通往1724.2米主峰。 | added_claims=[]
- `jiushan-ding` 九山顶: 森林覆盖燕山余脉九山顶，成熟路线由常州村通向1078.5米天津最高峰。 | added_claims=[]
- `jiuwan-shan` 九万山: 原始森林藏于九万山自然保护区，保护区路线延伸至1693米无名主峰。 | added_claims=[]
- `jizu-shan` 鸡足山: 迦叶菩萨道场为鸡足山留下佛教底蕴，景区步道通向3248米金顶寺主峰。 | added_claims=[]
- `junfeng-shan` 军峰山: 赣东最高峰军峰山立于森林公园，成熟路线由军溪村通向1760.9米主峰。 | added_claims=[]
- `kawagebo` 卡瓦格博峰: 卡瓦格博峰位于云南省迪庆高山地带，是梅里雪山山系的冰雪主峰。 | added_claims=[{"claim":"卡瓦格博峰位于云南省迪庆高山地带，是梅里雪山山系的冰雪主峰。","basis":"needs_review","note":"梅里雪山主峰与迪庆位置关系来自本轮D节事实，待冻结一手出处"}]
- `kongtong-shan` 崆峒山: “中华道教第一山”崆峒山沉淀道教文化，景区步道通往2123.3米皇城主峰。 | added_claims=[]
- `kongur-feng` 公格尔峰: 昆仑山最高峰公格尔峰，海拔7649米，也是帕米尔高原核心山峰。 | added_claims=[]
- `kongur-jiubie-feng` 公格尔九别峰: 公格尔峰的姊妹峰公格尔九别峰，海拔7530米，经典路线为传统攀登路线。 | added_claims=[]
- `kulagangri-feng` 库拉岗日峰: 山南最高峰库拉岗日峰，海拔7538米，也是藏区四大神山之一。 | added_claims=[]
- `kunyushan` 昆嵛山: 全真派发源地昆嵛山立于胶东半岛，成熟路线通向922.8米泰礴顶。 | added_claims=[]
- `lafa-shan` 拉法山: 花岗岩奇洞塑造拉法山“关东奇山”景观，完善步道通往886.2米云罩峰。 | added_claims=[]
- `lang-shan-hunan` 崀山: 丹霞地貌铺展崀山世界遗产景观，景区步道环绕818米辣椒峰。 | added_claims=[]
- `lang-shan-jiangsu` 狼山: 大势至菩萨道场为狼山留下佛教底蕴，支云塔步道俯临江海景观。 | added_claims=[]
- `langya-shan-anhui` 琅琊山: 《醉翁亭记》的文化记忆落在琅琊山，景区步道由山门通往南天门。 | added_claims=[]
- `langya-shan-hebei` 狼牙山: 红色历史记忆沉淀在狼牙山，完善步道由景区通向1105米棋盘陀。 | added_claims=[]
- `laojunshan-henan` 老君山: 金顶道观群铺展老君山道教景观，景区环线通向2217米马鬃岭。 | added_claims=[]
- `laoshan` 崂山: 山海景观托起崂山这座海岸线第一高峰，巨峰环线穿行1132.7米山地。 | added_claims=[]
- `laotudingzi` 老秃顶子: 原生林覆盖辽宁第三高峰老秃顶子，成熟路线通向1325米保护区山巅。 | added_claims=[]
- `laoyacha-nao` 老鸦岔垴: 森林与高山草甸铺满老鸦岔垴，成熟路线抵达2413.8米河南最高峰。 | added_claims=[]
- `laoye-ling` 老爷岭: 森林覆盖张广才岭核心老爷岭，成熟路线通向1284.7米吉林市最高峰。 | added_claims=[]
- `li-shan` 骊山: 华清宫与西安事变记忆汇聚骊山，景区环线由山门延伸至烽火台。 | added_claims=[]
- `liang-shan-shandong` 水泊梁山: 《水浒传》的文化记忆落在水泊梁山，景区环线串起宋江寨山景。 | added_claims=[]
- `ling-shan-jiangsu` 灵山: 灵山大佛为灵山留下佛教文化地标，完善环线穿行230.7米山地。 | added_claims=[]
- `ling-shan-jiangxi` 灵山: 花岗岩环形峰林塑造灵山，道教名山步道环绕1496米天梯峰。 | added_claims=[]
- `lingtong-shan` 灵通山: 丹霞地貌与悬空寺奇观汇聚灵通山，完善步道通往1281.7米擎天峰。 | added_claims=[]
- `lionggongdao-zhufeng` 刘公岛主峰: 红色历史记忆沉淀在刘公岛，景区环线通向153.5米旗顶山主峰。 | added_claims=[]
- `lishan-shunwang-ping` 历山舜王坪: 华北最大高山草甸铺展在历山舜王坪，2358米中条山主峰立于保护区。 | added_claims=[]
- `liuding-shan` 六鼎山: 高大释迦牟尼坐像构成六鼎山佛教文化景观，完善步道环绕803.6米山地。 | added_claims=[]
- `liupan-shan` 六盘山: 长征纪念地为六盘山留下红色记忆，森林公园步道通往2942米米缸山。 | added_claims=[]
- `longhu-shan` 龙虎山: 道教文化与丹霞地貌交汇龙虎山，世界遗产步道环绕247.4米天门山。 | added_claims=[]
- `longxu-shan` 龙须山: 徽杭古道旁的花岗岩奇山构成龙须山，成熟环线由龙川村通往主峰。 | added_claims=[]
- `loushan-guan` 娄山关: “娄山关大捷”的红色记忆留在娄山关，完善环线穿过1576米山地。 | added_claims=[]
- `lue-shan` 芦芽山: 山西省境内的芦芽山，2739米高程勾勒出山西山地的起伏轮廓。 | added_claims=[]
- `luofushan` 罗浮山: 岭南第一山罗浮山，道教名山底蕴与完善步道一路相伴飞云顶。 | added_claims=[]
- `luozi-feng` 洛子峰: 世界第四高峰洛子峰，海拔8516米，也是珠峰的姊妹峰，传统路线位于南坡。 | added_claims=[]
- `lushan` 庐山: 世界文化遗产庐山承载深厚人文，牯岭镇步道通向1474米汉阳峰。 | added_claims=[]
- `lushan-shandong` 鲁山主峰: 鲁中最高峰鲁山主峰，以森林与瀑布景观串起成熟的公园徒步线。 | added_claims=[]
- `luzi-feng` 鲁孜峰: 启孜峰姊妹峰鲁孜峰，海拔6154米，是技术型雪山，经典路线由羊八井经大本营往返主峰。 | added_claims=[]
- `maiji-shan` 麦积山: 中国四大石窟之一坐落麦积山，世界文化遗产与完善步道在山间相接。 | added_claims=[]
- `makalu-feng` 马卡鲁峰: 世界第五高峰马卡鲁峰，海拔8463米，经典路线沿传统西北坡展开。 | added_claims=[]
- `mang-shan-beijing` 蟒山: 十三陵水库周边的蟒山，以完善步道连接森林公园正门与天池。 | added_claims=[]
- `mang-shan-hunan` 莽山: 原始森林铺展莽山保护区，景区路线通向1902.3米猛坑石主峰。 | added_claims=[]
- `mangdang-shan` 芒砀山主峰: 汉文化底蕴汇聚芒砀山，景区环线在完善步道间串起主峰风景。 | added_claims=[]
- `manhan-shan` 蛮汉山: 森林与峡谷交织蛮汉山，这座大青山姊妹峰保留着小众山野气息。 | added_claims=[]
- `mao-shan` 茅山: 道教上清派发源地茅山，以大茅峰步道连接第一福地与第八洞天。 | added_claims=[]
- `maoer-shan-guangxi` 猫儿山: 漓江源头所在的猫儿山，以2141.5米峰顶托起广西与华南高点。 | added_claims=[]
- `maoer-shan-jilin` 帽儿山: 延吉城市山景收于帽儿山，完善步道通向俯瞰城市全景的峰顶。 | added_claims=[]
- `maya-xueshan` 马牙雪山: 祁连山东段的马牙雪山，以高山草甸和冰川景观铺开成熟徒步线。 | added_claims=[]
- `meihua-shan-fujian` 梅花山: 华南虎原生地梅花山，保护区步道由景区延伸至1811米狗子脑。 | added_claims=[]
- `mengdagangri-feng` 蒙达岗日峰: 喜马拉雅山脉东段核心山峰蒙达岗日峰，海拔6426米，经典路线经大本营往返主峰。 | added_claims=[]
- `mian-shan` 绵山: 清明文化发源地绵山，以悬空寺庙群和完善步道构成独特山景。 | added_claims=[]
- `miaofeng-shan` 妙峰山: 京西民俗名山妙峰山，步道串联金顶娘娘庙与俯瞰北京的山景。 | added_claims=[]
- `mingsha-shan` 鸣沙山: 月牙泉依偎鸣沙山沙漠奇观，景区环线在沙丘间铺展开来。 | added_claims=[]
- `mingyue-shan` 明月山: 温泉与山岳景观交汇明月山，月亮文化伴随步道通向太平山主峰。 | added_claims=[]
- `mogan-shan` 莫干山: 民国风情别墅掩映莫干山，这座避暑胜地以完善步道环抱塔山。 | added_claims=[]
- `mulan-shan` 木兰山: 木兰文化发源地木兰山，道教山景与近郊步道在582.1米峰顶相遇。 | added_claims=[]
- `muztagata-feng` 慕士塔格峰: 人称"冰川之父"的慕士塔格峰，7546米冰川漫坡，常作为高海拔登山的训练目标。 | added_claims=[{"claim":"常作为高海拔登山的训练目标","basis":"needs_review","note":"用户要求保留的S1.3表述，冻结description未提供出处"}]
- `namchabarwa` 南迦巴瓦峰: 南迦巴瓦峰位于西藏自治区，是喜马拉雅东段的高海拔冰雪山峰。 | added_claims=[{"claim":"南迦巴瓦峰位于西藏自治区，是喜马拉雅东段的高海拔冰雪山峰。","basis":"needs_review","note":"喜马拉雅东段的地貌定位待补冻结来源"}]
- `namunani-feng` 纳木那尼峰: 与冈仁波齐隔湖相望的阿里神山纳木那尼峰，海拔7694米，传统线路沿西坡展开。 | added_claims=[]
- `nanfeng-mian` 南风面: 罗霄山脉核心南风面，以2120.4米峰顶和保护区山野构成成熟徒步线。 | added_claims=[]
- `nangong-shan` 南宫山: 道教名山南宫山，以喀斯特熔岩景观和完善步道串起金顶环线。 | added_claims=[]
- `nanhuang-gudao-route` 南黄古道沿线山峰: 千年南黄古道穿过红枫山景，前杨村至黄坦村串起华东赏秋路线。 | added_claims=[]
- `nankun-shan` 南昆山: 森林与瀑布铺满南昆山，这座珠三角避暑地以步道环抱天堂顶。 | added_claims=[]
- `nanyandang-shan` 南雁荡山: 儒释道文化汇于南雁荡山，成熟景区路线由山间延伸至明王峰。 | added_claims=[]
- `nianbaoyuze` 年保玉则: 年保玉则位于青海省，冰雪峰群与高原湖泊共同构成高原山地景观。 | added_claims=[{"claim":"年保玉则位于青海省，冰雪峰群与高原湖泊共同构成高原山地景观。","basis":"needs_review","note":"冰雪峰群与高原湖泊的地貌概括待补冻结来源"}]
- `ningjinkangsha-feng` 宁金抗沙峰: 宁金抗沙峰是拉轨岗日山脉主峰，海拔7206米，传统线路沿南坡通向山峰。 | added_claims=[]
- `niubei-shan` 牛背山: 贡嘎群峰全景铺展牛背山，这座3666米观景平台连接成熟徒步路线。 | added_claims=[]
- `nyainqentanglha` 念青唐古拉峰: 念青唐古拉峰位于西藏自治区，是念青唐古拉山脉的高海拔冰雪山峰。 | added_claims=[{"claim":"念青唐古拉峰位于西藏自治区，是念青唐古拉山脉的高海拔冰雪山峰。","basis":"needs_review","note":"念青唐古拉山脉主峰关系待补冻结来源"}]
- `paiya-shan` 排牙山: 花岗岩牙状峰林勾勒排牙山，这座深圳第三高峰串起成熟山野路线。 | added_claims=[]
- `pan-shan` 盘山: 京东第一山盘山承载深厚人文，完善步道从景区正门通向挂月峰。 | added_claims=[]
- `putuoshan-foding-shan` 普陀山佛顶山: 观音道场普陀山佛顶山，以慧济寺步道连接291.3米海岛高点。 | added_claims=[]
- `qian-shan` 千山: 花岗岩峰林铺展千山，佛道名山底蕴与景区环线共同通向仙人台。 | added_claims=[]
- `qianfo-shan-sichuan` 千佛山: 绵阳最高峰千佛山立于保护区，成熟路线由安州区通向3033米主峰。 | added_claims=[]
- `qianling-shan` 黔灵山: 贵阳城市山景汇于黔灵山，公园步道串联弘福寺与1396米峰顶。 | added_claims=[]
- `qiaogeli-feng-k2` 乔戈里峰（K2）: 世界第二高峰乔戈里峰，8611米陡峭冰岩矗立于喀喇昆仑山脉。 | added_claims=[]
- `qilianshan-tuanjie-feng` 祁连山团结峰: 祁连山脉最高峰团结峰，海拔5808米，传统线路连接肃北县与团结峰大本营。 | added_claims=[]
- `qingchengshan-laojun-ge` 青城山老君阁: 青城天下幽，老君阁步道穿行道教名山，最终抵达1260米高处。 | added_claims=[]
- `qinghaihu-nanshan` 青海湖南山: 青海湖全景在南山草甸间铺开，约3500米山脊连接成熟徒步路线。 | added_claims=[]
- `qingliang-feng` 清凉峰: 浙西最高峰清凉峰，以保护区山野和银龙坞环线承载华东经典穿越。 | added_claims=[]
- `qingyuan-shan` 清源山: 老君岩造像守望清源山，道教名山步道环抱498米城市峰景。 | added_claims=[]
- `qingyun-shan-fujian` 青云山: 峡谷与瀑布交织青云山，这座避暑景区以完善步道串起1130米山景。 | added_claims=[]
- `qiniang-shan` 七娘山: 火山岩地貌勾勒七娘山，这座深圳第二高峰坐落于大鹏半岛核心。 | added_claims=[]
- `qiongmugangri-feng` 穷母岗日峰: 穷母岗日峰位于念青唐古拉山脉西段，海拔7048米，是该山脉西段的核心山峰。 | added_claims=[]
- `qiyue-shan` 齐岳山: 高山草甸与风车铺展齐岳山，这片南方大型山地草场串起成熟环线。 | added_claims=[]
- `qiyun-shan-anhui` 齐云山: 丹霞峰林托起齐云山，道教名山步道由景区正门通向585米高处。 | added_claims=[]
- `qiyun-shan-jiangxi` 齐云山: 赣南最高峰齐云山，以2061.3米草甸山景承载保护区成熟徒步线。 | added_claims=[]
- `qizi-feng` 启孜峰: 羊八井线路通向六千米级雪山启孜峰，海拔6206米，途中经过启孜峰大本营。 | added_claims=[]
- `queer-shan` 雀儿山主峰: 以冰壁攀登著称的经典雪山雀儿山主峰，是川藏北线最高峰，海拔6168米。 | added_claims=[]
- `sanao-aotaiji` 三奥雪山奥太基: 三奥雪山主峰奥太基，海拔5286米，线路由黑水县城经大本营通往主峰。 | added_claims=[]
- `sanao-aotaimei` 三奥雪山奥太美: 三奥雪山核心峰奥太美，海拔5257米，线路由黑水县城经大本营通往主峰。 | added_claims=[]
- `sanao-aotaina` 三奥雪山奥太娜: 黑水县城线路通向三奥雪山奥太娜，峰顶海拔5210米，途中经过大本营。 | added_claims=[]
- `sanbai-shan` 三百山: 东江源头藏于三百山，景区环线在国家级风景区的完善步道间展开。 | added_claims=[]
- `sangdankangsang-feng` 桑丹康桑峰: 桑丹康桑峰位于念青唐古拉山脉北段，海拔6590米，是藏区二十五座神山之一。 | added_claims=[]
- `sanqingshan` 三清山: 花岗岩峰林塑造三清山奇观，道教名山步道在世界自然遗产间延伸。 | added_claims=[]
- `sejila-shan` 色季拉山: 南迦巴瓦峰景观铺展色季拉山，4728米山岳连接林芝成熟徒步线。 | added_claims=[]
- `shao-shan` 韶山: 深厚历史意义汇于韶山，景区环线沿完善步道通向518.9米韶峰。 | added_claims=[]
- `she-shan` 佘山: 上海最高峰佘山仅98.8米，森林公园步道环绕西佘山与天主教山景。 | added_claims=[]
- `shengtang-shan` 圣堂山: 丹霞与云海环抱圣堂山，这座大瑶山主峰以1979米山景连接成熟路线。 | added_claims=[]
- `shennong-ding` 神农顶: 华中屋脊神农顶耸立至3106.2米，保护区成熟路线通向湖北最高点。 | added_claims=[]
- `shennongjia-laojun-shan` 神农架老君山: 原始森林包围神农架老君山，木鱼镇环线串起华中经典穿越山景。 | added_claims=[]
- `shennongshan` 神农山: 白松岭景观铺展神农山，道教名山步道由景区正门通向紫金顶。 | added_claims=[]
- `shenxian-ju` 神仙居: 悬空栈道与如意桥横跨神仙居，丹霞景观沿景区环线层层展开。 | added_claims=[]
- `shigao-shan` 石膏山: 森林、瀑布与溶洞汇聚石膏山，这座避暑地以完善步道通向主峰。 | added_claims=[]
- `shika-xueshan` 石卡雪山: 香格里拉全景铺展石卡雪山，约4500米山岳由完善景区步道串联。 | added_claims=[]
- `shikeng-kong` 石坑崆: 广东屋脊石坑崆高达1902米，南岭保护区路线穿过成熟山野。 | added_claims=[]
- `shishapangma-lenggang-feng` 冷岗峰: 希夏邦马峰的卫峰冷岗峰，海拔6225米，线路由聂拉木县经大本营通往主峰。 | added_claims=[]
- `shiwan-dashan` 十万大山: 热带季雨林覆盖十万大山，广西南部山脉沿保护区成熟路线延伸。 | added_claims=[]
- `shuangta-shan` 双塔山: 丹霞奇观塑造双塔山，承德城市山岳以完善步道串起景区环线。 | added_claims=[]
- `shunan-zhuhai` 蜀南竹海: 大片竹林铺满蜀南竹海，景区步道环绕观海楼与约千米山景。 | added_claims=[]
- `siguniang-dafeng` 四姑娘山大峰: 海子沟线路通向四姑娘山大峰，峰顶海拔5025米，途中经过大峰大本营。 | added_claims=[]
- `siguniang-erfeng` 四姑娘山二峰: 包含少量冰雪路段的四姑娘山二峰，海拔5276米，线路由日隆镇经海子沟和大本营通往主峰。 | added_claims=[]
- `siguniang-luotuo-feng` 四姑娘山骆驼峰: 冰川与岩壁路段构成四姑娘山骆驼峰线路，海拔5484米，路线经长坪沟和大本营通往主峰。 | added_claims=[]
- `siguniang-sanfeng` 四姑娘山三峰: 攀岩路段构成四姑娘山三峰线路，海拔5355米，路线由日隆镇经海子沟和大本营通往主峰。 | added_claims=[]
- `siguniang-yaomei-feng` 四姑娘山幺妹峰: “蜀山之后”四姑娘山幺妹峰是四川第二高峰，海拔6250米，也是中国技术型攀登标杆山峰。 | added_claims=[]
- `simian-shan` 四面山: 千瀑之乡四面山以森林与瀑布铺展景区，完善步道通向望乡台。 | added_claims=[]
- `siming-shan` 四明山: 红枫铺满浙东四明山，森林公园环线串起1018米成熟徒步山景。 | added_claims=[]
- `siren-tong` 四人同: 贡嘎雪山全景铺展四人同，这座3510米观景平台连接小众徒步与露营路线。 | added_claims=[]
- `songshan` 嵩山: 五岳中岳嵩山承载三教文化，世界文化遗产步道通向1491.7米峻极峰。 | added_claims=[]
- `sumu-shan` 苏木山: 大片人工林覆盖苏木山，高森林覆盖率与完善步道共同构成避暑山景。 | added_claims=[]
- `taibaishan` 太白山: 秦岭主峰太白山托起陕西最高点，厚畛子路线通向3771.2米拔仙台。 | added_claims=[]
- `taimu-shan` 太姥山: 海上仙都太姥山以花岗岩峰林俯瞰山海，完善步道通向覆鼎峰。 | added_claims=[]
- `taishan` 泰山: 五岳之首泰山承载双遗产底蕴，红门古道一路攀上1532.7米玉皇顶。 | added_claims=[]
- `taizi-jian` 太子尖: 高山草甸与云海铺展太子尖，浪广村至百丈岭串起浙西三尖徒步线。 | added_claims=[]
- `tanglaangqu-feng` 唐拉昂曲峰: 念青唐古拉山脉核心峰唐拉昂曲，海拔6330米，线路由羊八井经大本营通往主峰。 | added_claims=[]
- `tianhua-shan` 天华山: 人称“东北小黄山”的天华山，以峡谷和峰林夹出通往天台峰的石阶。 | added_claims=[]
- `tianjieshan` 天界山: 回龙挂壁公路穿行南太行，天界山步道环绕1570米老爷顶展开。 | added_claims=[]
- `tianma-shan-shanghai` 天马山: 护珠塔斜立于天马山林间，这座上海第二高峰适合沿环线悠然登临。 | added_claims=[]
- `tianmu-shan` 天目山: 大树王国铺展天目山的森林气象，景区步道由山门通往1506米仙人顶。 | added_claims=[]
- `tianmushan-qijian-route` 天目山七尖穿越线: 七座山峰连成天目山七尖穿越线，是华东徒步拉练的经典长线。 | added_claims=[]
- `tianping-shan` 天平山: 层林秋色点亮天平山，这座赏枫名山以完善步道串起山顶环线。 | added_claims=[]
- `tiantaishan-huading-shan` 天台山华顶山: 云锦杜鹃装点天台山华顶山，天台宗祖庭山色沿步道铺向1098米峰顶。 | added_claims=[]
- `tiantang-ding` 天堂顶: 南昆山深处的天堂顶托起广州最高处，成熟山径通往1210米峰顶。 | added_claims=[]
- `tiantang-zhai` 天堂寨: 皖鄂两省共同环抱天堂寨，未核入口的往返山线通往1729.13米高处。 | added_claims=[]
- `tianzhushan-anhui` 天柱山: 花岗岩峰林塑出天柱山奇观，景区环线攀向1489.8米天柱峰。 | added_claims=[]
- `tonggong-jian` 童公尖: 高山草甸铺满浙西童公尖，浮桥村出发的环线串起三尖山色。 | added_claims=[]
- `tuo-liang` 驼梁: 密林、瀑布与溪流构成驼梁的清凉山景，前大地村山径通往2281米峰顶。 | added_claims=[]
- `tuomuer-feng` 托木尔峰: 天山山脉最高峰托木尔峰，海拔7443米，经典线路为托木尔峰传统路线。 | added_claims=[]
- `wanfo-shan-anhui` 万佛山: 森林与瀑布铺展万佛山的大别山景致，成熟山径由景区通往老佛顶。 | added_claims=[]
- `wangmang-ling` 王莽岭: 红岩绝壁、云海与挂壁公路汇聚王莽岭，景区环线通往1732米高处。 | added_claims=[]
- `wangmangling-xiyaigou-route` 太行山王莽岭-锡崖沟环线: 挂壁公路与峡谷相伴，王莽岭至锡崖沟环线串起南太行经典山景。 | added_claims=[]
- `wangwushan` 王屋山: 愚公移山故事落在王屋山，道教名山步道由景区通往1715.7米天坛峰。 | added_claims=[]
- `wangxiang-yan` 太行大峡谷王相岩: 悬空栈道贴着南太行峡谷延伸，王相岩步道通往约1600米峰顶。 | added_claims=[]
- `wanxian-shan` 万仙山主峰: 郭亮村挂壁公路刻入万仙山崖壁，经典环线沿南太行山色通往主峰。 | added_claims=[]
- `wawu-shan` 瓦屋山: 桌山地貌托起瓦屋山，森林与瀑布环绕2830米兰溪主峰展开。 | added_claims=[]
- `weizhou-volcanic-landform-route` 涠洲岛火山地貌游览线: 海岛火山地貌沿涠洲岛游览线展开，景区正门环线串起开放游览路段。 | added_claims=[]
- `wudangshan` 武当山: 道教古建与山色共同铺展武当山，景区步道由山门直抵金顶天柱峰。 | added_claims=[]
- `wugongshan-guangdong` 武功山广东段: 高山草甸铺展武功山广东段，万时山环线沿平缓山脊通往三省界碑。 | added_claims=[]
- `wugongshan-jiangxi` 武功山: 高山草甸与云海铺满武功山脊，景区金顶和发云界穿越呈现两种山野尺度。 | added_claims=[]
- `wulao-feng` 五老峰: 丹霞山色与道教遗迹相映五老峰，景区步道由山门通往玉柱峰。 | added_claims=[]
- `wuliang-shan` 无量山: 冬樱装点无量山保护区，成熟山径由景东县延伸至3376米主峰。 | added_claims=[]
- `wuling-shan` 雾灵山: 京冀两地共同环抱雾灵山，北门与南门两条往返线分别通向2118米峰顶。 | added_claims=[]
- `wuling-shan-chongqing` 武陵山: 喀斯特山景与森林铺满武陵山，景区步道通向1980米主峰。 | added_claims=[]
- `wumeng-shan` 乌蒙山: 云贵高原山脊在乌蒙山延展，威宁县往返线通向2857米主峰。 | added_claims=[]
- `wutaishan` 五台山: 佛教名山五台山托起华北屋脊，大朝台环线串联五座清凉台顶。 | added_claims=[]
- `wutong-shan` 梧桐山: 深圳城市天际由梧桐山抬高，经典山径通往943.7米大梧桐主峰。 | added_claims=[]
- `wuyue-zhai` 五岳寨: 瀑布与森林铺展五岳寨的清凉山景，成熟步道由景区通往1945.6米主峰。 | added_claims=[]
- `wuzhi-shan` 五指山: 热带原始林覆盖五指山，这座海南最高峰以二指主峰托起1867.1米岛屿天际。 | added_claims=[]
- `xi-shan-yunnan` 西山: 滇池湖畔的西山如睡美人横卧昆明，龙门环线延伸至凌虚阁高处。 | added_claims=[]
- `xiang-shan` 香山: 漫山红叶点亮北京香山，公园东门石阶一路通往557米香炉峰。 | added_claims=[]
- `xiangbi-shan` 象鼻山: 喀斯特山体塑成桂林城徽象鼻山，景区环线串起江畔与山顶景观。 | added_claims=[]
- `xiangtang-shan` 响堂山: 古老石窟嵌入响堂山崖壁，文保山景沿完善步道延伸至891米峰顶。 | added_claims=[]
- `xiannv-shan` 仙女山: 草甸与森林铺展仙女山，景区环线沿2033米高地展开四季山景。 | added_claims=[]
- `xiaowutai-shan` 小五台山: 金莲花与高山草甸点亮小五台山，这座河北最高峰是华北经典穿越目的地。 | added_claims=[]
- `xiaoxinganling-liangshui` 小兴安岭凉水主峰: 红松原生林覆盖小兴安岭凉水主峰，保护区山径穿行707.3米生态林海。 | added_claims=[]
- `xiata-gudao-route` 夏塔古道沿线山峰: 冰川与森林相伴夏塔古道，这条天山经典徒步线延伸至约3600米高地。 | added_claims=[]
- `xicheng-shan` 析城山: 圣王坪草甸铺展析城山的喀斯特高地，小众环线串起1889.5米主峰。 | added_claims=[]
- `xiling-xueshan` 西岭雪山: 西岭雪山位于四川省，冰雪山体与景区登山线构成成都西部的高山景观。 | added_claims=[{"claim":"西岭雪山位于四川省，冰雪山体与景区登山线构成成都西部的高山景观。","basis":"needs_review","note":"成都西部与冰雪山体地貌概括待补冻结来源"}]
- `xiqiao-shan` 西樵山: 岭南山色与观音文化汇聚西樵山，景区环线沿完善步道通往大观音高处。 | added_claims=[]
- `xixiabangma-feng` 希夏邦马峰主峰: 唯一完全位于中国境内的八千米级极高峰希夏邦马峰，峰顶海拔8012米，传统线路沿南坡展开。 | added_claims=[]
- `xuebao-ding` 雪宝顶主峰: 岷山山脉主峰雪宝顶，海拔5588米，经典线路沿传统西壁路线展开。 | added_claims=[]
- `xuedou-shan` 雪窦山: 弥勒道场坐落雪窦山，景区步道由山门环绕约800米妙高台展开。 | added_claims=[]
- `xuefeng-shan` 雪峰山: 森林山脊铺展湖南雪峰山，成熟山径由景区通往1934.3米苏宝顶。 | added_claims=[]
- `xuelong-bao` 雪隆包: 冰川与岩壁路段构成雪隆包线路，峰顶海拔5527米，路线由孟屯河谷经大本营通往主峰。 | added_claims=[]
- `xueshan-zhang` 雪山嶂: 原始森林与高山草甸覆盖雪山嶂，沙口镇环线通往1379米主峰。 | added_claims=[]
- `yading-xiannairi` 仙乃日: 仙乃日位于四川省稻城亚丁，与央迈勇、夏诺多吉并列为三怙主神山。 | added_claims=[{"claim":"仙乃日位于四川省稻城亚丁，与央迈勇、夏诺多吉并列为三怙主神山。","basis":"needs_review","note":"三怙主神山关系来自本轮D节事实，待冻结公告或权威出处"}]
- `yading-xianuoduoji` 夏诺多吉: 夏诺多吉位于四川省稻城亚丁，与仙乃日、央迈勇并列为三怙主神山。 | added_claims=[{"claim":"夏诺多吉位于四川省稻城亚丁，与仙乃日、央迈勇并列为三怙主神山。","basis":"needs_review","note":"三怙主神山关系来自本轮D节事实，待冻结公告或权威出处"}]
- `yading-yangmaiyong` 央迈勇: 央迈勇位于四川省稻城亚丁，与仙乃日、夏诺多吉并列为三怙主神山。 | added_claims=[{"claim":"央迈勇位于四川省稻城亚丁，与仙乃日、夏诺多吉并列为三怙主神山。","basis":"needs_review","note":"三怙主神山关系来自本轮D节事实，待冻结公告或权威出处"}]
- `yala-xueshan` 雅拉雪山: 雅拉雪山位于四川省甘孜高原，冰雪主峰与高山峡谷构成山地景观。 | added_claims=[{"claim":"雅拉雪山位于四川省甘孜高原，冰雪主峰与高山峡谷构成山地景观。","basis":"needs_review","note":"甘孜高原与冰雪峡谷地貌概括待补冻结来源"}]
- `yalongwan-canghai-lou` 亚龙湾热带天堂森林公园主峰: 热带森林覆盖亚龙湾山地，景区环线由山门通往约450米沧海楼主峰。 | added_claims=[]
- `yandangshan-zhejiang` 雁荡山: 火山岩峰林塑出雁荡山奇景，灵峰山径通往1108米百岗尖。 | added_claims=[]
- `yangcao-shan` 羊草山: 高山雪原铺展羊草山，雪乡至雪谷的经典穿越线贯穿冬季山野。 | added_claims=[]
- `yaoshan-henan` 尧山: 温泉与山岳风景汇聚尧山，景区步道由山门攀向2153.1米玉皇顶。 | added_claims=[]
- `yi-shan` 峄山: 花岗岩奇石构成峄山“岱南奇观”，景区山径通往582.8米玉皇顶。 | added_claims=[]
- `yimengshan-guimeng` 沂蒙山龟蒙: 世界地质公园山色汇聚沂蒙山龟蒙，景区步道通往1156米龟蒙顶。 | added_claims=[]
- `yingge-ling` 鹦哥岭: 热带原始林覆盖鹦哥岭，这座海南第二高峰以1811.6米主峰托起保护区山景。 | added_claims=[]
- `yinna-shan` 阴那山: 灵光寺坐落阴那山间，粤东名山步道由景区通往1298米玉皇顶。 | added_claims=[]
- `yintiao-ling` 阴条岭: 原始森林覆盖重庆屋脊阴条岭，巫溪山径通往2796.8米主峰。 | added_claims=[]
- `yishan-shandong` 沂山: 五镇之首沂山承载古老山岳文化，景区步道通往1032米玉皇顶。 | added_claims=[]
- `yiwulu-shan` 医巫闾山: 历史山色铺展医巫闾山，这座东北名山的步道通往866.6米望海峰。 | added_claims=[]
- `yuanbao-shan` 元宝山: 原始森林覆盖元宝山，这座广西第二高峰由安陲乡山径通往2084.7米峰顶。 | added_claims=[]
- `yubeng-route` 雨崩徒步线: “不去天堂，就去雨崩”，神瀑往返线穿过雪山村落，呈现滇西北高山峡谷景观。 | added_claims=[{"claim":"雨崩神瀑线为当前保留的开放参考路线","basis":"needs_review","note":"来自本轮E节通告口径，待冻结一手通告正文"}]
- `yuelu-shan` 岳麓山: 岳麓书院坐落岳麓山间，长沙城市山径沿云麓宫环线穿行至300.8米高处。 | added_claims=[]
- `yulong-xueshan` 玉龙雪山: 玉龙雪山位于云南省，以扇子陡为代表高点，冰川与高山景观构成丽江雪山地标。 | added_claims=[{"claim":"玉龙雪山位于云南省，以扇子陡为代表高点，冰川与高山景观构成丽江雪山地标。","basis":"needs_review","note":"扇子陡代表高点与丽江地标表述来自已锁定实体纠偏，待补冻结来源"}]
- `yunding-shan-fujian` 云顶山: 森林与峡谷环绕厦门云顶山，汪前村山径通往1175.2米城市最高处。 | added_claims=[]
- `yunding-shan-shanxi` 云顶山: 草甸与森林铺展太原云顶山，娄烦县山径通往2708米城市最高峰。 | added_claims=[]
- `yunlong-shan` 云龙山: 云龙山承载徐州城市文脉，景区环线由山门通往俯瞰云龙湖的观景台。 | added_claims=[]
- `yunmeng-shan` 云蒙山: 花岗岩峰林勾勒京郊云蒙山，成熟环线穿行1414米山地。 | added_claims=[]
- `yuntai-shan-guizhou` 云台山: 喀斯特地貌铺展贵州云台山，世界遗产山景沿完善步道连向1066米主峰。 | added_claims=[]
- `yuntai-shan-henan` 云台山（河南）: 丹霞峡谷塑出河南云台山，景区步道由山门通往1308米茱萸峰。 | added_claims=[]
- `yuzhu-feng` 玉珠峰: 青藏线旁冰川铺展，6178米玉珠峰常作为高海拔登山的训练目标。 | added_claims=[{"claim":"常作为高海拔登山的训练目标","basis":"needs_review","note":"用户要求保留的S1.3表述，冻结description未提供出处"}]
- `yuzhu-yuxu-feng` 玉虚峰: 玉珠峰姊妹峰玉虚峰也是昆仑核心峰与藏区神山，海拔5933米，线路由格尔木经大本营通往主峰。 | added_claims=[]
- `zhangjiajie-qixing-shan` 张家界七星山: 草甸与峡谷铺展张家界七星山，成熟山径由景区通往1528.6米主峰。 | added_claims=[]
- `zhangjiajie-tianmen-shan` 张家界天门山: 天门洞与悬空玻璃栈道塑出张家界天门山奇景，环线通往云梦仙顶。 | added_claims=[]
- `zhangshi-yan` 嶂石岩: 丹崖碧岭铺展嶂石岩砂岩地貌，景区山径通往1774米黄庵垴主峰。 | added_claims=[]
- `zhangzi-feng` 章子峰: 珠峰北峰章子峰属于七千米级技术型雪山，海拔7543米，传统线路沿北坡展开。 | added_claims=[]
- `zhaogong-shan` 赵公山: 青城山脉主峰赵公山立于成都近郊，玉堂镇山径通往2434米峰顶。 | added_claims=[]
- `zhongnan-shan` 终南山: 秦岭山脊与道教文化汇聚终南山，沣峪口山径通往2604米主峰。 | added_claims=[]
- `zhumulangma-beipo` 珠穆朗玛峰北坡: 世界最高峰珠穆朗玛峰的北坡，峰顶海拔8848.86米，是喜马拉雅山脉主峰的传统攀登线路。 | added_claims=[]
- `zhuoaoyou-feng` 卓奥友峰: 世界第六高峰卓奥友峰属于八千米级雪山，海拔8201米，传统线路沿西北坡展开。 | added_claims=[]
- `zhuoer-shan` 卓尔山: 丹霞与草原相映卓尔山，景区步道沿约3100米高地铺展开阔山景。 | added_claims=[]
- `zijin-shan-jiangsu` 紫金山: 中山陵与明孝陵坐落紫金山间，城市环线穿行森林直上448.9米头陀岭。 | added_claims=[]
- `zu-shan` 祖山: 花岗岩峰林与瀑布铺展祖山，景区东门环线通往1428米天女峰。 | added_claims=[]
