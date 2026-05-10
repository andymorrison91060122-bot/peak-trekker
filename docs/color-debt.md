# Color Debt

本表记录当前仓库中未纳入 `color-*` 11 个语义 token 的硬编码 hex 颜色。
按主线优先级分为三层：**P0 主线 + 反馈层**、**P1 全局基础**、**P2 非主线 / 后置**。

文档优先级参见 `product-mainline-alignment.md` 第 2 节。
本文件重排原则参见 `release-priority-matrix.md` 与 `ui-interaction-spec.md` 9 大页面定义。

---

# P0 · 主线页面与用户反馈层

以下色值出现在用户主链路或反馈层（导航、Mountain、Explore、Trek、社区画廊、Toast、Onboarding、锁定提示等），上线前必须统一到 token。

## Mountain Detail 页

- 色值: `#14181b`
  出现位置: `src/app/api/poster/route.ts:309`, `src/components/ui/MountainUI.tsx:119`
  推测用途: 分享海报和山峰详情的深色表面底。

- 色值: `#171c20`
  出现位置: `src/components/ui/MountainUI.tsx:163`
  推测用途: 山峰详情旧版地图/信息条底色。

- 色值: `#1c2024`
  出现位置: `src/components/ui/MountainUI.tsx:39`
  推测用途: 山峰详情顶层背景过渡色。

- 色值: `#20262a`
  出现位置: `src/components/ui/MountainUI.tsx:163`
  推测用途: 山峰详情旧版面板边界层。

## Trek 错误提示

- 色值: `#fecaca`
  出现位置: `src/app/(main)/trek/page.tsx:645`, `src/components/profile/ProfileAvatarUploader.tsx:233`, `src/components/ui/AppToastProvider.tsx:48`, `src/components/ui/LockModal.tsx:85`
  推测用途: 删除失败、锁定提示、上传错误等浅红文字/底色。

## 锁定提示

- 色值: `#f0b5b8`
  出现位置: `src/app/(main)/explore/[id]/page.tsx:172`, `src/components/ui/LockModal.tsx:88`
  推测用途: 锁定提示和 Explore 页面中的柔和危险态文字。

## Toast / 状态反馈

- 色值: `#a7f3d0`
  出现位置: `src/components/ui/AppToastProvider.tsx:33`, `src/components/ui/OnboardingModal.tsx:285`, `src/components/ui/OnboardingModal.tsx:420`, `src/components/ui/OnboardingModal.tsx:429`, `src/components/ui/OnboardingModal.tsx:442`, `src/components/ui/OnboardingModal.tsx:50`
  推测用途: Onboarding 和 toast 中的浅绿成功高光。

- 色值: `#bfdbfe`
  出现位置: `src/components/ui/AppToastProvider.tsx:41`
  推测用途: 信息型 toast 的浅蓝文字色。

- 色值: `#fca5a5`
  出现位置: `src/app/components.css:284`, `src/components/ui/CheckinButton.tsx:66`
  推测用途: 删除/危险操作里的浅红提示文字。

## Profile 头像上传

---

# P1 · 全局基础与共享样式

以下色值在全局 CSS 与共享组件层。统一 token 收益高，但不直接阻塞上线。

## globals.css

- 色值: `#111315`
  出现位置: `src/app/globals.css:184`
  推测用途: 旧版全局背景渐变终点。

- 色值: `#15181a`
  出现位置: `src/app/globals.css:184`
  推测用途: 旧版全局背景渐变起始层。

- 色值: `#16a34a`
  出现位置: `src/app/components.css:62`, `src/app/globals.css:289`
  推测用途: 旧版 primary button hover 绿。

- 色值: `#171a1d`
  出现位置: `src/app/globals.css:10`
  推测用途: 旧版 muted surface。

- 色值: `#1a1d21`
  出现位置: `src/app/globals.css:7`
  推测用途: 旧版 secondary surface。

- 色值: `#3a4249`
  出现位置: `src/app/globals.css:21`
  推测用途: 旧版 stronger border。

- 色值: `#60a5fa`
  出现位置: `src/app/globals.css:24`
  推测用途: 旧版 info 状态色。

- 色值: `#d9dde1`
  出现位置: `src/app/api/poster/route.ts:435`, `src/app/api/poster/route.ts:465`, `src/app/api/poster/route.ts:467`, `src/app/api/poster/route.ts:544`, `src/app/api/poster/route.ts:639`, `src/app/globals.css:18`
  推测用途: 海报和旧版全局样式中的浅色次级文字。

## components.css

- 色值: `#182024`
  出现位置: `src/app/components.css:180`
  推测用途: 组件 CSS 中的深色层次渐变停靠色。

- 色值: `#1a2024`
  出现位置: `src/app/components.css:180`
  推测用途: 组件 CSS 里的旧版卡片渐变中间色。

- 色值: `#20282d`
  出现位置: `src/app/components.css:180`
  推测用途: 组件 CSS 中的深色层次渐变停靠色。

- 色值: `#86efac`
  出现位置: `src/app/components.css:104`
  推测用途: 组件 CSS 中的浅绿成功态文字或标签色。

- 色值: `#fda4af`
  出现位置: `src/app/components.css:119`
  推测用途: 组件 CSS 中的浅粉红危险态文字。

- 色值: `#fdba74`
  出现位置: `src/app/components.css:114`
  推测用途: 组件 CSS 中的浅橙警告文字。

- 色值: `#fde68a`
  出现位置: `src/app/components.css:109`
  推测用途: 组件 CSS 中的浅黄警告文字。

## SharePosterButton

- 色值: `#15191c`
  出现位置: `src/app/components.css:422`, `src/components/ui/SharePosterButton.tsx:145`
  推测用途: 分享按钮和组件 CSS 里的旧版深色卡片底。

---

# P2 · 非主线 / 后置

以下色值在 admin、海报装饰、QA 测试、登录注册等非主线场景。允许后置或保留特殊色板。

## Satori 模板专用 palette

以下色值用于 share template 的 HTML-to-image 渲染，Satori 不支持 CSS custom properties，必须保留 literal。已抽取到 `src/lib/share-templates/shared.tsx::SHARE_TEMPLATE_PALETTE` 集中维护。

- `#0f1113` — `SHARE_TEMPLATE_PALETTE.bgPrimary`（poster shell 背景）
- `#14171a` — `SHARE_TEMPLATE_PALETTE.bgGradient`（poster 渐变中段）

## 装饰例外（不进入 token 系统）

以下色值是插图、海报、Onboarding 等装饰场景的资产色，**不属于 UI 语义体系**，保留 inline。

- 色值: `#f6d28d`
  出现位置: `src/components/ui/OnboardingModal.tsx:295`
  用途: Onboarding 装饰金色 / 插图色
  决策: Sprint 6 · Task 6.1d 锁定为插图资产，不进入 token 系统

## Admin 后台

- 色值: `#0a0a0a`
  出现位置: `src/app/admin/layout.tsx:33`, `src/app/admin/mountains/AdminMountainsClient.tsx:89`, `src/app/admin/users/AdminUsersClient.tsx:86`
  推测用途: 管理后台页面底色和深色容器底。

- 色值: `#0a1a0a`
  出现位置: `src/app/admin/users/AdminUsersClient.tsx:110`
  推测用途: 管理后台成功态或高亮标签的深色底板。

- 色值: `#111`
  出现位置: `src/app/admin/layout.tsx:35`, `src/app/admin/page.tsx:156`
  推测用途: 管理后台卡片或统计容器底色。

- 色值: `#2d6a4f`
  出现位置: `src/app/admin/layout.tsx:35`, `src/app/admin/mountains/AdminMountainsClient.tsx:107`
  推测用途: 管理后台绿色品牌/确认态边框和分隔强调。

- 色值: `#39ff14`
  出现位置: `src/app/admin/checkins/AdminCheckinsClient.tsx:10`, `src/app/admin/layout.tsx:38`
  推测用途: 管理后台荧光绿强调色，用于运营状态和标题装饰。

- 色值: `#52b788`
  出现位置: `src/app/admin/checkins/AdminCheckinsClient.tsx:16`, `src/app/admin/mountains/AdminMountainsClient.tsx:9`, `src/app/admin/users/AdminUsersClient.tsx:9`
  推测用途: 管理后台成功统计或图表绿色。

- 色值: `#9ca3af`
  出现位置: `src/app/admin/page.tsx:242`
  推测用途: 管理后台奖牌或排名信息的辅助灰。

- 色值: `#cd7f32`
  出现位置: `src/app/admin/page.tsx:242`
  推测用途: 管理后台铜牌/排序装饰色。

- 色值: `#e76f51`
  出现位置: `src/app/admin/checkins/AdminCheckinsClient.tsx:16`, `src/app/admin/mountains/AdminMountainsClient.tsx:9`
  推测用途: 管理后台告警或次级危险态橙红色。

- 色值: `#e8f5e9`
  出现位置: `src/app/admin/layout.tsx:39`
  推测用途: 管理后台浅色文字/浅底提示面板。

- 色值: `#f4a261`
  出现位置: `src/app/admin/checkins/AdminCheckinsClient.tsx:10`, `src/app/admin/checkins/AdminCheckinsClient.tsx:16`, `src/app/admin/mountains/AdminMountainsClient.tsx:9`, `src/app/admin/page.tsx:200`, `src/app/admin/page.tsx:202`, `src/app/admin/page.tsx:242`, `src/app/admin/users/AdminUsersClient.tsx:9`
  推测用途: 管理后台橙色统计、提醒和奖牌色。

## 分享海报装饰色板

- 色值: `#20252a`
  出现位置: `src/app/api/poster/route.ts:327`
  推测用途: 分享海报中层深色块。

- 色值: `#22282d`
  出现位置: `src/app/api/poster/route.ts:385`, `src/app/api/poster/route.ts:386`
  推测用途: 分享海报中深色卡片/说明面板底。

- 色值: `#2fcc6a`
  出现位置: `src/app/api/poster/route.ts:381`
  推测用途: 分享海报里的亮绿渐变停靠点。

- 色值: `#304b57`
  出现位置: `src/app/api/poster/route.ts:355`
  推测用途: 分享海报里的山体/夜空蓝灰色。

- 色值: `#547a78`
  出现位置: `src/app/api/poster/route.ts:356`
  推测用途: 分享海报里的山体或雾层绿灰色。

- 色值: `#69e3a1`
  出现位置: `src/app/api/poster/route.ts:561`
  推测用途: 分享海报局部亮绿高光。

- 色值: `#705637`
  出现位置: `src/app/api/poster/route.ts:358`
  推测用途: 分享海报里的土壤/山脊棕色。

- 色值: `#7ef0b4`
  出现位置: `src/app/api/poster/route.ts:380`, `src/app/api/poster/route.ts:435`, `src/app/api/poster/route.ts:454`, `src/app/api/poster/route.ts:456`, `src/app/api/poster/route.ts:476`, `src/app/api/poster/route.ts:789`, `src/app/api/poster/route.ts:875`, `src/app/api/poster/route.ts:895`
  推测用途: 分享海报里的荧光绿高光和路线强调。

- 色值: `#d8b56b`
  出现位置: `src/app/api/poster/route.ts:357`
  推测用途: 分享海报里的金色夕照/地形高光。

## 登录 / 注册页

- 色值: `#e63946`
  出现位置: `src/app/admin/checkins/AdminCheckinsClient.tsx:10`, `src/app/admin/checkins/AdminCheckinsClient.tsx:16`, `src/app/admin/checkins/AdminCheckinsClient.tsx:277`, `src/app/admin/checkins/AdminCheckinsClient.tsx:278`, `src/app/admin/mountains/AdminMountainsClient.tsx:9`, `src/app/admin/users/AdminUsersClient.tsx:9`, `src/app/auth/login/page.tsx:106`, `src/app/auth/login/page.tsx:107`, `src/app/auth/register/page.tsx:182`
  推测用途: 管理后台和登录/注册页的旧版错误红。

## QA 测试数据

- 色值: `#ff6b6b`
  出现位置: `src/components/community/CommunityTestRecordSeeder.tsx:278`
  推测用途: QA 测试数据中的错误示例色。

---

## 后续清理建议

* P0 收口建议在 UI 实施阶段（下周二之后）和组件 token 化一起做，避免重复 touch 文件
* P1 可在 P0 完成后单独发起一轮全局样式收敛
* P2 不建议在上线前投入，admin 视觉风格本身可独立演进
