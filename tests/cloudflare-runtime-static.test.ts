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
const screenshotRecognitionRoute = readFileSync('src/app/api/screenshot/recognize/route.ts', 'utf8')
const wranglerConfig = existsSync('wrangler.jsonc') ? readFileSync('wrangler.jsonc', 'utf8') : ''
const openNextConfig = existsSync('open-next.config.ts') ? readFileSync('open-next.config.ts', 'utf8') : ''
const gitignore = readFileSync('.gitignore', 'utf8')
const customWorker = existsSync('custom-worker.ts') ? readFileSync('custom-worker.ts', 'utf8') : ''

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

test('screenshot recognition helper is not a Next route export', () => {
  assert.doesNotMatch(screenshotRecognitionRoute, /export function recognitionFailureResponse/)
  assert.match(screenshotRecognitionRoute, /function recognitionFailureResponse/)
})

test('Cloudflare candidate defines one minimal OpenNext Worker without storage or migration bindings', () => {
  assert.equal(existsSync('wrangler.jsonc'), true)
  assert.equal(existsSync('open-next.config.ts'), true)

  const config = JSON.parse(wranglerConfig) as {
    name?: string
    main?: string
    compatibility_date?: string
    compatibility_flags?: string[]
    assets?: { directory?: string; binding?: string; run_worker_first?: boolean }
    observability?: { enabled?: boolean }
    secrets?: { required?: string[] }
  }

  assert.equal(config.name, 'peak-trekker')
  assert.equal(config.main, 'custom-worker.ts')
  assert.ok((config.compatibility_date ?? '') >= '2025-04-01')
  assert.deepEqual(config.compatibility_flags, ['nodejs_compat'])
  assert.deepEqual(config.assets, {
    directory: '.open-next/assets',
    binding: 'ASSETS',
    run_worker_first: false,
  })
  assert.deepEqual(config.observability, { enabled: true })
  assert.equal('vars' in config, false)
  assert.deepEqual(config.secrets?.required, [
    'SUPABASE_SERVICE_ROLE_KEY',
    'MIMO_API_KEY',
    'QWEATHER_API_KEY',
    'WEATHER_REFRESH_SECRET',
  ])
  assert.doesNotMatch(wranglerConfig, /r2_buckets|kv_namespaces|durable_objects|hyperdrive|migrations|services/i)
  assert.match(customWorker, /from '\.\/\.open-next\/worker\.js'/)
  assert.match(customWorker, /ensureWorkerShareRenderer/)
  assert.match(customWorker, /openNextHandler\.fetch\(request, env, context\)/)
  assert.match(customWorker, /'\/api\/share\/render'/)
  assert.match(customWorker, /'\/api\/poster'/)
  assert.match(customWorker, /'\/api\/poster-preview'/)
  assert.doesNotMatch(customWorker, /photoBase64|checkinId|user_id|access_token|service_role/)
  assert.match(openNextConfig, /import \{ defineCloudflareConfig, type OpenNextConfig \} from '@opennextjs\/cloudflare'/)
  assert.match(openNextConfig, /\.\.\.defineCloudflareConfig\(\)/)
  assert.match(
    openNextConfig,
    /buildCommand: 'NEXT_PUBLIC_PEAK_TREKKER_RUNTIME=cloudflare npm run build -- --webpack'/,
  )
  assert.match(openNextConfig, /satisfies OpenNextConfig/)
  assert.equal(packageJson.scripts?.['cf:build'], 'opennextjs-cloudflare build')
  assert.equal(packageJson.scripts?.['cf:preview'], 'opennextjs-cloudflare preview')
  assert.equal(packageJson.scripts?.['cf:upload'], 'opennextjs-cloudflare upload')
  assert.equal(packageJson.scripts?.['cf:deploy'], 'opennextjs-cloudflare deploy')
  assert.match(gitignore, /^\/\.open-next\/$/m)
  assert.match(gitignore, /^\/\.wrangler\/$/m)
  assert.match(gitignore, /^\/\.dev\.vars\*$/m)
  assert.match(gitignore, /^\/output\/cloudflare-migration\/$/m)
})
