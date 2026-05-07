import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  TrailSvg,
  buildMountainLine,
  formatPlainNumber,
  visibleStats,
} from './shared'

function TransparentDataRow({ data }: ShareTemplateProps) {
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
            borderLeft: index === 0 ? '0px solid transparent' : '2px solid rgba(245, 247, 248, 0.38)',
          }}
        >
          <span
            style={{
              color: 'rgba(245, 247, 248, 0.68)',
              fontSize: 22,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: '0.16em',
            }}
          >
            {item.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginTop: 18 }}>
            <span style={{ color: C.fg, fontSize: 50, lineHeight: 1, fontWeight: 800, letterSpacing: '0' }}>
              {item.value}
            </span>
            {item.unit ? (
              <span style={{ color: C.fg, fontSize: 24, lineHeight: 1, fontWeight: 700, marginLeft: 8 }}>
                {item.unit}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TransparentWatermarkTemplate({ data }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(0, 0, 0, 0)',
        color: C.fg,
        fontFamily: 'Noto Sans SC',
      }}
    >
      <TrailSvg glow={10} lineWidth={5} />

      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 820,
          background: 'linear-gradient(180deg, rgba(18, 20, 22, 0) 0%, rgba(18, 20, 22, 0.34) 30%, rgba(18, 20, 22, 0.68) 100%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 112,
          right: 112,
          bottom: 386,
        }}
      >
        {mountainLine ? (
          <span style={{ color: C.fg, fontSize: 44, lineHeight: 1.2, fontWeight: 800, letterSpacing: '0' }}>
            {mountainLine}
          </span>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 34 }}>
          <span style={{ color: C.success, fontSize: 170, lineHeight: 0.92, fontWeight: 800, letterSpacing: '0' }}>
            {formatPlainNumber(data.altitude)}
          </span>
          <span style={{ color: C.success, fontSize: 62, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div>
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 88, right: 88, bottom: 230 }}>
        <TransparentDataRow data={data} />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </div>
  )
}
