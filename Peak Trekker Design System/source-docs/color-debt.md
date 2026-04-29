# Color Debt

本表记录当前仓库中未纳入 `color-*` 11 个语义 token 的硬编码 hex 颜色，供后续专项清理使用。

## 管理后台与运营面板

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

- 色值: `#6b7280`
  出现位置: `src/app/admin/layout.tsx:40`, `src/app/admin/layout.tsx:54`, `src/app/admin/users/AdminUsersClient.tsx:9`, `src/components/layout/TabBar.tsx:35`, `src/components/layout/TabBar.tsx:43`, `src/components/layout/TabBar.tsx:44`, `src/components/layout/TabBar.tsx:53`, `src/components/layout/TabBar.tsx:54`, `src/components/layout/TabBar.tsx:62`, `src/components/layout/TabBar.tsx:64`, `src/components/layout/TabBar.tsx:72`
  推测用途: 管理后台和底部导航里的旧版中灰文字/未激活状态。

- 色值: `#9ca3af`
  出现位置: `src/app/admin/page.tsx:242`
  推测用途: 管理后台奖牌或排名信息的辅助灰。

- 色值: `#cd7f32`
  出现位置: `src/app/admin/page.tsx:242`
  推测用途: 管理后台铜牌/排序装饰色。

- 色值: `#e63946`
  出现位置: `src/app/admin/checkins/AdminCheckinsClient.tsx:10`, `src/app/admin/checkins/AdminCheckinsClient.tsx:16`, `src/app/admin/checkins/AdminCheckinsClient.tsx:277`, `src/app/admin/checkins/AdminCheckinsClient.tsx:278`, `src/app/admin/mountains/AdminMountainsClient.tsx:9`, `src/app/admin/users/AdminUsersClient.tsx:9`, `src/app/auth/login/page.tsx:106`, `src/app/auth/login/page.tsx:107`, `src/app/auth/register/page.tsx:182`
  推测用途: 管理后台和登录/注册页的旧版错误红。

- 色值: `#e76f51`
  出现位置: `src/app/admin/checkins/AdminCheckinsClient.tsx:16`, `src/app/admin/mountains/AdminMountainsClient.tsx:9`
  推测用途: 管理后台告警或次级危险态橙红色。

- 色值: `#e8f5e9`
  出现位置: `src/app/admin/layout.tsx:39`
  推测用途: 管理后台浅色文字/浅底提示面板。

- 色值: `#f4a261`
  出现位置: `src/app/admin/checkins/AdminCheckinsClient.tsx:10`, `src/app/admin/checkins/AdminCheckinsClient.tsx:16`, `src/app/admin/mountains/AdminMountainsClient.tsx:9`, `src/app/admin/page.tsx:200`, `src/app/admin/page.tsx:202`, `src/app/admin/page.tsx:242`, `src/app/admin/users/AdminUsersClient.tsx:9`
  推测用途: 管理后台橙色统计、提醒和奖牌色。

## 全局旧版深色中性层

- 色值: `#111315`
  出现位置: `src/app/globals.css:184`
  推测用途: 旧版全局背景渐变终点。

- 色值: `#14171a`
  出现位置: `src/components/ui/MountainUI.tsx:39`
  推测用途: 山峰详情旧版深色背景层。

- 色值: `#14181b`
  出现位置: `src/app/api/poster/route.ts:309`, `src/components/ui/MountainUI.tsx:119`
  推测用途: 分享海报和山峰详情的深色表面底。

- 色值: `#15181a`
  出现位置: `src/app/globals.css:184`
  推测用途: 旧版全局背景渐变起始层。

- 色值: `#15191c`
  出现位置: `src/app/components.css:422`, `src/components/ui/SharePosterButton.tsx:145`
  推测用途: 分享按钮和组件 CSS 里的旧版深色卡片底。

- 色值: `#16a34a`
  出现位置: `src/app/components.css:62`, `src/app/globals.css:289`
  推测用途: 旧版 primary button hover 绿。

- 色值: `#171a1d`
  出现位置: `src/app/globals.css:10`
  推测用途: 旧版 muted surface。

- 色值: `#171b1f`
  出现位置: `src/app/api/poster/route.ts:328`, `src/components/ui/ExploreMountainCard.tsx:63`, `src/components/ui/MountainUI.tsx:274`
  推测用途: 海报、Explore 卡片和山峰详情中的旧版边缘深色块。

- 色值: `#171c20`
  出现位置: `src/components/ui/MountainUI.tsx:163`
  推测用途: 山峰详情旧版地图/信息条底色。

- 色值: `#182024`
  出现位置: `src/app/components.css:180`
  推测用途: 组件 CSS 中的深色层次渐变停靠色。

- 色值: `#1a1d21`
  出现位置: `src/app/globals.css:7`
  推测用途: 旧版 secondary surface。

- 色值: `#1a1f23`
  出现位置: `src/app/api/poster/route.ts:384`, `src/components/ui/ExploreMountainCard.tsx:51`, `src/components/ui/MountainUI.tsx:267`
  推测用途: 海报、Explore 卡片和山峰详情中的中层深色背景。

- 色值: `#1a2024`
  出现位置: `src/app/components.css:180`
  推测用途: 组件 CSS 里的旧版卡片渐变中间色。

- 色值: `#1b2421`
  出现位置: `src/components/ui/ExploreMountainCard.tsx:51`, `src/components/ui/MountainUI.tsx:267`
  推测用途: Explore / MountainUI 里带绿调的深色面。

- 色值: `#1c2024`
  出现位置: `src/components/ui/MountainUI.tsx:39`
  推测用途: 山峰详情顶层背景过渡色。

- 色值: `#20252a`
  出现位置: `src/app/api/poster/route.ts:327`
  推测用途: 分享海报中层深色块。

- 色值: `#20262a`
  出现位置: `src/components/ui/MountainUI.tsx:163`
  推测用途: 山峰详情旧版面板边界层。

- 色值: `#20282d`
  出现位置: `src/app/components.css:180`
  推测用途: 组件 CSS 中的深色层次渐变停靠色。

- 色值: `#22282d`
  出现位置: `src/app/api/poster/route.ts:385`, `src/app/api/poster/route.ts:386`
  推测用途: 分享海报中深色卡片/说明面板底。

- 色值: `#23292e`
  出现位置: `src/components/ui/ExploreMountainCard.tsx:51`, `src/components/ui/MountainUI.tsx:267`
  推测用途: Explore / MountainUI 里的旧版卡片深灰。

- 色值: `#2f3a40`
  出现位置: `src/components/ui/MountainUI.tsx:273`
  推测用途: 山峰详情旧版描边或次级卡片底。

- 色值: `#3a4249`
  出现位置: `src/app/globals.css:21`
  推测用途: 旧版 stronger border。

## 分享海报与户外插画色板

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

- 色值: `#d9dde1`
  出现位置: `src/app/api/poster/route.ts:435`, `src/app/api/poster/route.ts:465`, `src/app/api/poster/route.ts:467`, `src/app/api/poster/route.ts:544`, `src/app/api/poster/route.ts:639`, `src/app/globals.css:18`
  推测用途: 海报和旧版全局样式中的浅色次级文字。

## Onboarding 与引导流程色板

- 色值: `#019`
  出现位置: `src/components/ui/OnboardingModal.tsx:317`
  推测用途: Onboarding modal 中的遗留调试/链接色。

- 色值: `#26343b`
  出现位置: `src/components/ui/OnboardingModal.tsx:244`
  推测用途: Onboarding 插图里的深蓝灰山体色。

- 色值: `#4d6c76`
  出现位置: `src/components/ui/OnboardingModal.tsx:244`
  推测用途: Onboarding 插图里的中层山体或雾层色。

- 色值: `#7dd3fc`
  出现位置: `src/components/ui/OnboardingModal.tsx:347`, `src/components/ui/OnboardingModal.tsx:348`, `src/components/ui/OnboardingModal.tsx:43`
  推测用途: Onboarding 中的信息提示蓝和插图高光。

- 色值: `#a7f3d0`
  出现位置: `src/components/ui/AppToastProvider.tsx:33`, `src/components/ui/OnboardingModal.tsx:285`, `src/components/ui/OnboardingModal.tsx:420`, `src/components/ui/OnboardingModal.tsx:429`, `src/components/ui/OnboardingModal.tsx:442`, `src/components/ui/OnboardingModal.tsx:50`
  推测用途: Onboarding 和 toast 中的浅绿成功高光。

- 色值: `#ecb173`
  出现位置: `src/components/ui/OnboardingModal.tsx:244`
  推测用途: Onboarding 插图里的暖色日照高光。

- 色值: `#f6d28d`
  出现位置: `src/components/ui/OnboardingModal.tsx:1008`, `src/components/ui/OnboardingModal.tsx:198`, `src/components/ui/OnboardingModal.tsx:224`, `src/components/ui/OnboardingModal.tsx:36`
  推测用途: Onboarding 流程中的金色主装饰色。

## Toast、状态提示与表单反馈

- 色值: `#60a5fa`
  出现位置: `src/app/globals.css:24`
  推测用途: 旧版 info 状态色。

- 色值: `#86efac`
  出现位置: `src/app/components.css:104`
  推测用途: 组件 CSS 中的浅绿成功态文字或标签色。

- 色值: `#bfdbfe`
  出现位置: `src/components/ui/AppToastProvider.tsx:41`
  推测用途: 信息型 toast 的浅蓝文字色。

- 色值: `#fca5a5`
  出现位置: `src/app/components.css:284`, `src/components/ui/CheckinButton.tsx:66`
  推测用途: 删除/危险操作里的浅红提示文字。

- 色值: `#fda4af`
  出现位置: `src/app/components.css:119`
  推测用途: 组件 CSS 中的浅粉红危险态文字。

- 色值: `#fdba74`
  出现位置: `src/app/components.css:114`
  推测用途: 组件 CSS 中的浅橙警告文字。

- 色值: `#fde68a`
  出现位置: `src/app/components.css:109`
  推测用途: 组件 CSS 中的浅黄警告文字。

- 色值: `#fecaca`
  出现位置: `src/app/(main)/trek/page.tsx:645`, `src/components/profile/ProfileAvatarUploader.tsx:233`, `src/components/ui/AppToastProvider.tsx:48`, `src/components/ui/LockModal.tsx:85`
  推测用途: 删除失败、锁定提示、上传错误等浅红文字/底色。

- 色值: `#ff6b6b`
  出现位置: `src/components/community/CommunityTestRecordSeeder.tsx:278`
  推测用途: QA 测试数据中的错误示例色。

## Explore、Mountain 与社区视觉残留

- 色值: `#0f1113`
  出现位置: `src/components/community/CommunityMediaGallery.tsx:218`, `src/components/community/CommunityMediaGallery.tsx:585`, `src/components/community/CommunityMediaGallery.tsx:95`
  推测用途: 社区媒体画廊的遮罩层和深色底。

- 色值: `#364148`
  出现位置: `src/components/ui/ExploreMountainCard.tsx:62`
  推测用途: Explore 山卡片中的辅助边框/次级面板底。

- 色值: `#f0b5b8`
  出现位置: `src/app/(main)/explore/[id]/page.tsx:172`, `src/components/ui/LockModal.tsx:88`
  推测用途: 锁定提示和 Explore 页面中的柔和危险态文字。

## 后续建议

- 后续若开启颜色债务专项，建议先按模块拆分：`admin`、`onboarding`、`poster`、`explore/mountain`、`toast/status`。
- 清理顺序建议优先从共享样式和全局变量开始，再处理页面级装饰色，最后再处理海报/插图这种允许更自由色板的特殊场景。
