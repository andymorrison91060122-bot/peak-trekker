import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  TopoSvg,
  formatDistance,
  formatPlainNumber,
} from './shared'

export function PremiumPhotoOverlayTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainName = data.visibleFields.mountainName ? data.mountainName : ''
  const location = data.visibleFields.location ? data.location : ''

  return (
    <PosterShell background="#0f1113">
      <PhotoLayer photoDataUrl={photoDataUrl} />
      {!photoDataUrl ? <TopoSvg opacity={0.22} /> : null}
      <PhotoShade direction="left" strength={0.86} />
      <PhotoShade direction="bottom" strength={0.42} />

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 70, top: 250, width: 435 }}>
        {mountainName ? (
          <span style={{ color: C.fg, fontSize: 38, lineHeight: 1.2, fontWeight: 800 }}>
            {mountainName}
          </span>
        ) : null}
        {location ? (
          <span style={{ color: C.fg2, fontSize: 28, lineHeight: 1.15, fontWeight: 800, marginTop: 30 }}>
            {location}
          </span>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 44 }}>
          <span style={{ color: C.success, fontSize: 138, lineHeight: 0.92, fontWeight: 800 }}>
            {formatPlainNumber(data.altitude)}
          </span>
          <span style={{ color: C.success, fontSize: 46, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 42, marginTop: 74 }}>
          <OverlayMetric label="总距离" value={formatDistance(data.distance)} unit="km" />
          {data.visibleFields.duration ? <OverlayMetric label="时长" value={data.duration || '--'} /> : null}
          {data.visibleFields.elevationGain ? <OverlayMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" /> : null}
        </div>
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}

function OverlayMetric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ color: C.fg2, fontSize: 24, lineHeight: 1, fontWeight: 800, letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
        <span style={{ color: C.fg, fontSize: 58, lineHeight: 1, fontWeight: 800 }}>{value}</span>
        {unit ? <span style={{ color: C.fg2, fontSize: 26, lineHeight: 1, fontWeight: 800, marginLeft: 8 }}>{unit}</span> : null}
      </div>
    </div>
  )
}
