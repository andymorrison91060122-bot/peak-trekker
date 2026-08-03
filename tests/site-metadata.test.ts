import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

function readSource(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

const siteUrlSource = readSource('src/lib/site-url.ts')
const layoutSource = readSource('src/app/layout.tsx')
const robotsSource = readSource('src/app/robots.ts')
const sitemapSource = readSource('src/app/sitemap.ts')
const mountainPageSource = readSource('src/app/(flow)/mountain/[id]/page.tsx')
const envExample = readSource('.env.example')

test('canonical site contract uses peaktrekker.cc and keeps the rollback host same-site', () => {
  assert.match(siteUrlSource, /SITE_ORIGIN\s*=\s*['"]https:\/\/peaktrekker\.cc['"]/)
  assert.match(siteUrlSource, /peaktrekker\.cc/)
  assert.match(siteUrlSource, /www\.peaktrekker\.cc/)
  assert.match(siteUrlSource, /peak-trekker\.vercel\.app/)
  assert.match(envExample, /NEXT_PUBLIC_SITE_URL=https:\/\/peaktrekker\.cc/)
})

test('root metadata exposes the approved launch title, description, keywords, and canonical URL', () => {
  assert.match(layoutSource, /metadataBase:\s*new URL\(SITE_ORIGIN\)/)
  assert.match(layoutSource, /default:\s*['"]Peak Trekker - 登山、徒步路线与山峰记录['"]/)
  assert.match(layoutSource, /template:\s*['"]%s \| Peak Trekker['"]/)
  assert.match(layoutSource, /浏览山峰资料和徒步路线参考，记录真实登山与户外徒步活动。/)
  for (const keyword of ['登山', '徒步路线', '山峰资料', '登山记录', '户外徒步']) {
    assert.match(layoutSource, new RegExp(`['"]${keyword}['"]`))
  }
  assert.match(layoutSource, /canonical:\s*SITE_ORIGIN/)
  assert.match(layoutSource, /url:\s*SITE_ORIGIN/)
})

test('robots allows public pages, protects private surfaces, and points to the canonical sitemap', () => {
  assert.match(robotsSource, /sitemap:\s*`\$\{SITE_ORIGIN\}\/sitemap\.xml`/)
  assert.match(robotsSource, /allow:\s*['"]\/['"]/)
  for (const path of ['/api/', '/auth/', '/profile', '/trek', '/activity/', '/share', '/screenshot', '/import', '/admin/', '/debug/']) {
    assert.match(robotsSource, new RegExp(path.replaceAll('/', '\\/')))
  }
})

test('sitemap includes approved public pages and only active readable entities', () => {
  assert.match(sitemapSource, /url:\s*SITE_ORIGIN/)
  for (const path of ['/explore', '/imprint', '/faq']) {
    assert.ok(sitemapSource.includes(`url: \`\${SITE_ORIGIN}${path}\``))
  }
  assert.match(sitemapSource, /\.eq\(['"]is_active['"],\s*true\)/)
  assert.match(sitemapSource, /\.eq\(['"]is_readable['"],\s*true\)/)
  assert.match(sitemapSource, /`\$\{SITE_ORIGIN\}\/mountain\/\$\{mountain\.id\}`/)
  for (const privatePath of ['/auth', '/profile', '/trek', '/activity', '/share', '/screenshot', '/import', '/admin', '/debug', '/api']) {
    assert.equal(sitemapSource.includes(`\${SITE_ORIGIN}${privatePath}`), false)
  }
})

test('mountain detail metadata distinguishes mountains from route corridors truthfully', () => {
  assert.match(mountainPageSource, /export async function generateMetadata/)
  assert.match(mountainPageSource, /entity_type === ['"]route_corridor['"]/)
  assert.match(mountainPageSource, /- 海拔、山峰资料与登山记录/)
  assert.match(mountainPageSource, /- 徒步路线与轨迹参考/)
  assert.match(mountainPageSource, /alternates:\s*\{\s*canonical(?:\s*[:,}])/)
  assert.doesNotMatch(mountainPageSource, /官方开放|安全路线|导航路线|保证登顶/)
})
