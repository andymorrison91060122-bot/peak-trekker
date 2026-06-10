import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  DataRow,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  SHARE_TEMPLATE_PALETTE,
  TopoSvg,
  TrailSvg,
  buildMountainLine,
  formatShareAltitude,
  hasShareTrackPoint,
  hasShareAltitude,
} from './shared'

export function PremiumPhotoCompositeTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <PosterShell background={SHARE_TEMPLATE_PALETTE.bgPrimary}>
      <PhotoLayer photoDataUrl={photoDataUrl} />
      {!photoDataUrl ? <TopoSvg opacity={0.28} /> : null}
      <PhotoShade direction="bottom" strength={0.86} />
      {hasShareTrackPoint(data.trackPreview) ? (
        <TrailSvg glow={16} lineWidth={9} trackPreview={data.trackPreview} />
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 72, right: 72, bottom: 390 }}>
        {mountainLine ? (
          <span style={{ color: C.fg, fontSize: 40, lineHeight: 1.2, fontWeight: 800 }}>
            {mountainLine}
          </span>
        ) : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 32 }}>
          <span style={{ color: C.success, fontSize: 160, lineHeight: 0.92, fontWeight: 800 }}>
            {formatShareAltitude(data)}
          </span>
          <span style={{ color: C.success, fontSize: 58, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: 236 }}>
        <DataRow data={data} />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}
