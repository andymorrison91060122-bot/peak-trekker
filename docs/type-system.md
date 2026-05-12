# Peak Trekker · 字号体系

## 概述

Peak Trekker 的字号分为三层：

1. **Layer 1 通用 UI Token**：可复用，进入 token 系统，默认用于绝大多数运行时 UI。
2. **Layer 2 产品强调字号**：产品决策特例，inline 保留，不进入通用 token；本文件维护 protected list。
3. **Layer 3 装饰资产字号**：share template、Onboarding 插图等资产场景，独立于运行时 UI 字号体系。

字号收敛任务默认只处理 Layer 1。触及 Layer 2 或 Layer 3 前，必须先确认产品语义。

## Layer 1: 通用 UI Token

定义位置：`design-system/colors_and_type.css` 和 `src/app/globals.css`。

| Token | px | weight | line-height | 主要用途 |
|-------|----|--------|-------------|----------|
| `label-s` | 11 | 500 | 14 | 极小标签 / mono 标注 / 时间戳 / 单位 |
| `label-m` | 13 | 500 | 18 | 按钮 / 二级标签 / chip 文案 |
| `body-m` | 14 | 400 | 20 | 正文 / 一般说明 |
| `body-l` | 15 | 400 | 22 | 较长正文 / 说明段落 |
| `title-m` | 15 | 500 | 20 | 副标题 / 强调文字 / 紧凑标题 |
| `title-l` | 17 | 600 | 24 | 卡片标题 / section 标题 / 用户名 |
| `headline-m` | 22 | 600 | 28 | 页面标题 / 空态标题 / 中强度指标 |
| `display-l` | 28 | 700 | 36 | 大数字 / 中度产品强调 |

新增 token 需要产品和设计评审。本表之外的普通 UI 字号应优先收敛到这 8 档。

## Layer 2: 产品强调字号 Protected List

**本清单中的字号是产品决策的核心视觉信号，字号收敛任务不得直接修改。**

新增 Layer 2 字号必须有明确产品理由，并同步记录在本文档。

| 场景 | 当前字号 | 产品理由 | 实现位置 |
|------|----------|----------|----------|
| Trek GPS 弱 / 常规记录当前海拔 | 56px | 海拔是记录过程中的视觉锚点，弱信号状态也必须被看见 | `src/app/(flow)/trek/TrekClient.tsx` |
| Trek 近登顶距离倒计时 | 56px | 临近登顶时距离峰顶是主决策信号 | `src/app/(flow)/trek/TrekClient.tsx` |
| Trek 登顶留证海拔 | 88px | 登顶是产品高潮，海拔需要具备仪式感 | `src/app/(flow)/trek/TrekClient.tsx` |
| Trek 登顶仪式文案 | 26px | “到了。”是完成节点的情绪锚点 | `src/app/(flow)/trek/TrekClient.tsx` |
| Activity 山名 hero | 26px | 活动详情首屏主体识别 | `src/app/(flow)/activity/[id]/ActivityDetailClient.tsx` |
| Activity 登顶海拔 hero | 36px | 登顶海拔是活动结果最高优先信号 | `src/app/(flow)/activity/[id]/ActivityDetailClient.tsx` |
| Activity hero stats | 30px | 与登顶海拔配套的结果数据强调 | `src/app/(flow)/activity/[id]/ActivityDetailClient.tsx` |
| Mountain Detail 山名 | 26px | 山峰详情首屏主体识别 | `src/app/(flow)/mountain/[id]/MountainDetailClient.tsx` |
| Late Proof 顶部流程标题 | 24px | 补登记入口的流程级 hero 标题 | `src/app/(flow)/late-proof/late-proof.css` |
| Late Proof 缺失 / 审核中 / 已提交流程标题 | 22px | 补登记状态页的流程节点强调 | `src/app/(flow)/late-proof/late-proof.css` |

## Layer 3: 装饰资产字号

以下场景不套用运行时 UI 字号体系，由资产或渲染目标决定：

- Share Templates（Satori 渲染）：`src/lib/share-templates/**`
- Onboarding 插图与装饰：`src/components/onboarding/`、`src/components/ui/OnboardingModal.tsx`

这些字号可以被单独审视，但不应被普通 UI 字号收敛任务顺手修改。

## 维护原则

1. **优先使用 Layer 1 token**：普通 UI 不新增散落 px 值。
2. **Layer 2 先登记再保护**：新增产品强调字号必须写入 protected list。
3. **修字号前检查 protected list**：命中 Layer 2 时停止并确认产品意图。
4. **CSS variable 优于裸数字**：`fontSize: 'var(--font-title-l-size)'` 优于 `fontSize: 17`。
5. **不把装饰资产纳入运行时 UI 清债**：share template 和 onboarding 插图按 Layer 3 管理。

## Follow-up

- Activity / Mountain / Trek 中未处理的零散 `12px`、`13px`、`16px` 字号，留作 V1.1+ 单独清理。
- Activity hero stats 的 `30px` 是否长期保留为 Layer 2，后续可单独评审。
- line-height 体系化不在 Sprint 7 Task 7.7 范围内。
