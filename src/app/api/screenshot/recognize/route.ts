import { NextResponse } from 'next/server'
import { parseFieldsFromOcr } from '@/lib/screenshot/field-parser'
import { recognizeScreenshot } from '@/lib/screenshot/tencent-ocr-adapter'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
const SUPPORTED_SCREENSHOT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function validateScreenshotFile(file: File) {
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return { ok: false as const, status: 413, error: '截图文件不能超过 10MB。' }
  }

  if (!SUPPORTED_SCREENSHOT_TYPES.has(file.type)) {
    return { ok: false as const, status: 415, error: '仅支持 JPG、PNG 或 WebP 截图。' }
  }

  return { ok: true as const }
}

function ocrStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/not configured/i.test(message)) return 500
  if (/limit|quota|rate/i.test(message)) return 429
  return 502
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('image')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少截图文件。' }, { status: 400 })
  }

  const validation = validateScreenshotFile(file)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  try {
    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const ocrResult = await recognizeScreenshot(imageBase64)
    const parsedFields = parseFieldsFromOcr(ocrResult.textBlocks)

    return NextResponse.json({
      ok: true,
      ocrResult,
      parsedFields,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '截图识别失败，请稍后重试。' },
      { status: ocrStatus(error) }
    )
  }
}
