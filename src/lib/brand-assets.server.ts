import 'server-only'
import { getCloudflareContext } from '@opennextjs/cloudflare'

let brandMarkMaskDataUriPromise: Promise<string> | null = null
const BRAND_MARK_MASK_ASSET_PATH = '/brand/derived-mask-mark-white.png'

function isCloudflareWorkerRuntime() {
  return process.env.NEXT_PUBLIC_PEAK_TREKKER_RUNTIME === 'cloudflare'
}

async function fetchWorkerBrandMarkMask(assetUrl: URL) {
  const { env } = await getCloudflareContext({ async: true })
  const response = await env.ASSETS?.fetch(new Request(assetUrl))
  if (!response) {
    throw new Error('Worker brand mark asset binding is unavailable')
  }
  return response
}

async function fetchBrandMarkMaskDataUri(origin: string) {
  const assetUrl = new URL(BRAND_MARK_MASK_ASSET_PATH, origin)
  const response = isCloudflareWorkerRuntime()
    ? await fetchWorkerBrandMarkMask(assetUrl)
    : await fetch(assetUrl, { cache: 'force-cache' })
  if (!response.ok) {
    throw new Error(`Brand mark responded ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return `data:image/png;base64,${bytes.toString('base64')}`
}

export async function loadBrandMarkMaskDataUri(origin: string) {
  brandMarkMaskDataUriPromise ??= fetchBrandMarkMaskDataUri(origin)
  try {
    return await brandMarkMaskDataUriPromise
  } catch (error) {
    brandMarkMaskDataUriPromise = null
    throw error
  }
}
