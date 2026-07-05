export type MotionCountFormat = 'integer' | 'decimal' | 'duration'

const commaIntegerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatMotionInteger(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return String(Math.round(value))
}

function getDecimalPlaces(value: string) {
  const match = value.match(/\d+\.(\d+)/)
  return match?.[1]?.length ?? 0
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m`
}

export function formatMotionCountValue(value: number, format: string | undefined, finalText: string) {
  if (format === 'integer') {
    const rounded = Math.round(value)
    return finalText.includes(',') ? commaIntegerFormatter.format(rounded) : formatMotionInteger(rounded)
  }
  if (format === 'decimal') return value.toFixed(getDecimalPlaces(finalText))
  if (format === 'duration') return formatDuration(value)
  return finalText
}

export function parseMotionTokenSeconds(root: HTMLElement, tokenName: string, fallbackMs: number) {
  const raw = window.getComputedStyle(root).getPropertyValue(tokenName).trim()
  if (!raw) return fallbackMs / 1000
  if (raw.endsWith('ms')) {
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value / 1000 : fallbackMs / 1000
  }
  if (raw.endsWith('s')) {
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : fallbackMs / 1000
  }
  return fallbackMs / 1000
}
