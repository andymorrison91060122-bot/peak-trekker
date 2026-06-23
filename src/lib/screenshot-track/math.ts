export type BboxPoint = {
  x: number
  y: number
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function normalizeBboxPoints(points: readonly BboxPoint[], minExtent: number): BboxPoint[] {
  if (points.length === 0) return []
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const width = Math.max(maxX - minX, minExtent)
  const height = Math.max(maxY - minY, minExtent)
  const range = Math.max(width, height)
  const offsetX = (range - width) / 2
  const offsetY = (range - height) / 2

  return points.map((point) => ({
    x: (point.x - minX + offsetX) / range,
    y: (point.y - minY + offsetY) / range,
  }))
}
