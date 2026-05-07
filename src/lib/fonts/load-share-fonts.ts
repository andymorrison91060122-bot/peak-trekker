import { readFile } from 'fs/promises'
import { join } from 'path'

type ShareFont = {
  name: string
  data: ArrayBuffer
  weight: 400 | 500 | 600 | 700 | 800
  style: 'normal'
}

const FONT_FAMILY = 'Noto Sans SC'
const LOCAL_FONT_CANDIDATES = {
  regular: [
    'public/fonts/NotoSansSC-Regular.ttf',
    'public/fonts/NotoSansSC-Regular.otf',
    'public/fonts/NotoSansSC-Regular.woff2',
  ],
  bold: [
    'public/fonts/NotoSansSC-Bold.ttf',
    'public/fonts/NotoSansSC-Bold.otf',
    'public/fonts/NotoSansSC-Bold.woff2',
  ],
}

const fontCache = new Map<string, ShareFont[]>()

function toArrayBuffer(buffer: Buffer) {
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}

async function readFirstExisting(paths: string[]) {
  for (const relativePath of paths) {
    try {
      return toArrayBuffer(await readFile(relativePath.startsWith('/') ? relativePath : join(process.cwd(), relativePath)))
    } catch {
      // Try the next local candidate.
    }
  }
  return null
}

async function fetchRemoteFont() {
  const urls = [
    'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
    'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
  ]

  let lastError: unknown = null
  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          signal: AbortSignal.timeout(60_000),
        })
        if (response.ok) return response.arrayBuffer()
        lastError = new Error(`Remote font responded ${response.status}`)
      } catch (error) {
        lastError = error
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to load remote share font')
}

async function loadRemoteCjkFonts() {
  const data = await fetchRemoteFont()

  return ([400, 500, 600, 700, 800] as const).map((weight) => ({
    name: FONT_FAMILY,
    data,
    weight,
    style: 'normal' as const,
  }))
}

export async function loadShareFonts(text: string): Promise<ShareFont[]> {
  const normalizedText = Array.from(new Set(`${text}Peak Trekker GPS VERIFIED UPLOADED 总距离时长爬升峰顶海拔`.split('')))
    .join('')
    .slice(0, 512)

  const cached = fontCache.get(normalizedText)
  if (cached) return cached

  const [localRegular, localBold] = await Promise.all([
    readFirstExisting(LOCAL_FONT_CANDIDATES.regular),
    readFirstExisting(LOCAL_FONT_CANDIDATES.bold),
  ])

  if (localRegular && localBold) {
    const localFonts: ShareFont[] = [
      { name: FONT_FAMILY, data: localRegular, weight: 400, style: 'normal' },
      { name: FONT_FAMILY, data: localBold, weight: 700, style: 'normal' },
      { name: FONT_FAMILY, data: localBold, weight: 800, style: 'normal' },
    ]
    fontCache.set(normalizedText, localFonts)
    return localFonts
  }

  const remoteFonts = await loadRemoteCjkFonts()
  fontCache.set(normalizedText, remoteFonts)
  return remoteFonts
}
