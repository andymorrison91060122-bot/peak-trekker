import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  DataRow,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  TopoSvg,
  TrailSvg,
  buildMountainLine,
  formatPlainNumber,
} from './shared'

export function PremiumPhotoCompositeTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)

  return (
    <PosterShell background="#0f1113">
      <PhotoLayer photoDataUrl={photoDataUrl} />
      {!photoDataUrl ? <TopoSvg opacity={0.28} /> : null}
      <PhotoShade direction="bottom" strength={0.86} />
      <TrailSvg glow={16} lineWidth={9} />

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 72, right: 72, bottom: 390 }}>
        {mountainLine ? (
          <span style={{ color: C.fg, fontSize: 40, lineHeight: 1.2, fontWeight: 800 }}>
            {mountainLine}
          </span>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 32 }}>
          <span style={{ color: C.success, fontSize: 160, lineHeight: 0.92, fontWeight: 800 }}>
            {formatPlainNumber(data.altitude)}
          </span>
          <span style={{ color: C.success, fontSize: 58, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div>
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
