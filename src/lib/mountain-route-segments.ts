export type RouteSegment = {
  altitude: number
  title: string
  description: string
}

export const MOUNTAIN_ROUTE_SEGMENTS: Record<string, RouteSegment[]> = {
  玉珠峰: [
    {
      altitude: 4280,
      title: '大本营 → C1',
      description: '碎石坡，约 3 小时',
    },
    {
      altitude: 5100,
      title: 'C1 → 冰雪过渡',
      description: '需结组，注意落石',
    },
    {
      altitude: 5800,
      title: '过渡带 → 顶峰',
      description: '裂缝多，结组前行',
    },
  ],
}

export function getRouteSegments(mountainId: string): RouteSegment[] | null {
  return MOUNTAIN_ROUTE_SEGMENTS[mountainId] ?? null
}
