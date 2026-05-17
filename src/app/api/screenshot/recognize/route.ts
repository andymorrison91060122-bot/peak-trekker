import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { parseFieldsFromOcr } from '@/lib/screenshot/field-parser'
import { consumeScreenshotQuota, getScreenshotQuotaState } from '@/lib/screenshot/quota'
import { recognizeScreenshotWithFallback } from '@/lib/screenshot/tencent-ocr-adapter'
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

function quotaExhaustedResponse(quota: Awaited<ReturnType<typeof getScreenshotQuotaState>>) {
  return NextResponse.json(
    {
      error: '本月截图识别次数已用完。',
      code: 'screenshot_quota_exhausted',
      quota,
      upgradeHint: {
        title: '升级后继续识别',
        body: '免费识别次数用完后，可升级获得更多截图识别额度。',
        cta: '了解付费方案',
      },
    },
    { status: 402 }
  )
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const quota = await getScreenshotQuotaState(supabase, user.id)
    return NextResponse.json({ ok: true, quota })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '识别额度暂时不可用。' },
      { status: 500 }
    )
  }
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
    const quota = await getScreenshotQuotaState(supabase, user.id)
    if (quota.remaining <= 0) {
      return quotaExhaustedResponse(quota)
    }

    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const { source: ocrSource, ocrResult } = await recognizeScreenshotWithFallback(imageBase64)
    const quotaResult = await consumeScreenshotQuota(createSupabaseAdminClient(), user.id, quota)
    if (!quotaResult.success) {
      if (quotaResult.reason === 'exhausted') {
        return quotaExhaustedResponse(quotaResult.quota)
      }

      return NextResponse.json(
        { error: quotaResult.error ?? '识别额度扣减失败，请稍后重试。' },
        { status: 500 }
      )
    }

    const parsedFields = parseFieldsFromOcr(ocrResult.textBlocks)

    return NextResponse.json({
      ok: true,
      ocrResult,
      parsedFields,
      ocrSource,
      quota: quotaResult.quota,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '截图识别失败，请稍后重试。' },
      { status: ocrStatus(error) }
    )
  }
}
