import type { ReactNode } from 'react'
import { BaseVerticalClassicTemplate } from './base-vertical-classic'
import type { ShareRenderTemplate, ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  MiniTrailCircle,
  MountainRidgeSvg,
  METRIC_FONT_FAMILY,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  SmallMetric,
  TrailSvg,
  buildMountainLine,
  formatDistance,
  formatPlainNumber,
  formatShareAltitude,
  fourStats,
  hasShareAltitude,
  hasShareTrackPoint,
  visibleStats,
} from './shared'

type TransparentWatermarkProps = ShareTemplateProps & {
  template: ShareRenderTemplate
}

const TRANSPARENT_WATERMARK_LAYOUT = {
  classic: {
    trailBounds: { x: 240, y: 240, width: 720, height: 760, padding: 96 },
    gradientHeight: 840,
    infoBottom: 480,
    statsBottom: 278,
    brandBottom: 64,
  },
  data: {
    altitudeTop: 680,
    titleBottom: 600,
    statsBottom: 420,
    brandBottom: 110,
  },
  composite: {
    trailBounds: { x: 240, y: 280, width: 720, height: 740, padding: 96 },
    gradientHeight: 720,
    infoBottom: 400,
    statsBottom: 232,
    brandBottom: 64,
  },
  overlay: {
    gradientMidpoint: 48,
    contentLeft: 108,
    contentTop: 344,
    contentWidth: 420,
    locationMarginTop: 24,
    altitudeMarginTop: 36,
    metricsGap: 30,
    metricsMarginTopWithAltitude: 52,
    metricsMarginTopWithoutAltitude: 42,
    brandBottom: 110,
  },
  boldNumber: {
    ghostTop: 360,
    mainBottom: 520,
    statsBottom: 360,
    brandBottom: 110,
  },
  dataScatter: {
    leftPanelWidth: 460,
    rightPanelLeft: 460,
    rightPanelWidth: 620,
    contentLeft: 96,
    contentTop: 360,
    contentWidth: 336,
    brandBottom: 110,
  },
  monoFilm: {
    topFadeHeight: 500,
    lowerPanelTop: 1180,
    mainTop: 880,
    statsTop: 1260,
    brandBottom: 110,
  },
  altitudeProfile: {
    topMetricsTop: 340,
    miniTrailBottom: 620,
    centerBottom: 610,
    rightBottom: 620,
    rightGap: 32,
    brandBottom: 140,
  },
  verticalStory: {
    headerTop: 170,
    lowerGradientHeight: 650,
    mainBottom: 520,
    statsBottom: 340,
    brandBottom: 130,
  },
} as const

function TransparentShell({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  )
}

function MonoFilmWatermarkTexture() {
  return (
    <svg width="1080" height="900" viewBox="0 0 1080 900" style={{ position: 'absolute', left: 0, top: 0, opacity: 0.3 }}>
      <path d="M-80 700 L145 540 L280 610 L445 450 L635 680 L812 525 L1160 740" stroke={C.success} strokeWidth="4" fill="none" opacity=".18" />
      <path d="M-80 800 L165 625 L326 715 L520 545 L718 807 L900 655 L1160 865" stroke={C.fg} strokeWidth="2" fill="none" opacity=".13" />
      <path d="M0 58 H1080M0 842 H1080" stroke={C.fg} strokeWidth="2" opacity=".12" />
    </svg>
  )
}

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
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginTop: 18, fontFamily: METRIC_FONT_FAMILY }}>
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

function BottomClassicBlock({
  data,
  compact = false,
  layout,
}: {
  data: ShareTemplateProps['data']
  compact?: boolean
  layout: {
    gradientHeight: number
    infoBottom: number
    statsBottom: number
  }
}) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        left: 0,
        top: 0,
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: layout.gradientHeight,
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
          bottom: layout.infoBottom,
        }}
      >
        {mountainLine ? (
          <span
            style={{
              color: C.fg,
              display: 'block',
              width: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: compact ? 40 : 44,
              lineHeight: 1.2,
              fontWeight: 800,
              letterSpacing: '0',
            }}
          >
            {mountainLine}
          </span>
        ) : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 34, fontFamily: METRIC_FONT_FAMILY }}>
          <span style={{ color: C.success, fontSize: compact ? 142 : 170, lineHeight: 0.92, fontWeight: 800, letterSpacing: '0' }}>
            {formatShareAltitude(data)}
          </span>
          <span style={{ color: C.success, fontSize: compact ? 54 : 62, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 88, right: 88, bottom: layout.statsBottom }}>
        <TransparentDataRow data={data} />
      </div>
    </div>
  )
}

function WatermarkClassic({ data, brandMarkSrc }: ShareTemplateProps) {
  return (
    <TransparentShell>
      {hasShareTrackPoint(data.trackPreview) ? (
        <TrailSvg glow={10} lineWidth={5} trackPreview={data.trackPreview} contentBounds={TRANSPARENT_WATERMARK_LAYOUT.classic.trailBounds} />
      ) : null}
      <BottomClassicBlock data={data} layout={TRANSPARENT_WATERMARK_LAYOUT.classic} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.classic.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkData({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <TransparentShell>
      <MountainRidgeSvg opacity={0.14} />
      {showAltitude ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 72, right: 72, top: TRANSPARENT_WATERMARK_LAYOUT.data.altitudeTop }}>
        <span style={{ color: C.fg2, fontSize: 38, lineHeight: 1, fontWeight: 800, letterSpacing: '0.08em' }}>最高海拔</span>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginTop: 46, fontFamily: METRIC_FONT_FAMILY }}>
          <span style={{ color: C.success, fontSize: 238, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 78, lineHeight: 1, fontWeight: 800, marginLeft: 12 }}>m</span>
        </div>
      </div> : null}
      {mountainLine ? (
        <span style={{ position: 'absolute', left: 72, right: 72, bottom: TRANSPARENT_WATERMARK_LAYOUT.data.titleBottom, color: C.fg, fontSize: 40, lineHeight: 1.2, fontWeight: 800, textAlign: 'center' }}>
          {mountainLine}
        </span>
      ) : null}
      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: TRANSPARENT_WATERMARK_LAYOUT.data.statsBottom }}>
        <TransparentDataRow data={data} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.data.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkComposite({ data, brandMarkSrc }: ShareTemplateProps) {
  return (
    <TransparentShell>
      {hasShareTrackPoint(data.trackPreview) ? (
        <TrailSvg glow={14} lineWidth={7} trackPreview={data.trackPreview} contentBounds={TRANSPARENT_WATERMARK_LAYOUT.composite.trailBounds} />
      ) : null}
      <BottomClassicBlock data={data} compact layout={TRANSPARENT_WATERMARK_LAYOUT.composite} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.composite.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkOverlay({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainName = data.visibleFields.mountainName ? data.mountainName : ''
  const location = data.visibleFields.location ? data.location : ''
  const showAltitude = hasShareAltitude(data)

  return (
    <TransparentShell>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(90deg, rgba(10, 12, 14, 0.68) 0%, rgba(10, 12, 14, 0.44) ${TRANSPARENT_WATERMARK_LAYOUT.overlay.gradientMidpoint}%, rgba(10, 12, 14, 0) 100%)`,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: TRANSPARENT_WATERMARK_LAYOUT.overlay.contentLeft, top: TRANSPARENT_WATERMARK_LAYOUT.overlay.contentTop, width: TRANSPARENT_WATERMARK_LAYOUT.overlay.contentWidth }}>
        {mountainName ? (
          <span
            style={{
              color: C.fg,
              display: 'block',
              width: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 38,
              lineHeight: 1.2,
              fontWeight: 800,
            }}
          >
            {mountainName}
          </span>
        ) : null}
        {location ? <span style={{ color: C.fg2, fontSize: 28, lineHeight: 1.15, fontWeight: 800, marginTop: TRANSPARENT_WATERMARK_LAYOUT.overlay.locationMarginTop }}>{location}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: TRANSPARENT_WATERMARK_LAYOUT.overlay.altitudeMarginTop, fontFamily: METRIC_FONT_FAMILY }}>
          <span style={{ color: C.success, fontSize: 138, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 46, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: TRANSPARENT_WATERMARK_LAYOUT.overlay.metricsGap, marginTop: showAltitude ? TRANSPARENT_WATERMARK_LAYOUT.overlay.metricsMarginTopWithAltitude : TRANSPARENT_WATERMARK_LAYOUT.overlay.metricsMarginTopWithoutAltitude }}>
          <WatermarkMetric label="总距离" value={formatDistance(data.distance)} unit="km" />
          {data.visibleFields.duration ? <WatermarkMetric label="时长" value={data.duration || '--'} /> : null}
          {data.visibleFields.elevationGain ? <WatermarkMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" /> : null}
        </div>
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.overlay.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkBoldNumber({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <TransparentShell>
      {showAltitude ? <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 64, right: 64, top: TRANSPARENT_WATERMARK_LAYOUT.boldNumber.ghostTop }}>
        <span style={{ color: 'rgba(255, 255, 255, 0.32)', fontSize: 30, lineHeight: 1, fontWeight: 800, letterSpacing: '0.16em' }}>最高海拔</span>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 32, fontFamily: METRIC_FONT_FAMILY }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: 265, lineHeight: 0.86, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: 88, lineHeight: 1, fontWeight: 800, marginLeft: 12 }}>m</span>
        </div>
      </div> : null}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 72, right: 72, bottom: TRANSPARENT_WATERMARK_LAYOUT.boldNumber.mainBottom }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 42, lineHeight: 1.18, fontWeight: 800 }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 36, fontFamily: METRIC_FONT_FAMILY }}>
          <span style={{ color: C.success, fontSize: 104, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 42, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: TRANSPARENT_WATERMARK_LAYOUT.boldNumber.statsBottom, justifyContent: 'space-between' }}>
        <WatermarkMetric label="DISTANCE" value={formatDistance(data.distance)} unit="km" />
        {data.visibleFields.duration ? <WatermarkMetric label="TIME" value={data.duration || '--'} align="right" /> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.boldNumber.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkDataScatter({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <TransparentShell>
      <div style={{ display: 'flex', position: 'absolute', left: TRANSPARENT_WATERMARK_LAYOUT.dataScatter.rightPanelLeft, top: 0, width: TRANSPARENT_WATERMARK_LAYOUT.dataScatter.rightPanelWidth, height: POSTER_HEIGHT, overflow: 'hidden' }}>
        <div style={{ display: 'flex', position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(18,20,22,.48), rgba(18,20,22,.04) 45%, rgba(18,20,22,.32))' }} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: TRANSPARENT_WATERMARK_LAYOUT.dataScatter.leftPanelWidth, height: POSTER_HEIGHT, background: 'linear-gradient(145deg, rgba(22, 26, 29, 0.82) 0%, rgba(13, 16, 18, 0.78) 100%)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: TRANSPARENT_WATERMARK_LAYOUT.dataScatter.contentLeft, top: TRANSPARENT_WATERMARK_LAYOUT.dataScatter.contentTop, width: TRANSPARENT_WATERMARK_LAYOUT.dataScatter.contentWidth }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 36, lineHeight: 1.24, fontWeight: 800 }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', flexDirection: 'column', marginTop: 64, flexShrink: 0 }}>
          <span style={{ color: C.fg2, display: 'flex', height: 22, flexShrink: 0, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.14em' }}>最高海拔</span>
          <div style={{ display: 'flex', alignItems: 'baseline', height: 96, flexShrink: 0, whiteSpace: 'nowrap', marginTop: 18, fontFamily: METRIC_FONT_FAMILY }}>
            <span style={{ color: C.success, fontSize: 106, lineHeight: 0.9, fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap' }}>{formatShareAltitude(data)}</span>
            <span style={{ color: C.success, fontSize: 42, lineHeight: 1, fontWeight: 800, marginLeft: 9, flexShrink: 0, whiteSpace: 'nowrap' }}>m</span>
          </div>
          <div style={{ display: 'flex', width: 52, height: 4, borderRadius: 999, background: C.success, marginTop: 58, marginBottom: 36 }} />
        </div> : <div style={{ display: 'flex', height: 36, marginTop: 44 }} />}
        <WatermarkMetric label="总距离" value={formatDistance(data.distance)} unit="km" />
        {data.visibleFields.duration ? <WatermarkMetric label="时长" value={data.duration || '--'} /> : null}
        {data.visibleFields.elevationGain ? <WatermarkMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" /> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.dataScatter.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkMonoFilm({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const stats = fourStats(data).filter((item) => item.key !== 'date')
  const showAltitude = hasShareAltitude(data)

  return (
    <TransparentShell>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: 900, overflow: 'hidden' }}>
        <MonoFilmWatermarkTexture />
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: TRANSPARENT_WATERMARK_LAYOUT.monoFilm.topFadeHeight, background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,0.36) 54%, rgba(10,12,14,0.78) 100%)' }} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, top: TRANSPARENT_WATERMARK_LAYOUT.monoFilm.lowerPanelTop, bottom: 0, background: 'rgba(10,12,14,0.78)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', position: 'absolute', left: 78, right: 78, top: TRANSPARENT_WATERMARK_LAYOUT.monoFilm.mainTop }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 42, lineHeight: 1.18, fontWeight: 800, textAlign: 'left' }}>{mountainLine}</span> : null}
        {showAltitude ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: 52, gap: 24 }}>
            <span style={{ color: C.fg2, fontSize: 28, lineHeight: 1, fontWeight: 800, letterSpacing: '0.16em' }}>最高海拔</span>
            <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: METRIC_FONT_FAMILY }}>
              <span style={{ color: C.success, fontSize: 172, lineHeight: 0.9, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
              <span style={{ color: C.success, fontSize: 58, lineHeight: 1, fontWeight: 800, marginLeft: 12 }}>m</span>
            </div>
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 58, right: 58, top: TRANSPARENT_WATERMARK_LAYOUT.monoFilm.statsTop, alignItems: 'stretch', justifyContent: 'center' }}>
        {stats.map((item, index) => (
          <div key={item.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: `${100 / Math.max(1, stats.length)}%`, borderLeft: index === 0 ? '0px solid transparent' : '2px solid rgba(245,247,248,.22)', padding: '0 12px' }}>
            <span style={{ color: C.fg2, fontSize: 19, lineHeight: 1, fontWeight: 800, letterSpacing: '0.12em' }}>{item.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12, fontFamily: METRIC_FONT_FAMILY }}>
              <span style={{ color: C.fg, fontSize: 36, lineHeight: 1, fontWeight: 800 }}>{item.value}</span>
              {item.unit ? <span style={{ color: C.fg2, fontSize: 18, fontWeight: 800, marginLeft: 5 }}>{item.unit}</span> : null}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.monoFilm.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkAltitudeProfile({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <TransparentShell>
      <div style={{ display: 'flex', position: 'absolute', left: 72, top: TRANSPARENT_WATERMARK_LAYOUT.altitudeProfile.topMetricsTop }}>
        <SmallMetric label="总距离" value={formatDistance(data.distance)} unit="km" accent />
      </div>
      {data.visibleFields.elevationGain ? (
        <div style={{ display: 'flex', position: 'absolute', right: 72, top: TRANSPARENT_WATERMARK_LAYOUT.altitudeProfile.topMetricsTop }}>
          <SmallMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" align="right" accent />
        </div>
      ) : null}
      <div style={{ display: 'flex', position: 'absolute', left: 72, bottom: TRANSPARENT_WATERMARK_LAYOUT.altitudeProfile.miniTrailBottom }}>
        <MiniTrailCircle size={160} trackPreview={data.trackPreview} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 246, right: 246, bottom: TRANSPARENT_WATERMARK_LAYOUT.altitudeProfile.centerBottom }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 38, lineHeight: 1.2, fontWeight: 800, textAlign: 'center' }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 26, fontFamily: METRIC_FONT_FAMILY }}>
          <span style={{ color: C.success, fontSize: 132, lineHeight: 0.9, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 48, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', position: 'absolute', right: 72, bottom: TRANSPARENT_WATERMARK_LAYOUT.altitudeProfile.rightBottom, gap: TRANSPARENT_WATERMARK_LAYOUT.altitudeProfile.rightGap }}>
        {data.visibleFields.duration ? <SmallMetric label="时长" value={data.duration || '--'} align="right" /> : null}
        {data.visibleFields.date && data.date ? <SmallMetric label="日期" value={data.date} align="right" metric={false} /> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.altitudeProfile.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkCertificate({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)
  const startAltitude = showAltitude ? Math.max(0, Math.round(data.altitude - data.elevationGain)) : null

  return (
    <TransparentShell>
      <MountainRidgeSvg opacity={0.18} />
      <CertificateElevationChart />
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
        <TransparentDataRow data={data} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkVerticalStory({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <TransparentShell>
      <div style={{ display: 'flex', position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,12,14,0.1), rgba(10,12,14,0.16) 62%, rgba(10,12,14,0))' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: TRANSPARENT_WATERMARK_LAYOUT.verticalStory.lowerGradientHeight, background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,0.42) 46%, rgba(10,12,14,0.82) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 58, right: 58, top: TRANSPARENT_WATERMARK_LAYOUT.verticalStory.headerTop, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: C.fg, fontSize: 26, lineHeight: 1, fontWeight: 800 }}>Peak Trekker</span>
        {data.visibleFields.date && data.date ? <span style={{ color: C.fg2, fontSize: 24, lineHeight: 1, fontWeight: 800 }}>{data.date}</span> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 58, right: 58, bottom: TRANSPARENT_WATERMARK_LAYOUT.verticalStory.mainBottom }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 42, lineHeight: 1.2, fontWeight: 800 }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 24, fontFamily: METRIC_FONT_FAMILY }}>
          <span style={{ color: C.success, fontSize: 120, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 46, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 80, right: 80, bottom: TRANSPARENT_WATERMARK_LAYOUT.verticalStory.statsBottom, height: 58, alignItems: 'center', justifyContent: 'center' }}>
        {showAltitude ? <StoryMiniStat value={formatShareAltitude(data)} unit="m" /> : null}
        <StoryMiniStat value={formatDistance(data.distance)} unit="km" separator={showAltitude} />
        {data.visibleFields.duration ? <StoryMiniStat value={data.duration || '--'} separator /> : null}
        {data.visibleFields.elevationGain ? <StoryMiniStat value={formatPlainNumber(data.elevationGain)} unit="m" separator /> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: TRANSPARENT_WATERMARK_LAYOUT.verticalStory.brandBottom }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkMetric({
  label,
  value,
  unit,
  align = 'left',
}: {
  label: string
  value: string
  unit?: string
  align?: 'left' | 'right'
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', minWidth: 240 }}>
      <span style={{ color: C.fg2, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.12em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12, fontFamily: METRIC_FONT_FAMILY }}>
        <span style={{ color: C.fg, fontSize: 48, lineHeight: 1, fontWeight: 800 }}>{value}</span>
        {unit ? <span style={{ color: C.fg2, fontSize: 24, fontWeight: 800, marginLeft: 8 }}>{unit}</span> : null}
      </div>
    </div>
  )
}

function StoryMiniStat({ value, unit, separator = false }: { value: string; unit?: string; separator?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '25%',
        height: 44,
        borderLeft: separator ? '2px solid rgba(245,247,248,.24)' : '0px solid transparent',
      }}
    >
      <span style={{ color: C.fg, fontSize: 26, lineHeight: 1, fontWeight: 800, fontFamily: METRIC_FONT_FAMILY }}>{value}</span>
      {unit ? <span style={{ color: C.fg2, fontSize: 17, lineHeight: 1, fontWeight: 800, marginLeft: 4, fontFamily: METRIC_FONT_FAMILY }}>{unit}</span> : null}
    </div>
  )
}

function CertificateElevationChart() {
  return (
    <svg width="1080" height="1000" viewBox="0 0 1080 1000" style={{ position: 'absolute', left: 0, top: 90 }}>
      <defs>
        <linearGradient id="transparent-certificate-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.success} stopOpacity=".42" />
          <stop offset="100%" stopColor={C.success} stopOpacity=".02" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((index) => (
        <path key={index} d={`M120 ${210 + index * 145} H960`} stroke={C.fg} strokeWidth="1.5" strokeDasharray="9 14" opacity=".11" />
      ))}
      <path d="M120 720 C 252 650 300 702 405 570 C 510 438 560 482 664 348 C 740 250 820 284 960 162 L960 760 L120 760 Z" fill="url(#transparent-certificate-fill)" />
      <path d="M120 720 C 252 650 300 702 405 570 C 510 438 560 482 664 348 C 740 250 820 284 960 162" stroke={C.success} strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="120" cy="720" r="13" fill={C.bg} stroke={C.success} strokeWidth="6" />
      <circle cx="960" cy="162" r="18" fill={C.success} />
    </svg>
  )
}

export function TransparentWatermarkTemplate({
  data,
  template,
  brandMarkSrc,
}: TransparentWatermarkProps) {
  if (template === 'base-vertical-classic') return <BaseVerticalClassicTemplate data={data} transparent brandMarkSrc={brandMarkSrc} />
  if (template === 'base-data') return <WatermarkData data={data} brandMarkSrc={brandMarkSrc} />
  if (template === 'premium-photo-composite') return <WatermarkComposite data={data} brandMarkSrc={brandMarkSrc} />
  if (template === 'premium-photo-overlay') return <WatermarkOverlay data={data} brandMarkSrc={brandMarkSrc} />
  if (template === 'premium-bold-number') return <WatermarkBoldNumber data={data} brandMarkSrc={brandMarkSrc} />
  if (template === 'premium-data-scatter') return <WatermarkDataScatter data={data} brandMarkSrc={brandMarkSrc} />
  if (template === 'premium-mono-film') return <WatermarkMonoFilm data={data} brandMarkSrc={brandMarkSrc} />
  if (template === 'premium-altitude-profile') return <WatermarkAltitudeProfile data={data} brandMarkSrc={brandMarkSrc} />
  if (template === 'premium-summit-certificate') return <WatermarkCertificate data={data} brandMarkSrc={brandMarkSrc} />
  if (template === 'premium-vertical-story') return <WatermarkVerticalStory data={data} brandMarkSrc={brandMarkSrc} />
  return <WatermarkClassic data={data} brandMarkSrc={brandMarkSrc} />
}
