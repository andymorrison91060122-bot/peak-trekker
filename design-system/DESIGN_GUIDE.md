# Peak Trekker 设计资源使用指南

> **本文件是所有前端任务的必读前置文件。**
> Codex 在执行任何前端改动前，必须先完整阅读本文件，理解设计资源的结构、用途和使用规则。

---

## 一、设计资源目录结构

```
design-system/
├── DESIGN_GUIDE.md              ← 本文件（必读）
├── colors_and_type.css          ← 色值 + 字体 token（CSS 变量，权威源）
├── Peak Trekker Mobile UI Kit.html  ← 完整可点击原型预览
├── SKILL.md                     ← Agent skill 配置
├── README.md                    ← 设计系统总览
│
├── assets/                      ← 兜底图片
│   ├── default-mountain-cover.png
│   └── default-activity-cover.png
│
├── templates/                   ← ChatGPT 生成的分享模板 PNG（视觉参考）
│   ├── base-classic.png         ← 基础-经典
│   ├── base-minimal.png         ← 基础-简约
│   ├── base-data.png            ← 基础-数据
│   ├── base-photo-composite.png ← 基础-照片合成
│   ├── adv-photo-overlay.png    ← 高级-照片叠层
│   ├── adv-split-view.png       ← 高级-分栏对照
│   ├── adv-bold-number.png      ← 高级-大字覆盖
│   ├── adv-data-scatter.png     ← 高级-数据散布
│   ├── adv-mono-film.png        ← 高级-黑白影调
│   ├── adv-altitude-profile.png ← 高级-海拔剖面
│   ├── adv-summit-certificate.png ← 高级-山峰证书（待精修）
│   └── adv-vertical-story.png   ← 高级-竖排长卡
│
├── components/                  ← ChatGPT 生成的组件规范 PNG
│   ├── source-label-spec.png    ← 来源标签规范（GPS VERIFIED / UPLOADED）
│   ├── source-label-contexts.png ← 标签在 4 个场景中的位置
│   └── watermark-preview.png    ← 透明水印导出预览
│
├── ui_kits/mobile/              ← Claude Design JSX 组件（结构 + token 参考）
│   ├── [30+ JSX 文件]
│   ├── [8 个 handoff 文档]
│   ├── index.html
│   └── ios-frame.jsx
│
├── preview/                     ← HTML 组件预览（按钮/卡片/间距/色彩等）
│   ├── _base.css
│   ├── buttons.html
│   ├── [20+ HTML 文件]
│   ...
│
└── source-docs/                 ← 规范文档副本
    ├── color-debt.md
    └── ui-interaction-spec.md
```

---

## 二、JSX 文件清单与版本状态

### 当前版本（可用）

| 文件 | 行数 | 对应页面 | 前端任务 |
|---|---|---|---|
| **ExploreScreenV4.jsx** | 245 | Explore 三路径分流 | Explore 页改造 |
| **ScreenshotRecognitionFlow.jsx** | 588 | 截图识别（上传+识别中+结果确认） | 截图识别 UI |
| **ShareEditorV4.jsx** | 1113 | 分享编辑器（Tab+横滑+字段选择器） | 分享编辑器重构 |
| **MonetizationFlow.jsx** | 305 | 商业化（付费引导+会员状态） | 商业化 UI |
| **GpxImportConfirm.jsx** | 447 | 轨迹导入确认页 | 轨迹导入 UI |
| **WatermarkAndSourceLabels.jsx** | 561 | 透明水印+来源标签 | 来源标签+水印 |
| **ImportFlow.jsx** | 593 | 轨迹导入完整流程 | 轨迹导入 UI |
| HomeScreenV4.jsx | 198 | 首页意图分流 | 首页改造（P1） |
| ExploreScreenV3.jsx | 239 | Explore（旧版，V4 的前身） | 仅供参考，以 V4 为准 |
| MountainDetailScreenV2.jsx | — | 山峰详情 | Mountain Detail 优化 |
| TrekScreenV2.jsx | — | Trek 记录过程 | Trek UI 优化 |
| ActivityDetailV2.jsx | — | 活动详情 | 需补来源标签 |
| ShareScreenV3.jsx | 499 | 分享编辑器（旧版） | 仅供参考，以 V4 为准 |
| ArchiveV2.jsx | — | 我的记录 | Archive 优化 |
| Community.jsx | 1071 | 山友圈 | 需补来源标签 |
| FAQScreen.jsx | 593 | FAQ | FAQ 实施 |
| ProfileScreen.jsx | — | Profile | 需补会员状态模块 |
| Primitives.jsx | 219 | 基础组件库（StatusBar/TopBar/TabBar） | 通用组件 |
| HelpPrimitives.jsx | — | FAQ 辅助组件 | FAQ 实施 |
| IntroFlow.jsx | — | Onboarding | Onboarding |
| EmotionalMoments.jsx | — | 情感化节点 | 情感化实施 |
| WeatherMapModules.jsx | — | 天气地图模块 | 天气 UI |
| PolishTokens.jsx | — | Token 精修细节 | 通用 |

### 废弃文件（绝对不得使用）

以下文件是历史版本，已被新版本替代。**Codex 在任何情况下都不应该读取或参考这些文件**：

- ExploreScreen.jsx → 被 V4 替代
- ExploreScreenV2.jsx → 被 V4 替代
- HomeScreen.jsx → 被 V4 替代
- HomeScreenV2.jsx → 被 V4 替代
- HomeScreenV3.jsx → 被 V4 替代
- ShareScreen.jsx → 被 V4 替代
- ShareScreenV2.jsx → 被 V4 替代
- MountainDetailScreen.jsx → 被 V2 替代
- ActivityDetailScreen.jsx → 被 V2 替代

---

## 三、JSX 文件的正确使用方式

### 3.1 JSX 文件是什么

这些 JSX 文件是**设计稿的代码表达**——它们是 React 组件，但目的不是直接放进项目里运行，而是：

1. **提取组件结构**：看 JSX 里的 DOM 层级、组件划分方式
2. **提取样式 token**：看 inline style 里用的颜色、间距、字号、圆角
3. **理解交互逻辑**：看 state 管理、条件渲染、事件处理
4. **理解信息层级**：哪些信息在首屏、哪些在滚动后、哪些可折叠

### 3.2 如何从 JSX 提取信息

```jsx
// JSX 中的这段代码：
<div style={{
  background: '#1a1d21',        // → 对应 --color-surface-variant
  borderRadius: 16,             // → 对应 --radius-lg
  padding: '16px',              // → 对应 --space-4
  border: '1px solid #2f353b'   // → 对应 --color-outline
}}>
  <h3 style={{
    fontSize: 17,               // → 对应 title-l (17px/24px/600)
    fontWeight: 600,
    color: '#f5f7f8'             // → 对应 --color-on-surface
  }}>山峰名</h3>
</div>

// 在实际项目代码中应该写为：
<div className="card">          // 使用 CSS 类，引用 token
  <h3 className="title-l">山峰名</h3>
</div>
```

### 3.3 不要做的事

- ❌ 不要直接复制 JSX 文件到 `src/` 目录
- ❌ 不要使用 JSX 中的硬编码色值（如 `#1a1d21`），改用 CSS token
- ❌ 不要保留 JSX 中的 inline style，改用项目的 CSS 类系统
- ❌ 不要使用废弃版本的 JSX 文件

---

## 四、CSS Token 参考

所有色值和字体 token 定义在 `design-system/colors_and_type.css`。

### 4.1 颜色 Token（11 个语义色）

| Token | 值 | 用途 |
|---|---|---|
| `--color-primary` | `#22c55e` | 主 CTA、成功状态、品牌绿 |
| `--color-on-primary` | `#08120d` | primary 上的文字 |
| `--color-surface` | `#121416` | 页面背景 |
| `--color-surface-variant` | `#23272c` | 卡片背景 |
| `--color-surface-elevated` | `#282d33` | 浮层背景 |
| `--color-on-surface` | `#f5f7f8` | 正文文字 |
| `--color-on-surface-variant` | `#8d959b` | 次要文字 |
| `--color-outline` | `#2f353b` | 边框 |
| `--color-error` | `#ef4444` | 错误状态 |
| `--color-success` | `#6ee7a1` | 成功状态（浅绿） |
| `--color-warning` | `#f59e0b` | 警告状态 |

**规则**：新代码只使用这 11 个 token，不得引入新的硬编码 hex。

### 4.2 字号层级

| Token | 大小/行高/字重 | 用途 |
|---|---|---|
| `display-l` | 28px/36px/700 | 海拔大字等 |
| `headline-m` | 22px/28px/600 | 页面主标题 |
| `title-l` | 17px/24px/600 | 山峰名/活动标题 |
| `title-m` | 15px/20px/500 | 区块标题 |
| `body-l` | 15px/22px/400 | 正文 |
| `body-m` | 14px/20px/400 | 正文（紧凑） |
| `label-m` | 13px/18px/500 | 按钮文字 |
| `label-s` | 11px/14px/500 | 辅助说明/时间戳 |

### 4.3 间距

基于 4px 基准：space-1(4) / space-2(8) / space-3(12) / space-4(16) / space-5(20) / space-6(24) / space-8(32) / space-10(40) / space-12(48) / space-16(64)

常用：页面边距 space-4(16)、卡片内边距 space-4(16)、卡片间距 space-3(12)、模块间距 space-6(24)

### 4.4 圆角

radius-xs(6) / radius-sm(8) / radius-md(12) / radius-lg(16) / radius-xl(20)

### 4.5 按钮

所有按钮高度 44px、圆角 radius-md(12)、字号 label-m(13)。

---

## 五、ChatGPT PNG 的使用方式

### 5.1 分享模板 PNG

这 12 张 PNG 是分享模板的**视觉定稿**。Codex 在实现分享模板时：

1. **查看 PNG** 理解布局、配色、字段排布
2. **用 satori（HTML-to-image）实现**，不用旧的 SVG 手动坐标
3. **色值从 CSS token 取**，不从 PNG 截取色值
4. **布局用 flexbox**，不手动计算 x/y 坐标

### 5.2 来源标签 PNG

`source-label-spec.png` 和 `source-label-contexts.png` 是来源标签的**权威设计规范**。

**标签文案使用英文**：
- `GPS VERIFIED`：品牌 logo + 分隔线 + ✓ + 英文，深绿底+薄荷绿边框
- `UPLOADED`：文档 icon + 英文，深灰底+灰色边框

**三种尺寸**：
- 大尺寸（~28px 高）：分享海报底部
- 中尺寸（~24px 高）：活动详情页
- 小尺寸（~20px 高）：山友圈卡片/记录列表

### 5.3 水印预览 PNG

`watermark-preview.png` 是透明水印导出功能的视觉参考。

---

## 六、Handoff 文档

| 文件 | 阅读时机 |
|---|---|
| HANDOFF.md | 每个前端任务必读（通用交付规范） |
| HOME_EXPLORE_V3_HANDOFF.md | 改 Explore/首页时读 |
| SHARE_V3_HANDOFF.md | 改分享编辑器时读（注意：以 V4 JSX 为准，此 handoff 为基础参考） |
| IMPORT_FLOW_HANDOFF.md | 做轨迹导入 UI 时读 |
| TREK_HANDOFF.md | 改 Trek 页时读 |
| FAQ_HANDOFF.md | 做 FAQ 页时读 |
| COMMUNITY_HANDOFF.md | 改山友圈时读 |
| ACTIVITY_ARCHIVE_HANDOFF.md | 改活动详情/归档时读 |

---

## 七、已锁定的设计决策

以下决策已在产品讨论中确认，**Codex 不可自行修改**：

| 决策 | 结论 |
|---|---|
| Explore 分流形式 | 上二下一（两张并排卡 + 山峰列表） |
| 截图识别取色 | 系统自动识别轨迹颜色，用户不需要手动取色 |
| 轨迹重绘颜色 | 统一品牌绿 `#7ef0b4` |
| 来源标签文案 | 英文：`GPS VERIFIED` / `UPLOADED` |
| 商业化模型 | 基础模板(3)永久免费 + 高级模板(9)限免→付费 |
| 模板实现技术 | satori（HTML-to-image），弃用 SVG 手动坐标 |
| 品牌水印 | 品牌 logo 永久在底部，所有模板都有 |
| 付费水印 | 仅 feature flag 开启 + 未付费时，高级模板预览显示 |
| 编辑器字段选择器 | 内联展示，不是二级页面 |
| 透明水印导出 | 主要功能按钮，不是 toggle 开关 |
| 必选字段 | 海拔 + 总距离（不可隐藏） |
| 可选字段 | 时长/爬升/日期/地点/配速/山峰名（默认开，可关） |

---

## 八、JSX 文件与前端任务的对应关系

| 前端任务 | 主要参考 JSX | 辅助参考 | ChatGPT PNG |
|---|---|---|---|
| Explore 三入口 | **ExploreScreenV4.jsx** | HOME_EXPLORE_V3_HANDOFF.md | — |
| 截图识别流程 | **ScreenshotRecognitionFlow.jsx** | — | — |
| 轨迹导入流程 | **ImportFlow.jsx** + **GpxImportConfirm.jsx** | IMPORT_FLOW_HANDOFF.md | — |
| 分享编辑器 | **ShareEditorV4.jsx** | SHARE_V3_HANDOFF.md | 全部 12 张模板 PNG |
| 来源标签 | **WatermarkAndSourceLabels.jsx** | — | source-label-spec.png + contexts.png |
| 商业化 UI | **MonetizationFlow.jsx** | — | — |
| FAQ | **FAQScreen.jsx** + HelpPrimitives.jsx | FAQ_HANDOFF.md | — |
| 山友圈 | **Community.jsx** | COMMUNITY_HANDOFF.md | source-label-contexts.png |
| 活动详情 | ActivityDetailV2.jsx | ACTIVITY_ARCHIVE_HANDOFF.md | source-label-contexts.png |
| 首页分流（P1） | HomeScreenV4.jsx | HOME_EXPLORE_V3_HANDOFF.md | — |
| Profile | ProfileScreen.jsx | — | — |
| Trek | TrekScreenV2.jsx | TREK_HANDOFF.md | — |

---

## 九、前端任务的 Codex 提示词模板

每个前端任务的提示词应该以这个格式开头：

```
## 前置阅读

在写任何代码之前，必须先阅读以下文件：

1. `design-system/DESIGN_GUIDE.md`（本文件）
2. `design-system/colors_and_type.css`（色值 token）
3. `design-system/ui_kits/mobile/[对应 JSX 文件]`
4. `design-system/ui_kits/mobile/HANDOFF.md`（通用交付规范）
5. `design-system/ui_kits/mobile/[对应 handoff 文件]`
6. [如果涉及分享模板] `design-system/templates/` 下的 PNG 文件
7. [如果涉及来源标签] `design-system/components/source-label-*.png`

从 JSX 提取组件结构和信息层级，但不要直接复制 JSX 代码。
从 CSS token 文件取色值和字号，不要硬编码 hex。
从 PNG 理解视觉风格，但用代码实现时走 token 体系。
```

---

## 十、preview/ HTML 文件的用途

`preview/` 目录下有 22 个 HTML 文件，每个展示一类组件的 token 实现：

| 文件 | 展示内容 |
|---|---|
| buttons.html | Primary / Secondary / Tertiary 按钮 |
| icon-buttons.html | Icon 按钮（返回/关闭/分享等） |
| chips.html | 筛选标签 |
| activity-card.html | 活动卡片 |
| explore-card.html | 山峰探索卡片 |
| metric-tiles.html | 数据指标磁贴 |
| altitude-bar.html | 海拔进度条 |
| trek-states.html | Trek 状态组件 |
| toast-banner.html | Toast / Banner 通知 |
| empty-state.html | 空态页面 |
| color-*.html | 色彩 token 展示 |
| type-*.html | 字体字号展示 |
| spacing.html | 间距刻度展示 |
| radii.html | 圆角展示 |
| shadows.html | 阴影展示 |

当 Codex 需要实现某个组件时，可以先查看对应的 preview HTML，理解该组件在设计系统中的精确样式。
