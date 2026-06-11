export type SimplifyPoint = {
  x: number
  y: number
}

export type SimplifyDistanceMode = 'line' | 'segment'

export type SimplifyPolylineOptions<TPoint> = {
  epsilon: number
  project: (point: TPoint) => SimplifyPoint
  distanceMode?: SimplifyDistanceMode
  degenerateEpsilon?: number
}

const DEFAULT_DISTANCE_MODE: SimplifyDistanceMode = 'segment'

function distanceToLine(
  point: SimplifyPoint,
  start: SimplifyPoint,
  end: SimplifyPoint,
  degenerateEpsilon: number,
) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const denominator = Math.hypot(dx, dy)
  if (denominator <= degenerateEpsilon) return Math.hypot(point.x - start.x, point.y - start.y)
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / denominator
}

function distanceToSegment(point: SimplifyPoint, start: SimplifyPoint, end: SimplifyPoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t))
}

function distanceToBaseline(
  point: SimplifyPoint,
  start: SimplifyPoint,
  end: SimplifyPoint,
  mode: SimplifyDistanceMode,
  degenerateEpsilon: number,
) {
  return mode === 'line' ? distanceToLine(point, start, end, degenerateEpsilon) : distanceToSegment(point, start, end)
}

export function simplifyPolyline<TPoint>(
  points: TPoint[],
  {
    epsilon,
    project,
    distanceMode = DEFAULT_DISTANCE_MODE,
    degenerateEpsilon = 0,
  }: SimplifyPolylineOptions<TPoint>,
): TPoint[] {
  if (points.length <= 2) return points

  let maxDistance = -1
  let splitIndex = -1
  const start = project(points[0]!)
  const end = project(points.at(-1)!)

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToBaseline(project(points[index]!), start, end, distanceMode, degenerateEpsilon)
    if (distance > maxDistance) {
      maxDistance = distance
      splitIndex = index
    }
  }

  if (maxDistance > epsilon && splitIndex > 0) {
    const before = simplifyPolyline(points.slice(0, splitIndex + 1), { epsilon, project, distanceMode, degenerateEpsilon })
    const after = simplifyPolyline(points.slice(splitIndex), { epsilon, project, distanceMode, degenerateEpsilon })
    return [...before.slice(0, -1), ...after]
  }

  return [points[0]!, points.at(-1)!]
}
