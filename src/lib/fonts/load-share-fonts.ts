import { getCloudflareContext } from '@opennextjs/cloudflare'

type ShareFont = {
  name: string
  data: ArrayBuffer
  weight: 400 | 500 | 600 | 700 | 800
  style: 'normal'
}

export type ShareFontBuffers = {
  regular: ArrayBuffer
  bold: ArrayBuffer
  rajdhaniSemiBold: ArrayBuffer
  rajdhaniBold: ArrayBuffer
}

const FONT_FAMILY = 'Noto Sans SC'
const METRIC_FONT_FAMILY = 'Rajdhani'
const LOCAL_FONT_FILES = {
  regular: 'NotoSansSC-Regular.otf',
  bold: 'NotoSansSC-Bold.otf',
  rajdhaniSemiBold: 'Rajdhani-SemiBold.ttf',
  rajdhaniBold: 'Rajdhani-Bold.ttf',
}

const REMOTE_FONT_URLS = {
  regular:
    'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  bold: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
}

const fontBufferCache = new Map<string, Promise<ShareFontBuffers>>()
const fontCache = new Map<string, ShareFont[]>()

type StaticFontAssetFetcher = (assetUrl: URL) => Promise<Response>
type RemoteFontFetcher = (url: string) => Promise<ArrayBuffer>

function buildFonts(regular: ArrayBuffer, bold: ArrayBuffer, rajdhaniSemiBold: ArrayBuffer, rajdhaniBold: ArrayBuffer) {
  return [
    { name: FONT_FAMILY, data: regular, weight: 400, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 500, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 600, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 700, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 800, style: 'normal' as const },
    { name: METRIC_FONT_FAMILY, data: rajdhaniSemiBold, weight: 600, style: 'normal' as const },
    { name: METRIC_FONT_FAMILY, data: rajdhaniBold, weight: 700, style: 'normal' as const },
    { name: METRIC_FONT_FAMILY, data: rajdhaniBold, weight: 800, style: 'normal' as const },
  ] satisfies ShareFont[]
}

function isCloudflareRuntime() {
  return process.env.NEXT_PUBLIC_PEAK_TREKKER_RUNTIME === 'cloudflare'
}

async function staticFontAssetFetcher(): Promise<StaticFontAssetFetcher> {
  if (isCloudflareRuntime()) {
    const { env } = await getCloudflareContext({ async: true })
    return async (assetUrl: URL) => {
      const response = await env.ASSETS?.fetch(new Request(assetUrl))
      if (!response) throw new Error('Worker font asset binding is unavailable')
      return response
    }
  }

  return (assetUrl: URL) => fetch(assetUrl, { cache: 'force-cache' })
}

async function fetchStaticFont(assetFetcher: StaticFontAssetFetcher, origin: string, fileName: string) {
  const response = await assetFetcher(new URL(`/fonts/${fileName}`, origin))
  if (!response.ok) {
    throw new Error(`Static font responded ${response.status}`)
  }
  return response.arrayBuffer()
}

async function fetchRemoteFont(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    throw new Error(`Remote font responded ${response.status}`)
  }

  return response.arrayBuffer()
}

export async function loadShareFontBuffersFromAssetFetcher(
  origin: string,
  assetFetcher: StaticFontAssetFetcher,
): Promise<ShareFontBuffers> {
  const [regular, bold, rajdhaniSemiBold, rajdhaniBold] = await Promise.all([
    fetchStaticFont(assetFetcher, origin, LOCAL_FONT_FILES.regular),
    fetchStaticFont(assetFetcher, origin, LOCAL_FONT_FILES.bold),
    fetchStaticFont(assetFetcher, origin, LOCAL_FONT_FILES.rajdhaniSemiBold),
    fetchStaticFont(assetFetcher, origin, LOCAL_FONT_FILES.rajdhaniBold),
  ])

  return { regular, bold, rajdhaniSemiBold, rajdhaniBold }
}

async function loadRemoteFontBuffers(
  origin: string,
  assetFetcher: StaticFontAssetFetcher,
  remoteFontFetcher: RemoteFontFetcher,
): Promise<ShareFontBuffers> {
  const [regular, bold, rajdhaniSemiBold, rajdhaniBold] = await Promise.all([
    remoteFontFetcher(REMOTE_FONT_URLS.regular),
    remoteFontFetcher(REMOTE_FONT_URLS.bold),
    fetchStaticFont(assetFetcher, origin, LOCAL_FONT_FILES.rajdhaniSemiBold),
    fetchStaticFont(assetFetcher, origin, LOCAL_FONT_FILES.rajdhaniBold),
  ])

  return { regular, bold, rajdhaniSemiBold, rajdhaniBold }
}

export async function loadShareFontBuffersWithFetchers(
  origin: string,
  assetFetcher: StaticFontAssetFetcher,
  remoteFontFetcher: RemoteFontFetcher,
): Promise<ShareFontBuffers> {
  try {
    return await loadShareFontBuffersFromAssetFetcher(origin, assetFetcher)
  } catch {
    console.warn('Static share fonts not found, trying remote Noto Sans SC fonts...')
  }

  try {
    return await loadRemoteFontBuffers(origin, assetFetcher, remoteFontFetcher)
  } catch (error) {
    throw new Error(
      `Font loading failed: no static fonts and remote Noto Sans SC fonts are unreachable. Please add ${LOCAL_FONT_FILES.regular}, ${LOCAL_FONT_FILES.bold}, ${LOCAL_FONT_FILES.rajdhaniSemiBold}, and ${LOCAL_FONT_FILES.rajdhaniBold} to public/fonts/. Cause: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
}

async function fetchShareFontBuffers(origin: string) {
  return loadShareFontBuffersWithFetchers(origin, await staticFontAssetFetcher(), fetchRemoteFont)
}

export async function loadShareFontBuffers(origin: string): Promise<ShareFontBuffers> {
  const cacheKey = new URL(origin).origin
  let pending = fontBufferCache.get(cacheKey)
  if (!pending) {
    pending = fetchShareFontBuffers(cacheKey)
    fontBufferCache.set(cacheKey, pending)
  }

  try {
    return await pending
  } catch (error) {
    fontBufferCache.delete(cacheKey)
    throw error
  }
}

export async function loadShareFonts(text: string, origin: string): Promise<ShareFont[]> {
  const normalizedText = Array.from(new Set(`${text}Peak Trekker GPS VERIFIED UPLOADED 总距离时长爬升最高海拔`.split('')))
    .join('')
    .slice(0, 512)
  const cacheKey = `${new URL(origin).origin}:${normalizedText}`

  const cached = fontCache.get(cacheKey)
  if (cached) return cached

  const { regular, bold, rajdhaniSemiBold, rajdhaniBold } = await loadShareFontBuffers(origin)
  const fonts = buildFonts(regular, bold, rajdhaniSemiBold, rajdhaniBold)
  fontCache.set(cacheKey, fonts)
  return fonts
}
