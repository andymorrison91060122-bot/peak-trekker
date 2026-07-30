import assert from 'node:assert/strict'
import test from 'node:test'

import { getActivityRecordSemantics } from '../src/lib/activity-record-semantics.ts'

test('verified activity uses summit truth without claiming a complete route', () => {
  assert.deepEqual(getActivityRecordSemantics(true), {
    routeSectionLabel: '本次轨迹',
    routeStatusLabel: '登顶记录',
    highestPointLabel: '最高记录点',
    endPointLabel: '结束',
    altitudeLabel: '登顶海拔',
    timeLabel: '登顶时间',
  })
})

test('incomplete activity stays incomplete regardless of duration', () => {
  assert.deepEqual(getActivityRecordSemantics(false), {
    routeSectionLabel: '本次轨迹',
    routeStatusLabel: '未登顶记录',
    highestPointLabel: '最高记录点',
    endPointLabel: '结束',
    altitudeLabel: '最高记录海拔',
    timeLabel: '记录结束时间',
  })
})

test('screenshot route card wording stays on baseline highest-point copy', () => {
  assert.equal(getActivityRecordSemantics(true).highestPointLabel, '最高记录点')
  assert.equal(getActivityRecordSemantics(false).highestPointLabel, '最高记录点')
})
