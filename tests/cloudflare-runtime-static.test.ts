import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
const packageLock = readFileSync('package-lock.json', 'utf8')
const envExample = readFileSync('.env.example', 'utf8')
const recognitionService = readFileSync('src/lib/screenshot/recognition-service.ts', 'utf8')
const screenshotTypes = readFileSync('src/lib/screenshot/types.ts', 'utf8')

test('Cloudflare candidate removes Tencent OCR runtime residue', () => {
  const removedAdapterPath = ['tencent', 'ocr', 'adapter.ts'].join('-')
  const removedPackage = ['tencentcloud', 'sdk', 'nodejs', 'ocr'].join('-')
  const removedSecretPrefix = ['TENCENT', 'CLOUD', 'SECRET'].join('_')
  const removedOptions = new RegExp([['force', 'Tencent'].join(''), ['tencent', 'Invoker'].join(''), removedAdapterPath].join('|'))

  assert.equal(existsSync(`src/lib/screenshot/${removedAdapterPath}`), false)
  assert.equal(packageJson.dependencies?.[removedPackage], undefined)
  assert.equal(packageJson.devDependencies?.[removedPackage], undefined)
  assert.doesNotMatch(packageLock, new RegExp(removedPackage))
  assert.doesNotMatch(envExample, new RegExp(`${removedSecretPrefix}_(ID|KEY)`))
  assert.match(screenshotTypes, /export type ScreenshotOcrSource = 'mimo_v25'/)
  assert.doesNotMatch(recognitionService, removedOptions)
})
