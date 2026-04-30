# Peak Trekker 本地验收报告

## 本轮目标
- 按 2026-04-09 最终验收收口计划，先更新两条旧自动化基线，再补完整手机端视觉巡检、普通用户连续旅程和高风险能力定向复核。
- 这轮以“测试闭环优先”为准，不新增业务能力；只在补测中发现真实回退时才修产品或修测试基线。
- 已按产品判断跳过两项，不再计入开放问题：
  - 执照区“证书感 / 荣誉感”的主观终验
  - 微信真机分享路径

## 测试环境
- 执行日期：2026-04-09
- 主地址：`http://127.0.0.1:3100`
- 启动参数：
  - `ENABLE_QA_TEST_HELPERS=true`
  - `NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS=true`
  - `COMMUNITY_TEST_ADMIN_EMAIL=qa-admin-regression@example.com`
  - `ADMIN_EMAILS=qa-admin-regression@example.com`
- 浏览器：
  - Desktop Chrome（Playwright）
  - 移动补测：`Pixel 7` 模拟
- 角色覆盖：
  - 游客
  - 新注册普通用户
  - 已有记录普通用户
  - 第二普通用户
  - 管理员
- 本轮跳过项：
  - 执照区主观“证书感 / 荣誉感”判断
  - 微信真机系统分享路径

## 已执行验证
- `set -a && source .env.local && set +a && npx playwright test tests/e2e/app.spec.ts`
- `set -a && source .env.local && export COMMUNITY_TEST_ADMIN_EMAIL=qa-admin-regression@example.com && export ADMIN_EMAILS=qa-admin-regression@example.com && set +a && npx playwright test --config=output/qa/playwright.community.chrome.config.ts tests/e2e/community-acceptance.spec.ts`
- `set -a && source .env.local && export COMMUNITY_TEST_ADMIN_EMAIL=qa-admin-regression@example.com && export ADMIN_EMAILS=qa-admin-regression@example.com && set +a && npx playwright test --reporter=line --config=output/qa/playwright.community.chrome.config.ts tests/e2e/community-regression.spec.ts`
- `set -a && source .env.local && export COMMUNITY_TEST_ADMIN_EMAIL=qa-admin-regression@example.com && export ADMIN_EMAILS=qa-admin-regression@example.com && set +a && npx playwright test --reporter=line --config=output/qa/playwright.community.chrome.config.ts tests/e2e/community-delete-regression.spec.ts`
- `set -a && source .env.local && set +a && npx playwright test tests/e2e/toast-registry.spec.ts`
- `set -a && source .env.local && set +a && npx playwright test --config=output/qa/playwright.manual.config.ts output/qa/manual-mobile.spec.ts`
- `set -a && source .env.local && set +a && npx playwright test --config=output/qa/playwright.manual.config.ts output/qa/coverage-gap.spec.ts`

## 已覆盖场景
- Onboarding：
  - 三幕引导
  - `先自己逛逛`
  - 轻量 `继续引导`
  - `不再提醒`
  - 重新开启引导
  - 文案与 checklist 走读
- Explore / Trek：
  - 山峰详情“主 CTA + 滚动悬浮 CTA”
  - `/trek` preflight 目标确认
  - `60 秒内` 无效记录
  - 定位拒绝
  - 轨迹点不足登顶拒绝
  - 照片打卡成功 / 失败 / 存储缺失 / 替换
  - Trek 成功态海报预览 / 分享 / 下载兜底
  - Trek 录制中轻量过程分享
- Profile：
  - `查看活动`
  - 头像上传与刷新
  - 我的记录 / 我的分享折叠
  - `查看分享详情`
  - poster 自动带入发布页
  - 空状态文案
- Community：
  - 头部收口
  - 多图 / 无图 / 默认地图卡片
  - `查看完整动态`
  - 点赞 toast / 点赞头像堆叠 / 点赞列表
  - 分享调起 / 复制链接兜底
  - 私密发布、举报、审核、删除、权限边界
- 手机端视觉巡检：
  - `/explore`
  - `/explore/[id]`
  - `/trek`
  - `/profile`
  - `/community`
- 普通用户连续旅程 happy path：
  - 首访
  - onboarding
  - 注册
  - 找山
  - 看详情
  - Trek preflight
  - 开始记录
  - 有效记录
  - 生成海报
  - 分享到山友圈
  - 回到 `/profile` 查看记录与分享

## 通过项
- 两条旧自动化基线已经更新并转绿：
  - `3-LOGIN-RETURN-FLOW`
  - `11-COMMUNITY-IMMEDIATE-PUBLISH-BASELINE`
- 正式回归结果：
  - `tests/e2e/app.spec.ts`：`16 passed`
  - `tests/e2e/community-acceptance.spec.ts`：`7 passed`
  - `tests/e2e/community-regression.spec.ts`：`1 passed`
  - `tests/e2e/community-delete-regression.spec.ts`：`1 passed`
  - `tests/e2e/toast-registry.spec.ts`：`1 passed`
- 补测结果：
  - `output/qa/manual-mobile.spec.ts`：`8 passed`
  - `output/qa/coverage-gap.spec.ts`：`9 passed`
- 手机端逐页视觉巡检已完成，Pixel 7 模拟下 5 页未见明显错行、挤压、组件变形或点击区异常。
- 普通用户连续旅程已经完整走通，跨模块没有出现“迷路”或状态丢失。
- 高风险能力定向复核已全部拿到最终结论：
  - `60 秒内` 无效记录
  - 图片上传失败提示
  - 存储未配置提示
  - Trek 成功态海报预览与分享兜底
  - `查看活动` 回到自己的记录
  - poster 自动带入发布页
  - `查看分享详情` 进入社区详情页
  - Community 点赞头像堆叠和点赞列表
  - 普通用户无法进入 `/admin/community`

## 失败项
- 当前未发现开放的失败项。

## 阻塞验收问题
- 当前未发现阻塞验收问题。

## 高优先级体验问题
- 当前未发现仍然开放的高优先级体验问题。

## 与原清单不一致项
- 本轮不再保留“旧自动化基线失败”作为开放问题；两条基线已更新并通过。
- “手机端逐页视觉巡检”和“普通用户连续旅程”已完成，不再保留为遗漏项。
- 执照区“证书感 / 荣誉感”与微信真机分享路径按你确认的产品判断跳过，不计入开放缺陷。

## 待你确认的产品判断
- 当前关闭范围内无待确认项。
- 如果你后续要继续扩展终验，只剩两类主动跳过项可单独开新轮次：
  - 执照区主观荣誉感判断
  - 微信真机分享路径

## 证据补充
- Pixel 7 模拟视觉截图：
  - `/Users/liuhongyuan/Desktop/peak-trekker/test-results/manual-mobile-mobile-explo-61075--stable-from-list-to-detail/mobile-explore.png`
  - `/Users/liuhongyuan/Desktop/peak-trekker/test-results/manual-mobile-mobile-explo-61075--stable-from-list-to-detail/mobile-explore-detail-scrolled.png`
  - `/Users/liuhongyuan/Desktop/peak-trekker/test-results/manual-mobile-mobile-trek--f230f-and-primary-controls-stable/mobile-trek-ready.png`
  - `/Users/liuhongyuan/Desktop/peak-trekker/test-results/manual-mobile-mobile-profi-d6122-act-and-records-area-stable/mobile-profile.png`
  - `/Users/liuhongyuan/Desktop/peak-trekker/test-results/manual-mobile-mobile-commu-859a5-ps-cards-and-actions-stable/mobile-community.png`
- 连续旅程关键截图：
  - `/Users/liuhongyuan/Desktop/peak-trekker/test-results/manual-mobile-mobile-happy-95726-mmunity-and-back-to-profile/mobile-happy-path-poster-preview.png`
  - `/Users/liuhongyuan/Desktop/peak-trekker/test-results/manual-mobile-mobile-happy-95726-mmunity-and-back-to-profile/mobile-happy-path-community-detail.png`
  - `/Users/liuhongyuan/Desktop/peak-trekker/test-results/manual-mobile-mobile-happy-95726-mmunity-and-back-to-profile/mobile-happy-path-profile.png`

## 本轮结论
- 本轮收口计划已经完成。
- 当前验收范围内的产品问题、旧自动化基线、手机端视觉巡检和高风险补测都已关闭。
- 这轮结束后，不再有需要继续追的开放失败项；后续若继续，仅是你已明确跳过的人工/真机终验项。
