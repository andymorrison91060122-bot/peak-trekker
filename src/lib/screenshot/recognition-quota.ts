import type { SupabaseClient } from '@supabase/supabase-js'
import {
  completeScreenshotRecognitionAttempt,
  getScreenshotRecognitionReplay,
  releaseScreenshotRecognitionLease,
  reserveScreenshotRecognitionLease,
  type ScreenshotRecognitionReplay,
} from './quota.ts'
import { recognizeScreenshotText } from './recognition-service.ts'
import type { ScreenshotQuotaState } from './types.ts'

type RecognitionResult = Awaited<ReturnType<typeof recognizeScreenshotText>>
type ReserveResult = Awaited<ReturnType<typeof reserveScreenshotRecognitionLease>>
type FinalizeResult = Awaited<ReturnType<typeof completeScreenshotRecognitionAttempt>>

const SCREENSHOT_RECOGNITION_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SCREENSHOT_RECOGNITION_RESULT_MAX_BYTES = 65536

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

export function isValidScreenshotRecognitionRequestId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length === 36
    && SCREENSHOT_RECOGNITION_REQUEST_ID_PATTERN.test(value)
}

type StoredRecognitionResult = {
  ocrSource: RecognitionResult['source']
  ocrResult: RecognitionResult['ocrResult']
  parsedFields: RecognitionResult['parsedFields']
  recognitionMeta?: RecognitionResult['engineMeta']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStoredOcrResult(value: unknown): value is RecognitionResult['ocrResult'] {
  return isRecord(value)
    && typeof value.rawText === 'string'
    && Array.isArray(value.textBlocks)
    && value.textBlocks.every((block) => isRecord(block)
      && typeof block.text === 'string'
      && typeof block.confidence === 'number'
      && typeof block.x === 'number'
      && typeof block.y === 'number'
      && typeof block.width === 'number'
      && typeof block.height === 'number')
}

function isStoredParsedFields(value: unknown): value is RecognitionResult['parsedFields'] {
  return isRecord(value) && Object.values(value).every((field) => isRecord(field)
    && typeof field.raw === 'string'
    && (typeof field.value === 'string' || typeof field.value === 'number'))
}

function serializeRecognitionResult(recognition: RecognitionResult): StoredRecognitionResult {
  const stored: StoredRecognitionResult = {
    ocrSource: recognition.source,
    ocrResult: recognition.ocrResult,
    parsedFields: recognition.parsedFields,
    ...(recognition.engineMeta ? { recognitionMeta: recognition.engineMeta } : {}),
  }
  const serialized = JSON.stringify(stored)
  if (!serialized || new TextEncoder().encode(serialized).byteLength > SCREENSHOT_RECOGNITION_RESULT_MAX_BYTES) {
    throw new Error('Screenshot recognition result exceeds the replay limit')
  }
  return JSON.parse(serialized) as StoredRecognitionResult
}

function parseStoredRecognitionResult(value: unknown): RecognitionResult | null {
  if (!isRecord(value)
    || value.ocrSource !== 'mimo_v25'
    || !isStoredOcrResult(value.ocrResult)
    || !isStoredParsedFields(value.parsedFields)
    || (value.recognitionMeta !== undefined && !isRecord(value.recognitionMeta))) {
    return null
  }

  const serialized = JSON.stringify(value)
  if (!serialized || new TextEncoder().encode(serialized).byteLength > SCREENSHOT_RECOGNITION_RESULT_MAX_BYTES) {
    return null
  }

  return {
    source: 'mimo_v25',
    ocrResult: value.ocrResult,
    parsedFields: value.parsedFields,
    ...(value.recognitionMeta ? { engineMeta: value.recognitionMeta as RecognitionResult['engineMeta'] } : {}),
  }
}

type AttemptLookup = ScreenshotRecognitionReplay

export function getScreenshotRecognitionRecoveryOutcome(replay: AttemptLookup):
  | { kind: 'missing' }
  | { kind: 'pending' }
  | { kind: 'replayed'; recognition: RecognitionResult }
  | { kind: 'refunded' }
  | { kind: 'result_unavailable' }
  | { kind: 'lookup_failed' } {
  if (!replay.success) return { kind: 'lookup_failed' }
  if (replay.kind === 'missing') return { kind: 'missing' }
  if (replay.kind === 'pending') return { kind: 'pending' }
  if (replay.kind === 'refunded') return { kind: 'refunded' }
  if (replay.kind === 'result_unavailable') return { kind: 'result_unavailable' }
  const recognition = parseStoredRecognitionResult(replay.recognition)
  return recognition ? { kind: 'replayed', recognition } : { kind: 'result_unavailable' }
}

export async function recognizeWithReservedScreenshotQuota({
  imageBase64,
  mimeType,
  userId,
  quota,
  requestId,
  adminClient,
  recognize = recognizeScreenshotText,
  reserve = reserveScreenshotRecognitionLease,
  finalize = completeScreenshotRecognitionAttempt,
  release = releaseScreenshotRecognitionLease,
}: {
  imageBase64: string
  mimeType: string
  userId: string
  quota: ScreenshotQuotaState
  requestId: string
  adminClient: SupabaseClient
  recognize?: typeof recognizeScreenshotText
  reserve?: typeof reserveScreenshotRecognitionLease
  finalize?: typeof completeScreenshotRecognitionAttempt
  release?: typeof releaseScreenshotRecognitionLease
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
  let storedRecognition: StoredRecognitionResult
  try {
    recognition = await recognize(imageBase64, mimeType)
    storedRecognition = serializeRecognitionResult(recognition)
  } catch (error) {
    try {
      const releaseResult = await release(adminClient, userId, requestId)
      if (releaseResult.success) {
        throw new ScreenshotRecognitionAttemptError(error, true)
      }
      console.error('screenshot quota refund failed', {
        requestId,
        reason: 'lease_release_failed',
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

  const finalizeResult = await finalize(adminClient, userId, requestId, reserveResult.quota, storedRecognition).catch((error: unknown): FinalizeResult => (
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

export async function recognizeOrReplayScreenshotQuotaAttempt({
  imageBase64,
  mimeType,
  userId,
  quota,
  requestId,
  adminClient,
  replayClient,
  findAttempt = async (_userId, nextRequestId) => replayClient
    ? getScreenshotRecognitionReplay(replayClient, nextRequestId)
    : { success: true, kind: 'missing' },
  recognize = recognizeScreenshotText,
  reserve = reserveScreenshotRecognitionLease,
  finalize = completeScreenshotRecognitionAttempt,
  release = releaseScreenshotRecognitionLease,
}: {
  imageBase64: string
  mimeType: string
  userId: string
  quota: ScreenshotQuotaState
  requestId: string
  adminClient: SupabaseClient
  replayClient?: SupabaseClient
  findAttempt?: (userId: string, requestId: string) => Promise<AttemptLookup>
  recognize?: typeof recognizeScreenshotText
  reserve?: typeof reserveScreenshotRecognitionLease
  finalize?: typeof completeScreenshotRecognitionAttempt
  release?: typeof releaseScreenshotRecognitionLease
}): Promise<
  | { kind: 'completed'; reserveResult: Extract<ReserveResult, { success: true }>; recognition: RecognitionResult; finalizeResult: FinalizeResult }
  | { kind: 'replayed'; recognition: RecognitionResult }
  | { kind: 'pending' | 'refunded' | 'result_unavailable' | 'lookup_failed' }
  | { kind: 'reserve_failed'; reserveResult: Extract<ReserveResult, { success: false }> }
> {
  const existing = getScreenshotRecognitionRecoveryOutcome(await findAttempt(userId, requestId))
  if (existing.kind !== 'missing') return existing

  const result = await recognizeWithReservedScreenshotQuota({
    imageBase64,
    mimeType,
    userId,
    quota,
    requestId,
    adminClient,
    recognize,
    reserve,
    finalize,
    release,
  })

  if (!('recognition' in result)) {
    if (result.reserveResult.reason !== 'existing') {
      return { kind: 'reserve_failed', reserveResult: result.reserveResult }
    }

    const duplicate = getScreenshotRecognitionRecoveryOutcome(await findAttempt(userId, requestId))
    if (duplicate.kind === 'missing') return { kind: 'lookup_failed' }
    return duplicate
  }

  return {
    kind: 'completed',
    reserveResult: result.reserveResult,
    recognition: result.recognition,
    finalizeResult: result.finalizeResult,
  }
}
