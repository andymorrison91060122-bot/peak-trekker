import { readFile } from 'fs/promises'
import { join } from 'path'

type ShareFont = {
  name: string
  data: ArrayBuffer
  weight: 400 | 500 | 600 | 700 | 800
  style: 'normal'
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

const fontCache = new Map<string, ShareFont[]>()

function toArrayBuffer(buffer: Buffer) {
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}

function buildFonts(regular: ArrayBuffer, bold: ArrayBuffer) {
  return [
    { name: FONT_FAMILY, data: regular, weight: 400, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 500, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 600, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 700, style: 'normal' as const },
    { name: FONT_FAMILY, data: bold, weight: 800, style: 'normal' as const },
  ] satisfies ShareFont[]
}

async function readLocalFont(fileName: string) {
  return toArrayBuffer(await readFile(join(process.cwd(), 'public', 'fonts', fileName)))
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

async function loadLocalFonts() {
  const [regular, bold] = await Promise.all([
    readLocalFont(LOCAL_FONT_FILES.regular),
    readLocalFont(LOCAL_FONT_FILES.bold),
  ])

  return buildFonts(regular, bold)
}

async function loadRemoteFonts() {
  const [regular, bold] = await Promise.all([
    fetchRemoteFont(REMOTE_FONT_URLS.regular),
    fetchRemoteFont(REMOTE_FONT_URLS.bold),
  ])

  return buildFonts(regular, bold)
}

export async function loadShareFonts(text: string): Promise<ShareFont[]> {
  const normalizedText = Array.from(new Set(`${text}Peak Trekker GPS VERIFIED UPLOADED 总距离时长爬升最高海拔`.split('')))
    .join('')
    .slice(0, 512)

  const cached = fontCache.get(normalizedText)
  if (cached) return cached

  try {
    const localFonts = await loadLocalFonts()
    fontCache.set(normalizedText, localFonts)
    return localFonts
  } catch {
    console.warn('Local share fonts not found, trying remote Noto Sans SC fonts...')
  }

  try {
    const remoteFonts = await loadRemoteFonts()
    fontCache.set(normalizedText, remoteFonts)
    return remoteFonts
  } catch (error) {
    throw new Error(
      `Font loading failed: no local fonts and remote Noto Sans SC fonts are unreachable. Please add ${LOCAL_FONT_FILES.regular} and ${LOCAL_FONT_FILES.bold} to public/fonts/. Cause: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
}
