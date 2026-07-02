# FU-85 · 分享/模板门面改造 Anchor

## Current FU

FU-85 · 分享/模板门面改造

## Main Scope

主体范围是分享门面前置 + 三选一录入：

- 截图上传
- 轨迹上传
- 真实记录

这不是分享编辑器局部美化。FU-85 的主问题是用户如何进入分享系统、如何理解手头素材可以走哪条路、以及不同来源如何被正确守门。

## Stage And Workflow

- 优先级：P1
- 阶段：实现 / 验收 gate
- 流程：Claude Design 整体门面方案 → review → 分阶段实施 → 用户 / Claude 验收
- 当前：实现完成，用户验收通过，待合并。Phase 1 `/imprint` 门面与分享模板锚定已落地；Phase 2 三条真实业务流 template 传播已接通；R3/R4 完成视觉 parity 与返回上下文收口。

局部 demo 或动效探索只能作为预研素材，不能替代整体门面方案，也不能单独进入实施。

## Guardrails

- `screenshot_recognition` 来源禁显「GPS 真实轨迹」。
- 分享门面必须尊重三条录入路径的来源差异，不能把外部截图识别包装成真实 GPS 过程。
- 门面是入口与选择结构，不是复杂模板编辑器。
- 分享编辑器已有能力可以复用，但 FU-85 不以编辑器局部美化为主体。

## Current State Found So Far

已确认并落地的生产接缝：

- 门面 route 为 `/imprint`，位于 `src/app/(flow)/imprint/`，自行挂底栏，不进入 `(main)` AppHeader。
- 门面卡使用 `src/lib/share-templates/` 真实模板组件；`src/lib/share-templates/registry.tsx` 为纯 id → component registry，API render route 与 `/imprint` 共用。
- `src/lib/share-template-intent.ts` 统一管理 `template` URL、pending intent、三入口 URL 与完成分享 URL。
- `/share?template=` 已通过 `ShareClient initialTemplate` 预选模板，并给主 poster preview 暴露精确断言点。
- Phase 2 接入：导入 `/import?template=`、截图 `/screenshot?template=`、实时记录 `/explore?shareTemplate=`；三条最终分享出口显式带模板或拒绝缺 `checkinId` 的分享跳转。
- R4 返回上下文：门面来源的 `/import` / `/screenshot` 带 `from=imprint`，entry 返回只构造内部 `/imprint?template=<id>&step=source`，不接收自由 `returnTo`，直接访问 `/import` / `/screenshot` 仍按旧逻辑回 `/explore`。

已完成验收证据：R3/R4 证据位于 `output/fu85-acceptance/r3/`。合并前仍需按当前分支最终状态复跑常规 checks。

## R3 / R4 Closeout Notes

- **R3A 字体 subset**: `/imprint` route-scoped 注入 `Noto Sans SC` Bold subset，输出约 26KB woff2；浏览器端门面卡使用 subset，Satori / API 出图仍使用服务端全量 OTF，不改 `load-share-fonts`。
- **R3B → R3C → R3D → R3E 动效与 parity 演进**:
  - R3B 给真实模板叶子文本补 `data-role="text"`，但缩放到门面卡后位移/scale 不可感知。
  - R3C 改为可感知语言：海报内部用 opacity 分层点亮、count-up、手动 `strokeDasharray/strokeDashoffset` 路线自绘；真实尺寸层用卡壳 rim 与「限免 / 高级」角标 focus。
  - R3D 修 count-up timeline：数字从 0 正常滚到真实值；reduced-motion 直接落终态。
  - R3E 修 facade/export parity：`.imprint-poster-preview` 重置 `text-align: left`，消除 `<button>` 默认居中继承；数字格式与模板静态渲染逐字符一致（例如海拔为 `1684`，不额外加千分位逗号）。
- **R4 返回上下文**: 门面发起的导入 / 截图入口返回 Screen 2，保留已选模板；直接访问仍回 `/explore`；invalid template 静默落默认模板 + Screen 2。安全边界是不引入自由 `returnTo` URL。
- **证据目录**: `output/fu85-acceptance/r3/`，包括 R3E 五模板 bbox / 数字核验 summary、facade-vs-Satori 并排图、R4 返回用例录屏与 summary。

## Motion Research Notes

以下仅为预研素材。最终是否采用取决于 FU-85 整体门面方案；不单独实施。动效归属 FU-76 分享生成节点。

- 卡片切换：方向是沉稳，去 overshoot。
- 生成中：显影 + count-up 需要绑定真实渲染耗时。
- 成功态：不采用钢印；不采用居中通用勾膏药。
- 更合适方向：海报成型 + 收纳 + 边缘光晕 + `power2` / `power3` 丝滑收尾。
- 确认反馈归按钮 + toast。
- 斜光去掉。
- 成功文案倾向：「已保存到相册」。
- 保存到相册仪式量级等待整体方案定。

## Next Step

1. 合并前复核当前分支最终 diff 与证据。
2. 用户确认后进入 commit / PR / merge 流程。
3. 合并后按 tracker closeout 另行收 FU-85。
