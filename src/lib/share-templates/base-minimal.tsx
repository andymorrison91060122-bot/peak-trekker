import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  DataRow,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  TrailSvg,
  buildMountainLine,
  formatPlainNumber,
} from './shared'

export function BaseMinimalTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)

  return (
    <PosterShell background="#0a0c0e">
      {photoDataUrl ? (
        <>
          <PhotoLayer photoDataUrl={photoDataUrl} />
          <PhotoShade direction="full" strength={0.82} />
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 58% 26%, rgba(110, 231, 161, 0.08), transparent 20%), radial-gradient(circle at 46% 64%, rgba(255, 255, 255, 0.035), transparent 32%), #0a0c0e',
          }}
        />
      )}
      <TrailSvg glow={18} lineWidth={9} />

      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 870,
          background: 'linear-gradient(180deg, transparent 0%, rgba(10, 12, 14, 0.9) 32%, #0a0c0e 92%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 405,
        }}
      >
        {mountainLine ? (
          <span style={{ color: C.fg, fontSize: 40, lineHeight: 1.2, fontWeight: 800, letterSpacing: '0' }}>
            {mountainLine}
          </span>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 34 }}>
          <span style={{ color: C.success, fontSize: 164, lineHeight: 0.92, fontWeight: 800, letterSpacing: '0' }}>
            {formatPlainNumber(data.altitude)}
          </span>
          <span style={{ color: C.success, fontSize: 58, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div>
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: 248 }}>
        <DataRow data={data} />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}
