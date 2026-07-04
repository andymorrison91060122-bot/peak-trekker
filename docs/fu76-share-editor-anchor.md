# FU-76 · Share Editor Motion Anchor

## Current Node

FU-76 · 动效系统 + 人文化文案

当前 anchor 只记录 FU-76 中已完成的「分享生成节点 + `/share` 编辑器重设计」。FU-76 整体仍 Active，转场、空态、加载等动效节点尚未收口。

## Design Contract

设计契约来源为 Claude Design `Share Editor Redesign FU-76.dc.html`。

四屏信息架构：

- **Screen A · 编辑器默认态**: 海报主预览、模板条、工具行、字段区、底部保存 / 分享动作。
- **Screen B · 生成中**: promise-gated 显影，导出期间页面降噪与交互冻结。
- **Screen C · 保存成功**: 海报成型、边缘辉光、缩影收纳、保存按钮成功态与 toast。
- **Screen D · 透明水印**: 棋盘格透明底、PNG / 透明背景 / 1080×1920 信息 pill、主保存动作。

预批偏差：

- Web 不实现设计稿手机壳状态栏。
- Toast 不带「查看」动作。
- UnlockHintBar / exportError / premium watermark overlay 保留现有业务逻辑，按新设计语言最小适配。
- Native share 成功不展示「已保存到相册」。

## Implementation Mapping

- **实现入口**: `src/app/(flow)/share/ShareClient.tsx`
- **主预览**: 仍使用 `ShareClient` 内部 `HeroPreview` 本地实现；真实导出走 Satori 模板。该双实现漂移风险另登记 FU-108。
- **字段联动**: `visibleFields` 是真相源。字段芯片切换真实增删预览字段，GSAP 只做出 / 入过渡，终态必须与导出 payload 一致。
- **导出语义**:
  - save 与 share fallback download 播完整保存仪式与「已保存到相册」文案。
  - native share 成功只轻收，不展示「已保存」。
  - AbortError 静默回 idle。
  - transparent 保存复用完整保存仪式。
- **promise gate**: `renderPosterBlob` 与最短 720ms（`--motion-ceremony`）一起 gating；reduced-motion 不播动画，但仍等待真实 render resolve。
- **入场 timeline**: 显式 stage 顺序为 header → poster → templateStrip → toolsRow → fieldPanel → bottomActionBar，禁止按 DOM 顺序隐式 stagger。
- **几何模型**: 主预览内部使用 246px 固定坐标系，外层通过 `ResizeObserver` 写入动态 scale 适配 232px 壳；overlay / rim / sweep 锚定内卡几何，而非壳。
- **路线自绘初始态**: `preparePosterMotionInitialState` 在 stage 隐藏后、解除 `data-motion-pending` 前执行，确保 draw path 在 poster 可见首帧前已是 hidden dash 初始态。

## Motion Stack

采用 GSAP：

- `gsap-core`: `autoAlpha`、`matchMedia`、终态设置。
- `gsap-timeline`: position parameters、显影 / 成功仪式 timeline 结构。
- `gsap-react`: `useGSAP({ scope })`、context cleanup。
- `gsap-performance`: transform / opacity / autoAlpha 优先，动画期设置 `willChange`，结束后清理。

Reduced-motion 规则：

- no-preference 分支播放入场、重亮、生成、成功仪式。
- reduce 分支直接终态，不播 sweep / relight / success motion，但不绕过 render promise。

## Fix Chain

- **Phase 1**: `/share` 布局重排，编辑器从约 1.7 屏收敛到约 1.2 屏；字段区改为被动「始终展示」条 + 2×3 可选芯片；模板条使用真实缩略图；Screen D 动作层级对齐。
- **Phase 2**: 加入 stage 入场、海报内容重亮、模板切换重亮、字段过渡、reduced-motion 终态。
- **Phase 2R**: 恢复 preview layout parity，修普通动效分支未执行、`premium-altitude-profile` 预览与 Satori 不一致、mock 无 trackPreview 导致路线自绘未验证。
- **Phase 2R-Fix**: 加 SSR 首帧门禁，修 FOUC；确认 profile 模板按 Satori 标准移除 TIME / DATE 右列。
- **Phase 3**: 加 promise-gated 显影与保存成功仪式，补导出状态机、payload 快照、交互冻结。
- **Phase 3R**: 修显影方向 / 范围、透明水印返回黑屏、真实保存失败排查口径。
- **Phase 3R-Fix2**: 调整保存成功 rim 几何与 glow 强度，放慢路线绘制节奏。
- **Phase 3R-Fix3 / Fix4**: 修 overlay / rim / sweep 与内卡几何对齐，固定 246px 坐标系 + `ResizeObserver` 动态 scale，消除水平偏移与裁切。
- **Phase 3R-Fix5**: 将路线画线隐藏初始态前置到 poster 可见前，避免先完整露出再重画。

## Evidence

主要证据目录：

- `output/fu76-acceptance/phase0/`
- `output/fu76-acceptance/phase1/`
- `output/fu76-acceptance/phase2/`
- `output/fu76-acceptance/phase2r/`
- `output/fu76-acceptance/phase3/`
- `output/fu76-acceptance/phase3r/`
- `output/fu76-acceptance/phase3r-fix2/`
- `output/fu76-acceptance/phase3r-fix4/`
- `output/fu76-acceptance/phase3r-fix5/`

证据口径：这些是实现 / 验收材料，不替代用户最终视觉判断；真实保存 `/api/share/render` 403 曾作为独立 blocker 保留，不包装成真实闭环通过。

## Remaining Follow-up

- **FU-108**: `/share` 主预览（本地 HeroPreview）vs Satori 真海报漂移审计。方向是在全 10 分支做 preview ↔ Satori 一致性审计，或把主预览迁到真实模板组件缩放渲染，参照 `/imprint` facade 的 `TemplatePosterPreview`。
