export function formatElapsedHMS(totalSeconds: number) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
