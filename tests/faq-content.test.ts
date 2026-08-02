import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FAQ_BY_ANCHOR } from '../src/lib/faq-content.ts'

test('FAQ explains summit verification as GPS range based and photo optional', () => {
  const summitRules = FAQ_BY_ANCHOR['record.summit-rules']
  assert.ok(summitRules)
  assert.match(summitRules.q, /怎样才算登顶|系统如何判定登顶/)
  assert.match(summitRules.a, /GPS 轨迹/)
  assert.match(summitRules.a, /峰顶/)
  assert.match(summitRules.a, /照片/)
  assert.match(summitRules.a, /下山后补|事后补/)

  const summitWindow = FAQ_BY_ANCHOR['record.summit-window']
  assert.ok(summitWindow)
  assert.match(summitWindow.a, /到达峰顶范围即视为登顶|GPS 到达/)
  assert.match(summitWindow.a, /照片.*可.*补/)
  assert.doesNotMatch(summitWindow.a, /提示你拍一张照作为登顶留证/)

  const summitProof = FAQ_BY_ANCHOR['review.what-is-review']
  assert.ok(summitProof)
  assert.match(summitProof.a, /登顶留证|补登记/)
  assert.match(summitProof.a, /事后补充|不判定真伪/)
})

test('FAQ source label explains page Chinese labels and poster English labels', () => {
  const sourceLabel = FAQ_BY_ANCHOR['record.source-label']
  assert.ok(sourceLabel)
  assert.match(sourceLabel.a, /GPS 实测/)
  assert.match(sourceLabel.a, /上传记录/)
  assert.match(sourceLabel.a, /GPS VERIFIED/)
  assert.match(sourceLabel.a, /UPLOADED/)
  assert.match(sourceLabel.a, /轨迹.*到达峰顶范围/)
  assert.match(sourceLabel.a, /照片不是必要条件|不要求现场照片/)
})

test('FAQ includes screenshot how-to guidance with the shared example image', () => {
  const howTo = FAQ_BY_ANCHOR['start.screenshot-how-to'] as unknown as {
    anchor?: string
    q?: string
    a?: string
    image?: {
      src: string
      alt: string
      width: number
      height: number
    }
  } | undefined

  assert.ok(howTo)
  assert.equal(howTo?.anchor, 'start.screenshot-how-to')
  assert.equal(howTo?.q, '如何获取可识别的截图？')
  assert.match(howTo?.a ?? '', /请打开两步路、六只脚、行者等 App 中已经完成的活动记录详情页/)
  assert.match(howTo?.a ?? '', /轨迹和主要数据/)
  assert.match(howTo?.a ?? '', /上传记录/)
  assert.match(howTo?.a ?? '', /Peak Trekker GPS 实测/)
  assert.deepEqual(howTo?.image, {
    src: '/images/screenshot-record-example.webp',
    alt: '两步路活动记录详情页示例，包含轨迹、距离、用时、爬升和最高海拔',
    width: 447,
    height: 737,
  })
})
