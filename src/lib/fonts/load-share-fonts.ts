type ShareFont = {
  name: string
  data: ArrayBuffer
  weight: 400 | 500 | 600 | 700 | 800
  style: 'normal'
}

export type ShareFontBuffers = {
  regular: ArrayBuffer
  bold: ArrayBuffer
}

const FONT_FAMILY = 'Noto Sans SC'
const LOCAL_FONT_FILES = {
  regular: 'NotoSansSC-Regular.otf',
  bold: 'NotoSansSC-Bold.otf',
}

const REMOTE_FONT_URLS = {
  regular:
    'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  bold: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
}

const fontBufferCache = new Map<string, Promise<ShareFontBuffers>>()
const fontCache = new Map<string, ShareFont[]>()

function buildFonts(regular: ArrayBuffer, bold: ArrayBuffer) {
  return [
    { name: FONT_FAMILY, data: regular, weight: 400, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 500, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 600, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 700, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 800, style: 'normal' as const },
  ] satisfies ShareFont[]
}

async function fetchStaticFont(origin: string, fileName: string) {
  const response = await fetch(new URL(`/fonts/${fileName}`, origin), {
    cache: 'force-cache',
  })
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

async function loadStaticFontBuffers(origin: string): Promise<ShareFontBuffers> {
  const [regular, bold] = await Promise.all([
    fetchStaticFont(origin, LOCAL_FONT_FILES.regular),
    fetchStaticFont(origin, LOCAL_FONT_FILES.bold),
  ])

  return { regular, bold }
}

async function loadRemoteFontBuffers(): Promise<ShareFontBuffers> {
  const [regular, bold] = await Promise.all([
    fetchRemoteFont(REMOTE_FONT_URLS.regular),
    fetchRemoteFont(REMOTE_FONT_URLS.bold),
  ])

  return { regular, bold }
}

async function fetchShareFontBuffers(origin: string) {
  try {
    return await loadStaticFontBuffers(origin)
  } catch {
    console.warn('Static share fonts not found, trying remote Noto Sans SC fonts...')
  }

  try {
    return await loadRemoteFontBuffers()
  } catch (error) {
    throw new Error(
      `Font loading failed: no static fonts and remote Noto Sans SC fonts are unreachable. Please add ${LOCAL_FONT_FILES.regular} and ${LOCAL_FONT_FILES.bold} to public/fonts/. Cause: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
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

  const { regular, bold } = await loadShareFontBuffers(origin)
  const fonts = buildFonts(regular, bold)
  fontCache.set(cacheKey, fonts)
  return fonts
}
