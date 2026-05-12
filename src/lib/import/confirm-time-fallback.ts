import type { ImportedTrackData } from './types.ts'

type ImportTimeFields = Pick<ImportedTrackData, 'startTime' | 'endTime' | 'durationSeconds'>

export function getSupplementalTimeFallback(computed: ImportTimeFields, parsedData: ImportTimeFields) {
  if (computed.startTime || computed.endTime || typeof computed.durationSeconds === 'number') return null
  if (!parsedData.startTime || !parsedData.endTime || typeof parsedData.durationSeconds !== 'number') return null

  const startMs = Date.parse(parsedData.startTime)
  const endMs = Date.parse(parsedData.endTime)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null

  const computedDurationSeconds = Math.round((endMs - startMs) / 1000)
  if (Math.abs(computedDurationSeconds - parsedData.durationSeconds) > 60) return null

  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    durationSeconds: computedDurationSeconds,
  }
}
