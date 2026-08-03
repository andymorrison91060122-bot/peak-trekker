import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

const generator = read('scripts/brand/gen-assets.cjs')
const brandAssets = read('src/lib/brand-assets.ts')
const serverAssets = read('src/lib/brand-assets.server.ts')
const brandMask = read('src/components/brand/BrandMask.tsx')
const shareClient = read('src/app/(flow)/share/ShareClient.tsx')
const profileClient = read('src/components/profile/ProfileV2Client.tsx')
const introCarousel = read('src/components/onboarding/IntroCarousel.tsx')

test('client UI masks are derived from full masks while server rendering retains the full mark', () => {
  assert.match(generator, /resizeDerivedMask\(markMask, 'derived-mask-mark-white\.png'[\s\S]*128, 'derived-mask-mark-ui-128\.png'\)/)
  assert.match(generator, /resizeDerivedMask\(crestMask, 'derived-mask-crest-white\.png'[\s\S]*384, 'derived-mask-crest-ui-384\.png'\)/)
  assert.match(generator, /derivedFromSha256: sha\(fullMask\)/)
  assert.match(brandAssets, /markUi128: '\/brand\/derived-mask-mark-ui-128\.png'/)
  assert.match(brandAssets, /crestUi384: '\/brand\/derived-mask-crest-ui-384\.png'/)
  assert.doesNotMatch(brandAssets, /derived-mask-(?:mark|crest)-white\.png/)
  assert.match(brandMask, /BRAND_ASSETS\.mask\.crestUi384/)
  assert.match(brandMask, /BRAND_ASSETS\.mask\.markUi128/)
  assert.doesNotMatch(serverAssets, /readFileSync|node:fs|publicPngDataUri/)
  assert.match(serverAssets, /import \{ getCloudflareContext \} from '@opennextjs\/cloudflare'/)
  assert.match(serverAssets, /process\.env\.NEXT_PUBLIC_PEAK_TREKKER_RUNTIME === 'cloudflare'/)
  assert.match(serverAssets, /await getCloudflareContext\(\{ async: true \}\)/)
  assert.match(serverAssets, /env\.ASSETS\?\.fetch\(new Request\(assetUrl\)\)/)
  assert.match(serverAssets, /fetch\(assetUrl, \{\s*cache: 'force-cache'\s*\}\)/)
  assert.match(serverAssets, /data:image\/png;base64/)
})

test('limited product touchpoints use brand masks without replacing content mountain icons', () => {
  const sourcePill = shareClient.match(/function PreviewSourcePill[\s\S]*?function BrandFooter/)?.[0] ?? ''
  const brandFooter = shareClient.match(/function BrandFooter[\s\S]*?function PreviewWatermarkOverlay/)?.[0] ?? ''
  const verticalStory = shareClient.match(/if \(verticalStory\)[\s\S]*?if \(overlay\)/)?.[0] ?? ''
  const storyIcon = shareClient.match(/function StoryPreviewIcon[\s\S]*?function PremiumMetric/)?.[0] ?? ''
  const tripThumb = profileClient.match(/function TripThumb[\s\S]*?function ArchivePreviewSection/)?.[0] ?? ''

  assert.match(sourcePill, /<BrandMask size=\{12\} \/>/)
  assert.match(brandFooter, /<BrandMask size=\{22\}/)
  assert.match(verticalStory, /<BrandMask size=\{10\} \/>/)
  assert.match(storyIcon, /kind === 'mountain'[\s\S]*<MountainIcon size=\{10\}/)
  assert.match(tripThumb, /<BrandMask size=\{26\} \/>/)
})

test('onboarding uses the small colour tile lockup and preserves the third-slide inner mark', () => {
  assert.match(introCarousel, /<BrandTile size=\{32\} sourceSet="small" \/>/)
  assert.match(introCarousel, />Peak Trekker<\/span>/)
  assert.match(introCarousel, /真实记录与分享/)
  assert.match(introCarousel, /<LogoMark size=\{11\} \/>/)
  assert.match(introCarousel, /分享图/)
})
