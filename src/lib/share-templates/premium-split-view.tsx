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

export function PremiumSplitViewTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)

  return (
    <PosterShell background="#101315">
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: 1330, overflow: 'hidden' }}>
        <PhotoLayer photoDataUrl={photoDataUrl} width={1080} height={1330} />
        {!photoDataUrl ? <TopoSvg opacity={0.22} /> : null}
        <PhotoShade direction="full" strength={0.5} />
        <TrailSvg glow={18} lineWidth={10} />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: 650, background: 'linear-gradient(180deg, rgba(18,20,22,.72), #121416 32%, #121416 100%)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 72, right: 72, bottom: 380 }}>
        {mountainLine ? (
          <span style={{ color: C.fg, fontSize: 38, lineHeight: 1.2, fontWeight: 800 }}>{mountainLine}</span>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 24 }}>
          <span style={{ color: C.success, fontSize: 146, lineHeight: 0.92, fontWeight: 800 }}>{formatPlainNumber(data.altitude)}</span>
          <span style={{ color: C.success, fontSize: 54, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div>
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: 230 }}>
        <DataRow data={data} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}
