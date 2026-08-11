import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  DataRow,
  PhotoLayer,
  PhotoShade,
  PosterShell,
  SHARE_TEMPLATE_PALETTE,
  TrailSvg,
  METRIC_FONT_FAMILY,
  buildMountainLine,
  formatShareAltitude,
  hasShareTrackPoint,
  hasShareAltitude,
} from './shared'

export function BaseClassicTemplate({ data, photoDataUrl, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <PosterShell background={`linear-gradient(180deg, ${SHARE_TEMPLATE_PALETTE.bgGradient} 0%, ${SHARE_TEMPLATE_PALETTE.bgPrimary} 100%)`}>
      {photoDataUrl ? (
        <>
          <PhotoLayer photoDataUrl={photoDataUrl} />
          <PhotoShade direction="full" strength={0.74} />
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 72% 12%, rgba(110, 231, 161, 0.12), transparent 20%), linear-gradient(180deg, rgba(35, 39, 44, 0.34), rgba(18, 20, 22, 0.96) 70%)',
          }}
        />
      )}
      {hasShareTrackPoint(data.trackPreview) ? (
        <TrailSvg glow={12} lineWidth={8} trackPreview={data.trackPreview} />
      ) : null}

      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 820,
          background: 'linear-gradient(180deg, transparent 0%, rgba(18, 20, 22, 0.92) 28%, #121416 92%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 380,
        }}
      >
        {mountainLine ? (
          <span
            data-role="text"
            data-motion-kind="mountain"
            data-motion-order="18"
            style={{
              color: C.fg,
              display: 'block',
              width: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 40,
              lineHeight: 1.2,
              fontWeight: 800,
              letterSpacing: '0',
            }}
          >
            {mountainLine}
          </span>
        ) : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 34, fontFamily: METRIC_FONT_FAMILY }}>
          <span
            data-role="num"
            data-motion-kind="altitude-value"
            data-val={data.altitude}
            data-fmt="comma"
            style={{ color: C.success, fontSize: 164, lineHeight: 0.92, fontWeight: 800, letterSpacing: '0' }}
          >
            {formatShareAltitude(data)}
          </span>
          <span data-role="text" data-motion-kind="altitude-unit" data-motion-order="36" style={{ color: C.success, fontSize: 58, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 80, right: 64, bottom: 226 }}>
        <DataRow data={data} />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </PosterShell>
  )
}
