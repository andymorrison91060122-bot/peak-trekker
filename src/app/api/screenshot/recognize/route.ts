import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getScreenshotQuotaState } from '@/lib/screenshot/quota'
import { recognizeThenConsumeScreenshotQuota } from '@/lib/screenshot/recognition-quota'
import { screenshotRecognitionErrorStatus } from '@/lib/screenshot/recognition-status'
import {
  SCREENSHOT_QUOTA_RETRY_MESSAGE,
  SCREENSHOT_RECOGNITION_TEMPORARY_MESSAGE,
  SCREENSHOT_RECOGNITION_RETRY_MESSAGE,
} from '@/lib/screenshot/recognize-error-copy'
import { resolveScreenshotAuthState } from '@/lib/screenshot/recognize-auth-errors'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
const SUPPORTED_SCREENSHOT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const TEMPORARY_RECOGNITION_ERROR_MESSAGE = SCREENSHOT_RECOGNITION_TEMPORARY_MESSAGE
const TEMPORARY_QUOTA_ERROR_MESSAGE = SCREENSHOT_QUOTA_RETRY_MESSAGE

function unauthorizedResponse() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function authUnavailableResponse(error: unknown) {
  console.error('screenshot recognition auth unavailable', { error })
  return NextResponse.json({ error: SCREENSHOT_RECOGNITION_RETRY_MESSAGE }, { status: 503 })
}

async function getScreenshotUser(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const auth = await resolveScreenshotAuthState(() => supabase.auth.getUser())
  if (auth.status === 'authenticated') return { user: auth.user }
  return {
    response: auth.status === 'unavailable'
      ? authUnavailableResponse(auth.error)
      : unauthorizedResponse(),
  }
}

export function recognitionFailureResponse(error: unknown) {
  console.error('screenshot recognition failed', {
    error,
    status: screenshotRecognitionErrorStatus(error),
  })
  return NextResponse.json(
    { error: TEMPORARY_RECOGNITION_ERROR_MESSAGE },
    { status: screenshotRecognitionErrorStatus(error) }
  )
}

function validateScreenshotFile(file: File) {
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return { ok: false as const, status: 413, error: '截图文件不能超过 10MB。' }
  }

  if (!SUPPORTED_SCREENSHOT_TYPES.has(file.type)) {
    return { ok: false as const, status: 415, error: '仅支持 JPG、PNG 或 WebP 截图。' }
  }

  return { ok: true as const }
}

function quotaExhaustedResponse(quota: Awaited<ReturnType<typeof getScreenshotQuotaState>>) {
  return NextResponse.json(
    {
      error: '本月截图识别次数已用完。',
      code: 'screenshot_quota_exhausted',
      quota,
    },
    { status: 402 }
  )
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const auth = await getScreenshotUser(supabase)
  if ('response' in auth) return auth.response
  const { user } = auth

  try {
    const quota = await getScreenshotQuotaState(supabase, user.id)
    return NextResponse.json({ ok: true, quota })
  } catch (error) {
    console.error('screenshot quota state failed', { error })
    return NextResponse.json({ error: TEMPORARY_QUOTA_ERROR_MESSAGE }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const auth = await getScreenshotUser(supabase)
  if ('response' in auth) return auth.response
  const { user } = auth

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
    const { recognition, quotaResult } = await recognizeThenConsumeScreenshotQuota({
      imageBase64,
      mimeType: file.type,
      userId: user.id,
      quota,
      adminClient: createSupabaseAdminClient(),
    })
    const { source: ocrSource, ocrResult, parsedFields, engineMeta } = recognition
    if (!quotaResult.success) {
      if (quotaResult.reason === 'exhausted') {
        return quotaExhaustedResponse(quotaResult.quota)
      }

      console.error('screenshot quota consumption failed', {
        reason: quotaResult.reason,
        error: quotaResult.error,
      })
      return NextResponse.json({ error: TEMPORARY_QUOTA_ERROR_MESSAGE }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      ocrResult,
      parsedFields,
      ocrSource,
      recognitionMeta: engineMeta,
      quota: quotaResult.quota,
    })
  } catch (error) {
    return recognitionFailureResponse(error)
  }
}
