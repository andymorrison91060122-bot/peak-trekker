import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  PhotoLayer,
  PosterShell,
  TopoSvg,
  buildMountainLine,
  formatDistance,
  formatPlainNumber,
} from './shared'

export function PremiumDataScatterTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)

  return (
    <PosterShell background="#111416">
      <div style={{ display: 'flex', position: 'absolute', left: 432, top: 0, width: 648, height: 1920, overflow: 'hidden' }}>
        <PhotoLayer photoDataUrl={photoDataUrl} width={648} height={1920} />
        {!photoDataUrl ? <TopoSvg opacity={0.18} /> : null}
        <div style={{ display: 'flex', position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(18,20,22,.55), rgba(18,20,22,.06) 45%, rgba(18,20,22,.35))' }} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 470, height: 1920, background: 'linear-gradient(145deg, #161a1d 0%, #0d1012 100%)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 64, top: 190, width: 340 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 36, lineHeight: 1.24, fontWeight: 800 }}>{mountainLine}</span> : null}
        <span style={{ color: C.fg2, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.14em', marginTop: 64 }}>峰顶海拔</span>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 18 }}>
          <span style={{ color: C.success, fontSize: 106, lineHeight: 0.9, fontWeight: 800 }}>{formatPlainNumber(data.altitude)}</span>
          <span style={{ color: C.success, fontSize: 42, lineHeight: 1, fontWeight: 800, marginLeft: 9 }}>m</span>
        </div>
        <ScatterDivider />
        <ScatterMetric label="总距离" value={formatDistance(data.distance)} unit="km" />
        {data.visibleFields.duration ? <ScatterMetric label="时长" value={data.duration || '--'} /> : null}
        {data.visibleFields.elevationGain ? <ScatterMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" /> : null}
        {data.visibleFields.date && data.date ? <ScatterMetric label="日期" value={data.date} compact /> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}

function ScatterDivider() {
  return <div style={{ display: 'flex', width: 52, height: 4, borderRadius: 999, background: C.success, marginTop: 58, marginBottom: 36 }} />
}

function ScatterMetric({ label, value, unit, compact = false }: { label: string; value: string; unit?: string; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: compact ? 28 : 40 }}>
      <span style={{ color: C.fg2, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
        <span style={{ color: C.fg, fontSize: compact ? 38 : 54, lineHeight: 1, fontWeight: 800 }}>{value}</span>
        {unit ? <span style={{ color: C.fg2, fontSize: 24, fontWeight: 800, marginLeft: 8 }}>{unit}</span> : null}
      </div>
    </div>
  )
}
