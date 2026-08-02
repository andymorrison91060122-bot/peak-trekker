import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const ROOT = resolve(import.meta.dirname, '..')

function read(relativePath: string) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

test('screenshot how-to opens the shared help sheet anchor and no longer logs a placeholder', () => {
  const source = read('src/app/(flow)/screenshot/ScreenshotClient.tsx')

  assert.match(source, /useHelpSheet/)
  assert.match(source, /openHelpSheet\('start\.screenshot-how-to'\)/)
  assert.doesNotMatch(source, /Screenshot how-to will be added later/)
})

test('FAQ and help sheet share the same answer renderer and image sizing contract', () => {
  const helpSheet = read('src/components/help/HelpSheet.tsx')
  const faqClient = read('src/app/(flow)/faq/FAQClient.tsx')
  const answerContent = read('src/components/help/FaqAnswerContent.tsx')

  assert.match(helpSheet, /FaqAnswerContent/)
  assert.match(helpSheet, /imageMaxWidth=\{220\}/)
  assert.match(faqClient, /FaqAnswerContent/)
  assert.match(faqClient, /imageMaxWidth=\{280\}/)
  assert.match(answerContent, /maxWidth: imageMaxWidth/)
  assert.match(answerContent, /objectFit|marginInline/)
})

test('acceptance checklist includes the screenshot capture guidance and shared asset contract', () => {
  const checklist = read('docs/acceptance-checklist.md')

  assert.match(checklist, /如何获取可识别的截图/)
  assert.match(checklist, /与截图页帮助入口共用同一示例图/)
  assert.match(checklist, /截图页“如何获取截图？”可原地打开帮助弹层/)
})
