import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  PhotoLayer,
  PosterShell,
  buildMountainLine,
  formatShareAltitude,
  fourStats,
  hasShareAltitude,
} from './shared'

export function PremiumMonoFilmTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const stats = fourStats(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <PosterShell background="#0a0c0e">
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: 900, overflow: 'hidden' }}>
        <PhotoLayer photoDataUrl={photoDataUrl} width={1080} height={900} grayscale />
        {!photoDataUrl ? <MonoFilmTopTexture /> : null}
        <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, top: 58, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: C.fg2, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.16em' }}>PEAK TREKKER</span>
          {data.visibleFields.date && data.date ? (
            <span style={{ color: C.fg2, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.1em' }}>{data.date}</span>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 430,
            background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,0.54) 54%, #0a0c0e 100%)',
          }}
        />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, top: 1260, bottom: 0, background: '#0a0c0e' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', position: 'absolute', left: 78, right: 78, top: 770 }}>
        {mountainLine ? (
          <span style={{ color: C.fg, fontSize: 42, lineHeight: 1.18, fontWeight: 800, textAlign: 'left' }}>{mountainLine}</span>
        ) : null}
        {showAltitude ? <>
        <span style={{ color: C.fg2, fontSize: 28, lineHeight: 1, fontWeight: 800, letterSpacing: '0.16em', marginTop: 52 }}>最高海拔</span>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 24 }}>
          <span style={{ color: C.success, fontSize: 172, lineHeight: 0.9, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 58, lineHeight: 1, fontWeight: 800, marginLeft: 12 }}>m</span>
        </div>
        </> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 58, right: 58, top: 1388, alignItems: 'stretch', justifyContent: 'center' }}>
        {stats.map((item, index) => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: `${100 / Math.max(1, stats.length)}%`,
              borderLeft: index === 0 ? '0px solid transparent' : '2px solid rgba(245,247,248,.22)',
              padding: '0 12px',
            }}
          >
            <span style={{ color: C.fg2, fontSize: 19, lineHeight: 1, fontWeight: 800, letterSpacing: '0.12em' }}>{item.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
              <span style={{ color: C.fg, fontSize: 36, lineHeight: 1, fontWeight: 800 }}>{item.value}</span>
              {item.unit ? <span style={{ color: C.fg2, fontSize: 18, fontWeight: 800, marginLeft: 5 }}>{item.unit}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}

function MonoFilmTopTexture() {
  return (
    <svg width="1080" height="870" viewBox="0 0 1080 870" style={{ position: 'absolute', left: 0, top: 0, opacity: 0.34 }}>
      <path d="M-80 680 L145 520 L280 590 L445 430 L635 660 L812 505 L1160 720" stroke={C.success} strokeWidth="4" fill="none" opacity=".28" />
      <path d="M-80 775 L165 600 L326 690 L520 520 L718 782 L900 630 L1160 840" stroke={C.success} strokeWidth="2" fill="none" opacity=".18" />
      <path d="M0 0 H1080 V870 H0 Z" fill="rgba(10,12,14,.24)" />
    </svg>
  )
}
