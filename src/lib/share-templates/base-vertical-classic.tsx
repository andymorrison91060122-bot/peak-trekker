import type { ShareTemplateData, ShareTemplateProps } from './types'
import {
  C,
  METRIC_FONT_FAMILY,
  MountainGlyph,
  POSTER_WIDTH,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  SourcePill,
  TrailSvg,
  formatDistance,
  formatPlainNumber,
  formatShareAltitude,
  hasShareAltitude,
  hasShareTrackPoint,
} from './shared'

type VerticalMetric = {
  key: 'distance' | 'duration' | 'altitude' | 'elevationGain'
  label: string
  value: string
  unit: string
  motionFormat?: 'decimal-1' | 'duration' | 'integer'
  motionValue?: number
}

const VERTICAL_CLASSIC_TRAIL_BOUNDS = {
  x: 184,
  y: 808,
  width: 712,
  height: 420,
  padding: 72,
} as const

function durationToSeconds(duration: string) {
  const match = /^(\d+):([0-5]\d)$/.exec(duration.trim())
  if (!match) return undefined
  return Number(match[1]) * 3600 + Number(match[2]) * 60
}

function verticalMetrics(data: ShareTemplateData): VerticalMetric[] {
  const heroMetric: VerticalMetric | null = hasShareAltitude(data)
    ? {
      key: 'altitude',
      label: '最高海拔',
      value: formatShareAltitude(data),
      unit: 'm',
      motionFormat: 'integer',
      motionValue: data.altitude,
    }
    : data.visibleFields.elevationGain
      ? {
      key: 'elevationGain',
      label: '爬升',
      value: formatPlainNumber(data.elevationGain),
      unit: 'm',
      motionFormat: 'integer',
      motionValue: data.elevationGain,
      }
      : null
  const distanceMetric: VerticalMetric = {
    key: 'distance',
    label: '距离',
    value: formatDistance(data.distance),
    unit: 'km',
    motionFormat: 'decimal-1',
    motionValue: data.distance,
  }
  const durationMetric: VerticalMetric | null = data.visibleFields.duration
    ? {
      key: 'duration',
      label: '时长',
      value: data.duration || '--',
      unit: '',
      motionFormat: 'duration',
      motionValue: durationToSeconds(data.duration),
    }
    : null

  return [
    ...(heroMetric ? [heroMetric] : []),
    distanceMetric,
    ...(durationMetric ? [durationMetric] : []),
  ]
}

function VerticalMetricStack({ data }: { data: ShareTemplateData }) {
  const metrics = verticalMetrics(data)

  return (
    <div
      data-motion-phase="data"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
        position: 'absolute',
        left: 0,
        width: POSTER_WIDTH,
        top: 320,
      }}
    >
      {metrics.map((metric) => {
        const isHero = metric.key === 'altitude' || metric.key === 'elevationGain'

        return (
        <div key={metric.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span
            data-role="text"
            data-motion-kind="metric-label"
            style={{
              color: C.fg2,
              fontFamily: 'Noto Sans SC',
              fontSize: 30,
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            {metric.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', fontFamily: METRIC_FONT_FAMILY }}>
            <span
              data-role={metric.motionFormat ? 'num' : 'text'}
              data-motion-kind={metric.key}
              data-val={metric.motionValue}
              data-fmt={metric.motionFormat}
              style={{
                color: isHero ? C.primary : C.fg,
                fontFamily: METRIC_FONT_FAMILY,
                fontSize: isHero ? 92 : 78,
                lineHeight: 0.94,
                fontWeight: 800,
                letterSpacing: '0',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {metric.value}
            </span>
            {metric.unit ? (
              <span
                data-role="text"
                data-motion-kind="metric-unit"
                style={{
                  marginLeft: 8,
                  color: isHero ? C.primary : C.fg,
                  fontFamily: METRIC_FONT_FAMILY,
                  fontSize: isHero ? 38 : 32,
                  lineHeight: 1,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {metric.unit}
              </span>
            ) : null}
          </div>
        </div>
        )
      })}
    </div>
  )
}

export function BaseVerticalClassicTemplate({
  data,
  photoDataUrl,
  brandMarkSrc,
  transparent = false,
}: ShareTemplateProps) {
  return (
    <PosterShell background={transparent ? 'rgba(0, 0, 0, 0)' : C.bgDeep}>
      {transparent ? null : <PhotoLayer photoDataUrl={photoDataUrl} />}
      {transparent ? null : <PhotoShade direction="full" strength={0.7} />}
      <div data-template="base-vertical-classic" style={{ display: 'flex', position: 'absolute', inset: 0 }}>
        <VerticalMetricStack data={data} />

        {hasShareTrackPoint(data.trackPreview) ? (
          <div data-motion-phase="route" style={{ display: 'flex', position: 'absolute', inset: 0 }}>
            <TrailSvg glow={20} lineWidth={12} trackPreview={data.trackPreview} contentBounds={VERTICAL_CLASSIC_TRAIL_BOUNDS} />
          </div>
        ) : null}

        <div
          data-motion-phase="brand"
          style={{
            display: 'flex',
            position: 'absolute',
            left: 0,
            width: POSTER_WIDTH,
            top: 1404,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <MountainGlyph size={48} src={brandMarkSrc} />
            <span data-role="text" data-motion-kind="brand" style={{ color: C.fg, fontSize: 34, lineHeight: 1, fontWeight: 800, letterSpacing: '0.01em' }}>
              Peak Trekker
            </span>
          </div>
          <SourcePill source={data.source} brandMarkSrc={brandMarkSrc} />
        </div>
      </div>
    </PosterShell>
  )
}
