import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  DataRow,
  MountainRidgeSvg,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  METRIC_FONT_FAMILY,
  buildMountainLine,
  formatPlainNumber,
  formatShareAltitude,
  hasShareAltitude,
} from './shared'

export function PremiumSummitCertificateTemplate({ data, photoDataUrl, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)
  const startAltitude = showAltitude ? Math.max(0, Math.round(data.altitude - data.elevationGain)) : null

  return (
    <PosterShell background="linear-gradient(180deg, #11171a 0%, #0a0c0e 100%)">
      {photoDataUrl ? (
        <>
          <PhotoLayer photoDataUrl={photoDataUrl} />
          <PhotoShade direction="full" strength={0.58} />
        </>
      ) : null}
      <MountainRidgeSvg opacity={photoDataUrl ? 0.24 : 0.18} />
      <ElevationChart />
      {showAltitude && startAltitude !== null ? <span style={{ position: 'absolute', left: 120, top: 870, color: C.fg2, fontSize: 24, lineHeight: 1, fontWeight: 800 }}>
        起点 <span style={{ fontFamily: METRIC_FONT_FAMILY }}>{formatPlainNumber(startAltitude)}m</span>
      </span> : null}
      {showAltitude ? <span style={{ position: 'absolute', right: 120, top: 190, color: C.success, fontSize: 30, lineHeight: 1, fontWeight: 800, fontFamily: METRIC_FONT_FAMILY }}>
        {formatShareAltitude(data)}m
      </span> : null}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 72, right: 72, bottom: 430 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 40, lineHeight: 1.2, fontWeight: 800, textAlign: 'center' }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginTop: 28, fontFamily: METRIC_FONT_FAMILY }}>
          <span style={{ color: C.success, fontSize: 132, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 50, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: 260 }}>
        <DataRow data={data} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </PosterShell>
  )
}

function ElevationChart() {
  return (
    <svg width="1080" height="1000" viewBox="0 0 1080 1000" style={{ position: 'absolute', left: 0, top: 90 }}>
      <defs>
        <linearGradient id="certificate-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.success} stopOpacity=".42" />
          <stop offset="100%" stopColor={C.success} stopOpacity=".02" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M120 ${210 + index * 145} H960`} stroke={C.fg} strokeWidth="1.5" strokeDasharray="9 14" opacity=".11" />
      ))}
      <path d="M120 720 C 252 650 300 702 405 570 C 510 438 560 482 664 348 C 740 250 820 284 960 162 L960 760 L120 760 Z" fill="url(#certificate-fill)" />
      <path d="M120 720 C 252 650 300 702 405 570 C 510 438 560 482 664 348 C 740 250 820 284 960 162" stroke={C.success} strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="120" cy="720" r="13" fill={C.bg} stroke={C.success} strokeWidth="6" />
      <circle cx="960" cy="162" r="18" fill={C.success} />
    </svg>
  )
}
