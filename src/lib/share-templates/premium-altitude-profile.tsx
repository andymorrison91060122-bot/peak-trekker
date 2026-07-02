import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  MiniTrailCircle,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  SmallMetric,
  buildMountainLine,
  formatDistance,
  formatPlainNumber,
  formatShareAltitude,
  hasShareAltitude,
} from './shared'

export function PremiumAltitudeProfileTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <PosterShell background="#101315">
      <PhotoLayer photoDataUrl={photoDataUrl} />
      <PhotoShade direction="full" strength={0.76} />

      <div style={{ display: 'flex', position: 'absolute', left: 72, top: 150 }}>
        <SmallMetric label="总距离" value={formatDistance(data.distance)} unit="km" accent motionValue={data.distance} motionFormat="dec1" />
      </div>
      {data.visibleFields.elevationGain ? (
        <div style={{ display: 'flex', position: 'absolute', right: 72, top: 150 }}>
          <SmallMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" align="right" accent motionValue={data.elevationGain} motionFormat="comma" />
        </div>
      ) : null}

      <div style={{ display: 'flex', position: 'absolute', left: 72, bottom: 430 }}>
        <MiniTrailCircle size={160} trackPreview={data.trackPreview} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 246, right: 246, bottom: 420 }}>
        {mountainLine ? <span data-role="text" data-motion-kind="mountain" data-motion-order="18" style={{ color: C.fg, fontSize: 38, lineHeight: 1.2, fontWeight: 800, textAlign: 'center' }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 26 }}>
          <span
            data-role="num"
            data-motion-kind="altitude-value"
            data-val={data.altitude}
            data-fmt="comma"
            style={{ color: C.success, fontSize: 132, lineHeight: 0.9, fontWeight: 800 }}
          >
            {formatShareAltitude(data)}
          </span>
          <span data-role="text" data-motion-kind="altitude-unit" data-motion-order="36" style={{ color: C.success, fontSize: 48, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', position: 'absolute', right: 72, bottom: 450, gap: 40 }}>
        {data.visibleFields.duration ? <SmallMetric label="时长" value={data.duration || '--'} align="right" /> : null}
        {data.visibleFields.date && data.date ? <SmallMetric label="日期" value={data.date} align="right" /> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}
