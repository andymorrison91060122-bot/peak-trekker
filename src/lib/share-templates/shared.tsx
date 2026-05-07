import type { ReactNode } from 'react'
import type { ShareTemplateData } from './types'

export const POSTER_WIDTH = 1080
export const POSTER_HEIGHT = 1920

export const C = {
  bg: '#121416',
  bgDeep: '#0a0c0e',
  surface: '#23272c',
  elevated: '#282d33',
  fg: '#f5f7f8',
  fg2: '#9ca3af',
  outline: '#2f353b',
  primary: '#22c55e',
  success: '#6ee7a1',
  onPrimary: '#08120d',
}

export function formatPlainNumber(value: number) {
  if (!Number.isFinite(value)) return '--'
  return String(Math.round(value))
}

export function formatDistance(value: number) {
  if (!Number.isFinite(value)) return '--'
  return value.toFixed(1)
}

export function buildMountainLine(data: ShareTemplateData) {
  return [
    data.visibleFields.mountainName ? data.mountainName : null,
    data.visibleFields.location ? data.location : null,
    data.visibleFields.date ? data.date : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function visibleStats(data: ShareTemplateData) {
  return [
    { key: 'distance', label: 'DISTANCE', value: formatDistance(data.distance), unit: 'km' },
    data.visibleFields.duration
      ? { key: 'duration', label: 'TIME', value: data.duration || '--', unit: '' }
      : null,
    data.visibleFields.elevationGain
      ? { key: 'gain', label: 'GAIN', value: formatPlainNumber(data.elevationGain), unit: 'm' }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; unit: string }>
}

export function MountainGlyph({ size = 40, color = C.success }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M3 19l5-9 4 6 3-4 6 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M8 10l2.8 4.2 1.2-1.9 2.8 4.2" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".82" />
    </svg>
  )
}

export function SourcePill({ source }: { source: ShareTemplateData['source'] }) {
  const gps = source === 'gps'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: gps ? 42 : 44,
        padding: gps ? '0 18px' : '0 20px',
        borderRadius: 16,
        border: gps ? `2px solid rgba(110, 231, 161, 0.62)` : `2px solid rgba(141, 149, 155, 0.54)`,
        background: gps ? 'rgba(34, 197, 94, 0.14)' : 'rgba(255, 255, 255, 0.055)',
        color: gps ? C.fg : C.fg2,
      }}
    >
      {gps ? (
        <>
          <MountainGlyph size={20} />
          <div
            style={{
              width: 1,
              height: 18,
              background: 'rgba(110, 231, 161, 0.4)',
              marginLeft: 10,
              marginRight: 10,
              flexShrink: 0,
            }}
          />
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
            <path d="M5 12.5l4.2 4.2L19 7" stroke={C.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{ fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.06em', marginLeft: 10 }}>
            GPS VERIFIED
          </span>
        </>
      ) : (
        <>
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0, marginRight: 10 }}>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke={C.fg2} strokeWidth="2" fill="none" />
            <path d="M14 3v5h5M8.5 14l2 2 4.5-5" stroke={C.fg2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{ fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.08em' }}>UPLOADED</span>
        </>
      )}
    </div>
  )
}

export function BrandFooter({ source }: { source: ShareTemplateData['source'] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        width: '100%',
      }}
    >
      <MountainGlyph size={52} />
      <span style={{ color: C.fg, fontSize: 34, lineHeight: 1, fontWeight: 800, letterSpacing: '0.01em' }}>
        Peak Trekker
      </span>
      <SourcePill source={source} />
    </div>
  )
}

export function TrailSvg({ glow = 10, lineWidth = 8 }: { glow?: number; lineWidth?: number }) {
  return (
    <svg width={POSTER_WIDTH} height={POSTER_HEIGHT} viewBox={`0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}`} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="poster-trail-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={glow} />
        </filter>
      </defs>
      <path
        d="M285 910 C 360 830 330 760 430 708 C 548 646 500 555 585 506 C 724 425 660 332 780 285 C 870 250 850 174 920 126"
        stroke={C.success}
        strokeWidth={lineWidth * 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity=".16"
        filter="url(#poster-trail-glow)"
      />
      <path
        d="M285 910 C 360 830 330 760 430 708 C 548 646 500 555 585 506 C 724 425 660 332 780 285 C 870 250 850 174 920 126"
        stroke={C.success}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="285" cy="910" r="19" fill={C.bg} stroke={C.success} strokeWidth="8" />
      <circle cx="920" cy="126" r="26" fill={C.success} />
    </svg>
  )
}

export function TopoSvg({ opacity = 0.32 }: { opacity?: number }) {
  const ellipses = [
    [550, 520, 460, 305],
    [570, 510, 385, 255],
    [590, 500, 315, 215],
    [610, 490, 245, 170],
    [630, 478, 180, 124],
    [650, 466, 118, 86],
    [670, 454, 64, 48],
  ]

  return (
    <svg width={POSTER_WIDTH} height={POSTER_HEIGHT} viewBox={`0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}`} style={{ position: 'absolute', inset: 0, opacity }}>
      {ellipses.map(([cx, cy, rx, ry], index) => (
        <ellipse
          key={`${cx}-${rx}`}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          stroke={C.fg}
          strokeWidth="2"
          fill="none"
          opacity={0.08 + index * 0.025}
        />
      ))}
      <path d="M-40 1120 Q 190 1030 430 1082 T 1120 960" stroke={C.fg} strokeWidth="2" fill="none" opacity=".08" />
      <path d="M-40 1280 Q 240 1190 520 1230 T 1120 1110" stroke={C.fg} strokeWidth="2" fill="none" opacity=".07" />
      <path d="M-40 390 Q 210 470 440 390 T 1120 330" stroke={C.fg} strokeWidth="2" fill="none" opacity=".06" />
    </svg>
  )
}

export function DataRow({ data }: { data: ShareTemplateData }) {
  const stats = visibleStats(data)
  return (
    <div style={{ display: 'flex', width: '100%', alignItems: 'stretch', justifyContent: 'center' }}>
      {stats.map((item, index) => (
        <div
          key={item.key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: `${100 / Math.max(1, stats.length)}%`,
            padding: '0 22px',
            borderLeft: index === 0 ? '0px solid transparent' : '2px solid rgba(245, 247, 248, 0.28)',
          }}
        >
          <span style={{ color: C.fg2, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.16em' }}>
            {item.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginTop: 18 }}>
            <span style={{ color: C.fg, fontSize: 50, lineHeight: 1, fontWeight: 800, letterSpacing: '0' }}>
              {item.value}
            </span>
            {item.unit ? (
              <span style={{ color: C.fg2, fontSize: 24, lineHeight: 1, fontWeight: 700, marginLeft: 8 }}>
                {item.unit}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PosterShell({ children, background }: { children: ReactNode; background: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        background,
        color: C.fg,
        fontFamily: 'Noto Sans SC',
      }}
    >
      {children}
    </div>
  )
}
