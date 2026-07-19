import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  SHARE_TEMPLATE_PALETTE,
  TopoSvg,
  formatDistance,
  formatPlainNumber,
  formatShareAltitude,
  hasShareAltitude,
} from './shared'

export function PremiumPhotoOverlayTemplate({ data, photoDataUrl, brandMarkSrc }: ShareTemplateProps) {
  const mountainName = data.visibleFields.mountainName ? data.mountainName : ''
  const location = data.visibleFields.location ? data.location : ''
  const showAltitude = hasShareAltitude(data)

  return (
    <PosterShell background={SHARE_TEMPLATE_PALETTE.bgPrimary}>
      <PhotoLayer photoDataUrl={photoDataUrl} />
      {!photoDataUrl ? <TopoSvg opacity={0.22} /> : null}
      <PhotoShade direction="left" strength={0.86} />
      <PhotoShade direction="bottom" strength={0.42} />

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 70, top: 250, width: 435 }}>
        {mountainName ? (
          <span data-role="text" data-motion-kind="mountain" data-motion-order="18" style={{ color: C.fg, fontSize: 38, lineHeight: 1.2, fontWeight: 800 }}>
            {mountainName}
          </span>
        ) : null}
        {location ? (
          <span data-role="text" data-motion-kind="location" data-motion-order="22" style={{ color: C.fg2, fontSize: 28, lineHeight: 1.15, fontWeight: 800, marginTop: 30 }}>
            {location}
          </span>
        ) : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 44 }}>
          <span
            data-role="num"
            data-motion-kind="altitude-value"
            data-val={data.altitude}
            data-fmt="comma"
            style={{ color: C.success, fontSize: 138, lineHeight: 0.92, fontWeight: 800 }}
          >
            {formatShareAltitude(data)}
          </span>
          <span data-role="text" data-motion-kind="altitude-unit" data-motion-order="36" style={{ color: C.success, fontSize: 46, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 42, marginTop: showAltitude ? 74 : 54 }}>
          <OverlayMetric label="总距离" value={formatDistance(data.distance)} unit="km" motionValue={data.distance} motionFormat="dec1" />
          {data.visibleFields.duration ? <OverlayMetric label="时长" value={data.duration || '--'} /> : null}
          {data.visibleFields.elevationGain ? <OverlayMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" motionValue={data.elevationGain} motionFormat="comma" /> : null}
        </div>
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </PosterShell>
  )
}

function OverlayMetric({
  label,
  value,
  unit,
  motionValue,
  motionFormat,
}: {
  label: string
  value: string
  unit?: string
  motionValue?: number
  motionFormat?: 'comma' | 'dec1'
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span data-role="text" data-motion-kind="metric-label" data-motion-order="44" style={{ color: C.fg2, fontSize: 24, lineHeight: 1, fontWeight: 800, letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
        <span
          data-role={typeof motionValue === 'number' ? 'num' : 'text'}
          data-motion-kind="metric-value"
          data-motion-order="52"
          data-val={typeof motionValue === 'number' ? motionValue : undefined}
          data-fmt={motionFormat}
          style={{ color: C.fg, fontSize: 58, lineHeight: 1, fontWeight: 800 }}
        >
          {value}
        </span>
        {unit ? <span data-role="text" data-motion-kind="metric-unit" data-motion-order="58" style={{ color: C.fg2, fontSize: 26, lineHeight: 1, fontWeight: 800, marginLeft: 8 }}>{unit}</span> : null}
      </div>
    </div>
  )
}
