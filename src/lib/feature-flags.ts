export const FEATURE_FLAGS = {
  // 省域排行榜（月榜 / 积分 / 排名）
  // 暂时下线 — 产品方向调整为"档案馆"，时间窗口榜对低频活动不友好
  // 后端逻辑保留，重新启用时改为 true 即可
  PROVINCE_RANKING: false,
} as const

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag]
}
