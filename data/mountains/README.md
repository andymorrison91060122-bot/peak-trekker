# 山峰数据种子 · Provenance（FU-51/FU-77 数据管线 · Phase 0 输入）

本目录存放山峰内容管线的规范化种子。Phase 0 对每条数据行的原始 UTF-8 字节计算 `source_hash`；文件级 provenance 与规范化差异在下方单独记录。

## 文件

| 文件 | 内容 | 数据行 | 省份段 | distinct 名称 | Seed SHA256 |
| --- | --- | --- | --- | --- | --- |
| `seed-catalog.md` | 全库 6/7 列（名称/精准海拔/难度标签/所属区域/简介/[顶峰GPS]/经典路线） | 406 | 31 | 397 | `a9c733a12ab8ae51aa2d8f251f5bc93074124101a9a3cb5763eeeb60e42ccb03` |
| `seed-distance.md` | 距离补全库 3 列（名称/难度标签/常规徒步路线距离） | 406 | 31 | 397 | `5228f072fadac773c0e75fe64f5e0177267889fce4471ef7faf057076923b04b` |

- 两份**按名称完全对齐**（distance∖catalog=0，catalog∖distance=0）。冻结记录层级为 **812 source records / 406 source-bound candidates / 403 frozen source-resolved identities / 362 source survivors / 44 source exclusions**。
- Schema v2 `overrides.json` 将 source identity 与 effective identity 分开。当前人工裁定形成 **399 effective-mapped identities / 4 synthetic canonicals / 359 final effective canonicals**，其中 `keep=348`、`keep_route=11`、`route_corridor=11`。
- 标题自称「392座」是原作者的**声称去重数**；实际表内 **406 行**，distinct 名称 397（9 个同名条目 + 约 14 个未清的区域/线路型条目 = 406 与 392 的差）。真实行数以本文件为准。

## 来源与还原方式（重要）

- 数据由用户于早前会话中**直接粘贴在对话内**（"国内可攀登知名山峰全库" + "山峰常规徒步路线距离补全库"两块拼在一条消息里，共 64,677 字符）。
- 原计划由**用户**把种子存盘（避免 Claude 转录误差）；执行时发现仓库内无此文件，遂由 Claude 从会话 transcript(`cfb62add…`) **逐字节程序化提取**（非凭记忆转录），在两文档 `#` 标题边界处切分为上述两份。
- `seed-catalog.md` 原始附件 SHA256 为 `d1c9620fcef2e7be12c6ff3d469d45a3e1a0fb4c34afe8bc5723951c8aafb181`；规范化 seed SHA256 为 `a9c733a12ab8ae51aa2d8f251f5bc93074124101a9a3cb5763eeeb60e42ccb03`。唯一 normalization 是追加文件末尾 LF，406 条数据行字节不变。
- `seed-distance.md` 原始附件与规范化 seed 字节相同，SHA256 均为 `5228f072fadac773c0e75fe64f5e0177267889fce4471ef7faf057076923b04b`。
- 若用户提供更新后的 master，应先更新 provenance 与完整性 pin，再重跑 Phase 0；对应数据行的 `source_hash` 会随输入变化。

## 下游

Phase 0（离线，不碰库）读取本目录，产出 `ledger/source_records.jsonl`、`ledger/candidates.jsonl`、`ledger/effective_canonicals.jsonl`、`ledger/reconciliation.md` 与 `overrides.json`。

- `candidates.jsonl` 固定表示 406 条 source-bound candidates；source candidate key 与 `source_identity` 永不因父级化或 merge 改写。
- `effective_canonicals.jsonl` 表示人工裁定和 merge 后的可进入后续 Phase 的 effective identities；本轮固定为 359 条。
- `overrides.json` 是人工裁定真源；正常生成只消费、不覆盖，只有显式 `--force-bootstrap` 会从冻结 disposition 重建基线。
