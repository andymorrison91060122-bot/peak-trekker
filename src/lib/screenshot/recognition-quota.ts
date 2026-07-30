import type { SupabaseClient } from '@supabase/supabase-js'
import {
  completeScreenshotQuotaAttempt,
  refundScreenshotQuotaAttempt,
  reserveScreenshotQuota,
} from './quota.ts'
import { recognizeScreenshotText } from './recognition-service.ts'
import type { ScreenshotQuotaState } from './types.ts'

type RecognitionResult = Awaited<ReturnType<typeof recognizeScreenshotText>>
type ReserveResult = Awaited<ReturnType<typeof reserveScreenshotQuota>>
type FinalizeResult = Awaited<ReturnType<typeof completeScreenshotQuotaAttempt>>

function finalizeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Screenshot quota finalization failed'
  const message = error.message.trim()
  return message ? message.slice(0, 500) : 'Screenshot quota finalization failed'
}

export class ScreenshotRecognitionAttemptError extends Error {
  readonly providerError: unknown
  readonly quotaRefunded: boolean

  constructor(providerError: unknown, quotaRefunded: boolean) {
    super(providerError instanceof Error ? providerError.message : 'Screenshot recognition failed')
    this.name = 'ScreenshotRecognitionAttemptError'
    this.providerError = providerError
    this.quotaRefunded = quotaRefunded
  }
}

export async function recognizeWithReservedScreenshotQuota({
  imageBase64,
  mimeType,
  userId,
  quota,
  requestId,
  adminClient,
  recognize = recognizeScreenshotText,
  reserve = reserveScreenshotQuota,
  finalize = completeScreenshotQuotaAttempt,
  refund = refundScreenshotQuotaAttempt,
}: {
  imageBase64: string
  mimeType: string
  userId: string
  quota: ScreenshotQuotaState
  requestId: string
  adminClient: SupabaseClient
  recognize?: typeof recognizeScreenshotText
  reserve?: typeof reserveScreenshotQuota
  finalize?: typeof completeScreenshotQuotaAttempt
  refund?: typeof refundScreenshotQuotaAttempt
}): Promise<
  | { reserveResult: Extract<ReserveResult, { success: false }> }
  | {
      reserveResult: Extract<ReserveResult, { success: true }>
      recognition: RecognitionResult
      finalizeResult: FinalizeResult
    }
> {
  const reserveResult = await reserve(adminClient, userId, quota, requestId)
  if (!reserveResult.success) return { reserveResult }

  let recognition: RecognitionResult
  try {
    recognition = await recognize(imageBase64, mimeType)
  } catch (error) {
    try {
      const refundResult = await refund(adminClient, userId, requestId, reserveResult.quota)
      if (refundResult.success) {
        throw new ScreenshotRecognitionAttemptError(error, true)
      }
      console.error('screenshot quota refund failed', {
        requestId,
        reason: refundResult.reason,
        error: refundResult.error,
      })
    } catch (refundError) {
      if (refundError instanceof ScreenshotRecognitionAttemptError) throw refundError
      console.error('screenshot quota refund failed', {
        requestId,
        error: refundError,
      })
    }
    throw new ScreenshotRecognitionAttemptError(error, false)
  }

  const finalizeResult = await finalize(adminClient, userId, requestId, reserveResult.quota).catch((error: unknown): FinalizeResult => (
    {
      success: false,
      requestId,
      reason: 'rpc_error',
      quota: reserveResult.quota,
      error: finalizeErrorMessage(error),
    }
  ))

  return { reserveResult, recognition, finalizeResult }
}
