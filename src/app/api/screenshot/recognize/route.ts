import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  completeScreenshotQuotaAttempt,
  getScreenshotQuotaState,
  getScreenshotRecognitionReplay,
  reserveScreenshotQuota,
} from '@/lib/screenshot/quota'
import {
  ScreenshotRecognitionAttemptError,
  getScreenshotRecognitionRecoveryOutcome,
  isValidScreenshotRecognitionRequestId,
  recognizeOrReplayScreenshotQuotaAttempt,
} from '@/lib/screenshot/recognition-quota'
import { recognizeScreenshotText } from '@/lib/screenshot/recognition-service'
import { screenshotRecognitionErrorStatus } from '@/lib/screenshot/recognition-status'
import {
  createScreenshotRecognitionCheckpointTiming,
  type ScreenshotRecognitionCheckpointOutcome,
} from '@/lib/screenshot/recognition-timing'
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
  return NextResponse.json({ error: '登录后才能识别截图。' }, { status: 401 })
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

function recognitionFailureResponse(error: unknown) {
  const providerError = error instanceof ScreenshotRecognitionAttemptError
    ? error.providerError
    : error
  const quotaRefunded = error instanceof ScreenshotRecognitionAttemptError && error.quotaRefunded
  console.error('screenshot recognition failed', {
    error: providerError,
    quotaRefunded,
    status: screenshotRecognitionErrorStatus(providerError),
  })
  return NextResponse.json(
    {
      error: quotaRefunded
        ? TEMPORARY_RECOGNITION_ERROR_MESSAGE
        : SCREENSHOT_RECOGNITION_RETRY_MESSAGE,
    },
    { status: screenshotRecognitionErrorStatus(providerError) }
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

function resolveScreenshotRecognitionRequestId(value: FormDataEntryValue | null) {
  if (value === null) return randomUUID()
  return isValidScreenshotRecognitionRequestId(value) ? value : null
}

function pendingRecognitionResponse() {
  return NextResponse.json(
    {
      ok: false,
      code: 'screenshot_recognition_pending',
      retryable: true,
    },
    {
      status: 202,
      headers: { 'Retry-After': '1' },
    }
  )
}

function unavailableRecognitionResultResponse() {
  return NextResponse.json(
    {
      error: SCREENSHOT_RECOGNITION_RETRY_MESSAGE,
      code: 'screenshot_recognition_result_unavailable',
    },
    { status: 409 }
  )
}

function refundedRecognitionResponse() {
  return NextResponse.json(
    {
      error: SCREENSHOT_RECOGNITION_RETRY_MESSAGE,
      code: 'screenshot_recognition_refunded',
    },
    { status: 409 }
  )
}

function recognitionSuccessResponse(
  recognition: {
    source: 'mimo_v25'
    ocrResult: unknown
    parsedFields: unknown
    engineMeta?: unknown
  },
  quota?: Awaited<ReturnType<typeof getScreenshotQuotaState>>
) {
  return NextResponse.json({
    ok: true,
    ocrResult: recognition.ocrResult,
    parsedFields: recognition.parsedFields,
    ocrSource: recognition.source,
    recognitionMeta: recognition.engineMeta,
    ...(quota ? { quota } : {}),
  })
}

function logRecognitionCheckpoint(
  timing: ReturnType<typeof createScreenshotRecognitionCheckpointTiming>,
  outcome: ScreenshotRecognitionCheckpointOutcome,
  replay: boolean,
) {
  try {
    console.info('screenshot recognition checkpoint', timing.finish(outcome, replay))
  } catch {
    // Timing observability must never alter a recognition response.
  }
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient()
  const auth = await getScreenshotUser(supabase)
  if ('response' in auth) return auth.response
  const { user } = auth
  const requestId = new URL(request.url).searchParams.get('requestId')

  if (requestId !== null) {
    if (!isValidScreenshotRecognitionRequestId(requestId)) {
      return NextResponse.json({ error: '识别请求无效，请重新选择截图。' }, { status: 400 })
    }

    const recovery = getScreenshotRecognitionRecoveryOutcome(
      await getScreenshotRecognitionReplay(supabase, requestId),
    )
    if (recovery.kind === 'replayed') return recognitionSuccessResponse(recovery.recognition)
    if (recovery.kind === 'pending') return pendingRecognitionResponse()
    if (recovery.kind === 'refunded') return refundedRecognitionResponse()
    if (recovery.kind === 'lookup_failed') {
      console.error('screenshot recognition recovery lookup failed', { requestId })
      return NextResponse.json({ error: SCREENSHOT_RECOGNITION_RETRY_MESSAGE }, { status: 500 })
    }
    return unavailableRecognitionResultResponse()
  }

  try {
    const quota = await getScreenshotQuotaState(supabase, user.id)
    return NextResponse.json({ ok: true, quota })
  } catch (error) {
    console.error('screenshot quota state failed', { error })
    return NextResponse.json({ error: TEMPORARY_QUOTA_ERROR_MESSAGE }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now()
  const supabase = await createSupabaseServerClient()
  const auth = await getScreenshotUser(supabase)
  if ('response' in auth) return auth.response
  const { user } = auth

  const formData = await request.formData().catch(() => null)
  const requestId = resolveScreenshotRecognitionRequestId(
    formData ? formData.get('requestId') : null,
  )
  if (!requestId) {
    return NextResponse.json({ error: '识别请求无效，请重新选择截图。' }, { status: 400 })
  }
  const file = formData?.get('image')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少截图文件。' }, { status: 400 })
  }

  const validation = validateScreenshotFile(file)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const timing = createScreenshotRecognitionCheckpointTiming(
    requestId,
    () => performance.now(),
    requestStartedAt,
  )

  try {
    const quota = await getScreenshotQuotaState(supabase, user.id)
    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const result = await recognizeOrReplayScreenshotQuotaAttempt({
      imageBase64,
      mimeType: file.type,
      userId: user.id,
      quota,
      requestId,
      adminClient: createSupabaseAdminClient(),
      replayClient: supabase,
      findAttempt: async (_userId, nextRequestId) => getScreenshotRecognitionReplay(supabase, nextRequestId),
      reserve: (...args) => timing.measureReserve(() => reserveScreenshotQuota(...args)),
      recognize: (...args) => timing.measureProvider(() => recognizeScreenshotText(...args)),
      finalize: (...args) => timing.measureFinalize(() => completeScreenshotQuotaAttempt(...args)),
    })

    if (result.kind === 'replayed') {
      logRecognitionCheckpoint(timing, 'completed', true)
      return recognitionSuccessResponse(result.recognition, quota)
    }

    if (result.kind === 'pending') {
      logRecognitionCheckpoint(timing, 'pending', true)
      return pendingRecognitionResponse()
    }
    if (result.kind === 'result_unavailable') {
      logRecognitionCheckpoint(timing, 'result_unavailable', true)
      return unavailableRecognitionResultResponse()
    }
    if (result.kind === 'refunded') {
      logRecognitionCheckpoint(timing, 'refunded', true)
      return refundedRecognitionResponse()
    }
    if (result.kind === 'lookup_failed') {
      logRecognitionCheckpoint(timing, 'lookup_failed', true)
      console.error('screenshot recognition replay lookup failed', { requestId })
      return NextResponse.json({ error: SCREENSHOT_RECOGNITION_RETRY_MESSAGE }, { status: 500 })
    }

    if (result.kind === 'reserve_failed') {
      const { reserveResult } = result
      if (reserveResult.reason === 'exhausted') {
        logRecognitionCheckpoint(timing, 'quota_exhausted', false)
        return quotaExhaustedResponse(reserveResult.quota)
      }

      logRecognitionCheckpoint(timing, 'reserve_failed', false)
      console.error('screenshot quota consumption failed', {
        reason: reserveResult.reason,
        error: reserveResult.error,
      })
      return NextResponse.json({ error: TEMPORARY_QUOTA_ERROR_MESSAGE }, { status: 500 })
    }

    if (result.kind !== 'completed') {
      logRecognitionCheckpoint(timing, 'failed', false)
      return NextResponse.json({ error: SCREENSHOT_RECOGNITION_RETRY_MESSAGE }, { status: 500 })
    }

    const { reserveResult, recognition, finalizeResult } = result
    if (!finalizeResult.success) {
      console.error('screenshot quota completion failed', {
        reason: finalizeResult.reason,
        error: finalizeResult.error,
      })
    }

    logRecognitionCheckpoint(
      timing,
      finalizeResult.success ? 'completed' : 'completed_finalize_pending',
      false,
    )
    return recognitionSuccessResponse(recognition, finalizeResult.success ? finalizeResult.quota : reserveResult.quota)
  } catch (error) {
    logRecognitionCheckpoint(
      timing,
      error instanceof ScreenshotRecognitionAttemptError && error.quotaRefunded
        ? 'provider_failed_refunded'
        : error instanceof ScreenshotRecognitionAttemptError
          ? 'provider_failed_unrefunded'
          : 'failed',
      false,
    )
    return recognitionFailureResponse(error)
  }
}
