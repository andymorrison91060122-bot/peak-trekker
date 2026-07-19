import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  buildMountainLine,
  formatDistance,
  formatShareAltitude,
  hasShareAltitude,
} from './shared'

export function PremiumBoldNumberTemplate({ data, photoDataUrl, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <PosterShell background="#111416">
      <PhotoLayer photoDataUrl={photoDataUrl} />
      <PhotoShade direction="full" strength={0.78} />

      {showAltitude ? <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 64, right: 64, top: 180 }}>
        <span data-role="text" data-motion-kind="altitude-label" data-motion-order="26" style={{ color: 'rgba(255, 255, 255, 0.32)', fontSize: 30, lineHeight: 1, fontWeight: 800, letterSpacing: '0.16em' }}>
          最高海拔
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 32 }}>
          <span
            data-role="num"
            data-motion-kind="altitude-value"
            data-val={data.altitude}
            data-fmt="comma"
            style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: 265, lineHeight: 0.86, fontWeight: 800 }}
          >
            {formatShareAltitude(data)}
          </span>
          <span data-role="text" data-motion-kind="altitude-unit" data-motion-order="36" style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: 88, lineHeight: 1, fontWeight: 800, marginLeft: 12 }}>m</span>
        </div>
      </div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 72, right: 72, bottom: 315 }}>
        {mountainLine ? <span data-role="text" data-motion-kind="mountain" data-motion-order="18" style={{ color: C.fg, fontSize: 42, lineHeight: 1.18, fontWeight: 800 }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 36 }}>
          <span
            data-role="num"
            data-motion-kind="altitude-value"
            data-val={data.altitude}
            data-fmt="comma"
            style={{ color: C.success, fontSize: 104, lineHeight: 0.92, fontWeight: 800 }}
          >
            {formatShareAltitude(data)}
          </span>
          <span data-role="text" data-motion-kind="altitude-unit" data-motion-order="36" style={{ color: C.success, fontSize: 42, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: 210, justifyContent: 'space-between' }}>
        <BoldMetric label="DISTANCE" value={formatDistance(data.distance)} unit="km" />
        {data.visibleFields.duration ? <BoldMetric label="TIME" value={data.duration || '--'} align="right" /> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </PosterShell>
  )
}

function BoldMetric({ label, value, unit, align = 'left' }: { label: string; value: string; unit?: string; align?: 'left' | 'right' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', minWidth: 280 }}>
      <span data-role="text" data-motion-kind="metric-label" data-motion-order="44" style={{ color: C.fg2, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.16em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
        <span data-role="text" data-motion-kind="metric-value" data-motion-order="52" style={{ color: C.fg, fontSize: 48, lineHeight: 1, fontWeight: 800 }}>{value}</span>
        {unit ? <span data-role="text" data-motion-kind="metric-unit" data-motion-order="58" style={{ color: C.fg2, fontSize: 24, fontWeight: 800, marginLeft: 8 }}>{unit}</span> : null}
      </div>
    </div>
  )
}
