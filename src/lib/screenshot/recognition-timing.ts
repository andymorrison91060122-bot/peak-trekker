export type ScreenshotRecognitionCheckpointOutcome =
  | 'completed'
  | 'completed_finalize_pending'
  | 'pending'
  | 'refunded'
  | 'result_unavailable'
  | 'lookup_failed'
  | 'quota_exhausted'
  | 'reserve_failed'
  | 'provider_failed_refunded'
  | 'provider_failed_unrefunded'
  | 'failed'

export type ScreenshotRecognitionCheckpoint = {
  requestId: string
  phase: 'recognition'
  reserve_ms?: number
  provider_ms?: number
  finalize_ms?: number
  total_ms: number
  outcome: ScreenshotRecognitionCheckpointOutcome
  replay: boolean
}

const MAX_RECORDED_DURATION_MS = 120_000

function boundedMilliseconds(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_RECORDED_DURATION_MS, Math.max(0, Math.round(value)))
}

function mimoLatencyMs(engineMeta: unknown) {
  if (typeof engineMeta !== 'object' || engineMeta === null || Array.isArray(engineMeta)) return null
  const mimo = (engineMeta as { mimo?: unknown }).mimo
  if (typeof mimo !== 'object' || mimo === null || Array.isArray(mimo)) return null
  const latencyMs = (mimo as { latencyMs?: unknown }).latencyMs
  return typeof latencyMs === 'number' && Number.isFinite(latencyMs) && latencyMs >= 0
    ? boundedMilliseconds(latencyMs)
    : null
}

export function createScreenshotRecognitionCheckpointTiming(
  requestId: string,
  now: () => number = () => performance.now(),
  startedAt = now(),
) {
  let reserveMs: number | undefined
  let providerMs: number | undefined
  let finalizeMs: number | undefined

  const elapsedSince = (started: number) => boundedMilliseconds(now() - started)

  return {
    async measureReserve<T>(operation: () => Promise<T>) {
      const started = now()
      try {
        return await operation()
      } finally {
        reserveMs = elapsedSince(started)
      }
    },
    async measureProvider<T extends { engineMeta?: unknown }>(operation: () => Promise<T>) {
      const started = now()
      try {
        const result = await operation()
        providerMs = mimoLatencyMs(result.engineMeta) ?? elapsedSince(started)
        return result
      } catch (error) {
        providerMs = elapsedSince(started)
        throw error
      }
    },
    measureProviderResult(engineMeta: unknown, measuredMs: number) {
      providerMs = mimoLatencyMs(engineMeta) ?? boundedMilliseconds(measuredMs)
    },
    async measureFinalize<T>(operation: () => Promise<T>) {
      const started = now()
      try {
        return await operation()
      } finally {
        finalizeMs = elapsedSince(started)
      }
    },
    finish(outcome: ScreenshotRecognitionCheckpointOutcome, replay: boolean): ScreenshotRecognitionCheckpoint {
      return {
        requestId,
        phase: 'recognition',
        ...(reserveMs === undefined ? {} : { reserve_ms: reserveMs }),
        ...(providerMs === undefined ? {} : { provider_ms: providerMs }),
        ...(finalizeMs === undefined ? {} : { finalize_ms: finalizeMs }),
        total_ms: elapsedSince(startedAt),
        outcome,
        replay,
      }
    },
  }
}
