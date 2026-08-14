export type RouteDrawPlanInput = {
  segmentIndex: number
  length: number
}

export type RouteDrawPlanStep = RouteDrawPlanInput & {
  duration: number
  start: number
  end: number
}

// Keeps the fully drawn dash state observable for at least two 60 Hz frames before cleanup.
export const ROUTE_FINAL_DRAW_BARRIER_SECONDS = 0.04

function roundMotionTime(value: number) {
  return Number(value.toFixed(6))
}

export function buildRouteDrawPlan(
  segments: readonly RouteDrawPlanInput[],
  totalDuration: number,
): RouteDrawPlanStep[] {
  const validSegments = segments.filter((segment) => (
    Number.isInteger(segment.segmentIndex)
    && Number.isFinite(segment.length)
    && segment.length > 0
  ))
  const safeDuration = Number.isFinite(totalDuration) && totalDuration > 0 ? totalDuration : 0
  const totalLength = validSegments.reduce((sum, segment) => sum + segment.length, 0)

  if (!validSegments.length || safeDuration === 0 || totalLength === 0) return []

  let start = 0
  return validSegments.map((segment, index) => {
    const duration = index === validSegments.length - 1
      ? roundMotionTime(Math.max(0, safeDuration - start))
      : roundMotionTime((safeDuration * segment.length) / totalLength)
    const end = roundMotionTime(start + duration)
    const step = {
      ...segment,
      duration,
      start: roundMotionTime(start),
      end,
    }
    start = end
    return step
  })
}
