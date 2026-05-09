'use client'

import { isFeatureEnabled } from '@/lib/feature-flags'

export const ONBOARDING_QA_CHECK_KEY = 'peak_trekker_onboarding_regression_checks_v1'
export const TREK_QA_CHECK_KEY = 'peak_trekker_trek_regression_checks_v1'
export const COMMUNITY_QA_CHECK_KEY = 'peak_trekker_community_manual_checks_v1'
export const QA_CHECKLIST_EVENT = 'peak-trekker:qa-checklist-update'
const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')

export const ONBOARDING_QA_SCENARIOS = [
  {
    id: 'first-visit-intro',
    title: '匿名首次访问触发 Phase A',
    startAt: '/explore',
    action: '重置到首次访问后进入探索页，观察是否先出现三幕式预告片。',
    expect: '用户先看到预告片，不直接落到内容列表。',
  },
  {
    id: 'skip-to-province',
    title: '任意幕跳过进入省份锚定',
    startAt: '/explore',
    action: '在第一幕或第二幕点击跳过。',
    expect: '直接进入省份选择，不强制播放完整动画。',
  },
  {
    id: 'province-personalization',
    title: '省份选择即时个性化探索页',
    startAt: '/explore',
    action: '选择省份并完成空白执照过渡。',
    expect: provinceRankingEnabled
      ? '探索页“本省热门”立即按所选省份展示。'
      : '省份草稿会被保存，后续注册会自动预填归属地。',
  },
  {
    id: 'register-prefill',
    title: '注册页自动预填省份草稿',
    startAt: '/auth/register',
    action: '进入注册页第二步查看省份选择框。',
    expect: '自动带入之前 onboarding 里选定的省份。',
  },
  {
    id: 'activation-find-peak',
    title: 'Checklist 第一步：找一座山',
    startAt: '/explore',
    action: '打开任意山峰详情页 `/explore/[id]`。',
    expect: 'Activation checklist 的 find_peak 自动完成。',
  },
  {
    id: 'activation-open-start',
    title: 'Checklist 第二步：打开 Start',
    startAt: '/trek',
    action: '点击 `Start 开启记录` 主按钮。',
    expect: 'Activation checklist 的 open_start 自动完成。',
  },
  {
    id: 'activation-learn-share',
    title: 'Checklist 第三步：了解分享卡',
    startAt: '/trek',
    action: '在生成分享卡入口打开模板选择或点“查看说明”。',
    expect: 'Activation checklist 的 learn_share 自动完成并触发完成提示。',
  },
  {
    id: 'repeat-suppression',
    title: '完成后不重复弹完整引导',
    startAt: '/explore',
    action: '完成三项任务后刷新或重新进入主站。',
    expect: '老用户不再看到完整三幕预告片。',
  },
] as const

export const TREK_QA_SCENARIOS = [
  {
    id: 'trek-happy-path',
    title: '完整闭环：Start -> 接近峰顶 -> 核验 -> 分享',
    startAt: '/trek',
    action: '开启记录并移动到峰顶范围，点击“确认登顶”，随后生成 Summit Card 并执行分享或保存。',
    expect: '成功生成已核验活动记录，分享卡可正常预览与导出。',
    type: 'happy',
  },
  {
    id: 'community-priority',
    title: '社区优先展示已核验活动',
    startAt: '/community',
    action: '完成一条实时 GPS 核验后进入山友圈，观察卡片排序与标签。',
    expect: '已核验活动优先展示，历史补登清晰区分。',
    type: 'happy',
  },
  {
    id: 'profile-consistency',
    title: '个人页摘要字段一致',
    startAt: '/profile',
    action: '核对同一条活动在出发页、社区卡片和个人页中的距离/爬升/时长表述。',
    expect: '核心字段一致，不出现同一活动多处数据冲突。',
    type: 'happy',
  },
  {
    id: 'gps-permission-denied',
    title: '异常：GPS 权限拒绝',
    startAt: '/trek',
    action: '在浏览器站点设置中拒绝定位后点击 Start。',
    expect: '页面给出明确拒权提示，可在授权后恢复继续。',
    type: 'failure',
  },
  {
    id: 'insufficient-track-points',
    title: '异常：轨迹点不足/会话过短',
    startAt: '/trek',
    action: '开启记录后立即尝试确认登顶，或轨迹点较少时提交。',
    expect: '服务端拒绝并给出可恢复提示，继续记录后可再次提交。',
    type: 'failure',
  },
  {
    id: 'duplicate-summit-submit',
    title: '异常：重复登顶提交',
    startAt: '/trek',
    action: '一次核验成功后再次尝试提交同一会话。',
    expect: '不会新增重复 checkin，返回重复提交保护结果。',
    type: 'failure',
  },
  {
    id: 'photo-upload-failed',
    title: '异常：图片上传失败恢复',
    startAt: '/trek',
    action: '展开照片打卡，断网或使用无效网络后提交，再恢复网络重试。',
    expect: '出现清晰失败提示，可在恢复网络后重试成功。',
    type: 'failure',
  },
  {
    id: 'share-card-fallback',
    title: '异常：分享链路降级保存',
    startAt: '/trek',
    action: '在不支持 Web Share 的环境生成分享卡并点击分享。',
    expect: '自动回退为本地保存，不中断用户操作。',
    type: 'failure',
  },
] as const

export const COMMUNITY_QA_SCENARIOS = [
  {
    id: 'community-immediate-publish',
    title: '即时发布：登顶成功后直达分享编辑页',
    startAt: '/trek',
    action: '完成一次实时登顶核验，在成功页点击“分享到山友圈”，补标题和正文后直接发布。',
    expect: '从登顶成功态直接进入山友圈编辑页；发布成功后进入详情页，出现“发布成功”反馈卡。',
    autoTest: 'community immediate publish path works from trek summit success state',
    area: '即时发布',
  },
  {
    id: 'community-record-boundary',
    title: '绑定边界：私密内容与 чужой 记录越权拦截',
    startAt: '/community',
    action: '用一条历史补签记录发布“仅自己可见”内容，再切换到另一个普通用户访问公开流、详情页，并尝试伪造发布/删除请求。',
    expect: '私密内容不进入公开流；非本人无法访问私密详情，不能越权发布或删除 чужой 记录。',
    autoTest: 'community stays bound to valid records and blocks foreign/private access',
    area: '权限与边界',
  },
  {
    id: 'community-weak-network',
    title: '弱网恢复：发布失败与素材上传失败后可继续恢复',
    startAt: '/community',
    action: '进入分享编辑页，先模拟发布请求失败，再模拟素材上传失败，恢复网络后继续发布。',
    expect: '编辑页出现清晰的“网络不稳定”提示；恢复网络后无需重填整页内容，可以继续发布成功。',
    autoTest: 'community publish editor tolerates weak network and upload failures with clear feedback',
    area: '弱网与离线素材',
  },
  {
    id: 'community-delayed-publish',
    title: '延迟发布：从我的登山记录离开后再回来继续发',
    startAt: '/profile',
    action: '在“我的登山记录”里点“分享到山友圈”进入编辑页，点击“稍后再说”返回；稍后再从同一条记录重新进入并发布。',
    expect: '退出编辑页后记录仍保持“尚未分享到山友圈”；再次进入仍绑定同一条有效记录，发布后状态更新为已分享。',
    autoTest: 'community delayed publish path stays record-bound after leaving editor and returning later',
    area: '延迟发布',
  },
  {
    id: 'community-asset-tamper',
    title: '素材篡改拦截：不属于当前记录的素材不能发布',
    startAt: '/community',
    action: '对当前 checkin 人工构造一个不属于该记录的外部素材地址并提交发布请求。',
    expect: '服务端返回 422，明确拒绝“素材必须属于当前登山记录”。前台不能绕过这层校验。',
    autoTest: 'community rejects tampered assets that do not belong to the bound trekking record',
    area: '数据安全',
  },
  {
    id: 'community-delete-restore',
    title: '删除闭环：删除内容后回到个人页且记录恢复未分享',
    startAt: '/profile',
    action: '先发布一条山友圈内容，再进入详情页执行“删除内容”。',
    expect: '删除后硬跳转回个人页；“我的分享”中不再显示该内容，“我的登山记录”恢复为未分享并重新出现“分享到山友圈”。',
    autoTest: 'community delete flow removes published content and returns record to unshared state',
    area: '删除与恢复',
  },
  {
    id: 'community-full-regression',
    title: '完整旅程：发布、浏览、编辑、举报、管理员处理',
    startAt: '/profile',
    action: '从“我的登山记录”发布内容，去公开流和详情页浏览，再编辑内容、由第二个用户举报，最后由管理员进入后台查看举报。',
    expect: '发布、浏览、编辑、举报、管理链路全部打通；普通用户不能进入后台，管理员可以进入 `/admin/community` 查看举报队列。',
    autoTest: 'community flow regression covers publish, browse, edit, delete, report, and admin review permissions',
    area: '完整闭环',
  },
] as const

type ChecklistGroup = 'onboarding' | 'trek' | 'community'

function getChecklistKey(group: ChecklistGroup) {
  if (group === 'onboarding') return ONBOARDING_QA_CHECK_KEY
  if (group === 'trek') return TREK_QA_CHECK_KEY
  return COMMUNITY_QA_CHECK_KEY
}

function emitChecklistUpdate() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(QA_CHECKLIST_EVENT))
}

export function readChecklist(group: ChecklistGroup) {
  if (typeof window === 'undefined') return {} as Record<string, boolean>
  const raw = window.localStorage.getItem(getChecklistKey(group))
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, boolean>
  } catch {
    return {}
  }
}

export function writeChecklist(group: ChecklistGroup, payload: Record<string, boolean>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getChecklistKey(group), JSON.stringify(payload))
  emitChecklistUpdate()
}

export function clearChecklist(group: ChecklistGroup) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(getChecklistKey(group))
  emitChecklistUpdate()
}

export function markChecklistItem(group: ChecklistGroup, scenarioId: string, value: boolean) {
  const current = readChecklist(group)
  writeChecklist(group, { ...current, [scenarioId]: value })
}
