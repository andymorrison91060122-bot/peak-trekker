export function getActivityRecordSemantics(isSummit: boolean) {
  return {
    routeSectionLabel: '本次轨迹',
    routeStatusLabel: isSummit ? '登顶记录' : '未登顶记录',
    highestPointLabel: '最高记录点',
    endPointLabel: '结束',
    altitudeLabel: isSummit ? '登顶海拔' : '最高记录海拔',
    timeLabel: isSummit ? '登顶时间' : '记录结束时间',
  } as const
}
