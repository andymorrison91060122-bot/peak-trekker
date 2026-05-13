import type { ShareTemplateProps } from './types'
import { buildShareTrackPath, type ShareTrackPreview } from '../share-track-preview'
import {
  BrandFooter,
  C,
  PhotoLayer,
  PosterShell,
  buildMountainLine,
  formatPlainNumber,
  fourStats,
} from './shared'

export function PremiumMonoFilmTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const stats = fourStats(data)

  return (
    <PosterShell background="#0a0c0e">
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: 870, overflow: 'hidden' }}>
        <PhotoLayer photoDataUrl={photoDataUrl} width={1080} height={870} />
        {!photoDataUrl ? <MonoFilmTopTexture /> : null}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 348,
            background: 'linear-gradient(180deg, rgba(15,17,19,0) 0%, rgba(15,17,19,0.99) 100%)',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', position: 'absolute', left: 78, right: 78, top: 810 }}>
        {mountainLine ? (
          <span style={{ color: C.fg, fontSize: 38, lineHeight: 1.2, fontWeight: 800, textAlign: 'left' }}>{mountainLine}</span>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 28 }}>
          <span style={{ color: C.success, fontSize: 128, lineHeight: 0.92, fontWeight: 800 }}>{formatPlainNumber(data.altitude)}</span>
          <span style={{ color: C.success, fontSize: 50, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div>
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, top: 1104, height: 430, overflow: 'hidden' }}>
        <MonoFilmTopoTexture />
        <MonoFilmTrailSvg trackPreview={data.trackPreview} />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 58, right: 58, bottom: 232, alignItems: 'stretch', justifyContent: 'center' }}>
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
    </svg>
  )
}

function MonoFilmTopoTexture() {
  return (
    <svg width="936" height="430" viewBox="0 0 936 430" style={{ position: 'absolute', left: 0, top: 0, opacity: 0.24 }}>
      {Array.from({ length: 9 }).map((_, index) => (
        <path
          key={index}
          d={`M${34 + index * 92} 390 C ${92 + index * 76} 300 ${158 + index * 62} 188 ${218 + index * 48} 42`}
          stroke={C.fg}
          strokeWidth="1.2"
          fill="none"
          opacity=".18"
        />
      ))}
      <path d="M-20 332 Q 160 238 330 276 T 956 194" stroke={C.fg} strokeWidth="1.4" fill="none" opacity=".18" />
      <path d="M-20 258 Q 166 166 348 206 T 956 124" stroke={C.fg} strokeWidth="1.2" fill="none" opacity=".12" />
    </svg>
  )
}

const DEFAULT_MONO_FILM_TRAIL_PATH =
  'M128 332 C 205 288 235 304 302 242 S 418 226 500 176 S 648 154 730 92 S 812 82 846 44'

function MonoFilmTrailSvg({ trackPreview }: { trackPreview?: ShareTrackPreview | null }) {
  const route = buildShareTrackPath(trackPreview, {
    x: 96,
    y: 38,
    width: 780,
    height: 310,
    padding: 20,
  })
  const path = route?.d ?? DEFAULT_MONO_FILM_TRAIL_PATH
  const start = route?.start ?? { x: 128, y: 332 }
  const end = route?.end ?? { x: 846, y: 44 }

  return (
    <svg width="936" height="430" viewBox="0 0 936 430" style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs>
        <filter id="mono-film-trail-glow" x="-20%" y="-35%" width="140%" height="170%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>
      <path
        d={path}
        stroke={C.success}
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity=".16"
        filter="url(#mono-film-trail-glow)"
      />
      <path
        d={path}
        stroke={C.success}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={start.x} cy={start.y} r="21" fill="#0a0c0e" stroke={C.success} strokeWidth="8" />
      <circle cx={end.x} cy={end.y} r="27" fill={C.success} />
    </svg>
  )
}
