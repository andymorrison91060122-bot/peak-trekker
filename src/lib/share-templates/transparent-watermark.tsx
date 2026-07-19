import type { ReactNode } from 'react'
import type { ShareRenderTemplate, ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  MiniTrailCircle,
  MountainRidgeSvg,
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

function BottomClassicBlock({ data, compact = false }: { data: ShareTemplateProps['data']; compact?: boolean }) {
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
          height: compact ? 720 : 820,
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
          bottom: compact ? 340 : 386,
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
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 34 }}>
          <span style={{ color: C.success, fontSize: compact ? 142 : 170, lineHeight: 0.92, fontWeight: 800, letterSpacing: '0' }}>
            {formatShareAltitude(data)}
          </span>
          <span style={{ color: C.success, fontSize: compact ? 54 : 62, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 88, right: 88, bottom: compact ? 204 : 230 }}>
        <TransparentDataRow data={data} />
      </div>
    </div>
  )
}

function WatermarkClassic({ data, brandMarkSrc }: ShareTemplateProps) {
  return (
    <TransparentShell>
      {hasShareTrackPoint(data.trackPreview) ? (
        <TrailSvg glow={10} lineWidth={5} trackPreview={data.trackPreview} />
      ) : null}
      <BottomClassicBlock data={data} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
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
      {showAltitude ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 72, right: 72, top: 520 }}>
        <span style={{ color: C.fg2, fontSize: 38, lineHeight: 1, fontWeight: 800, letterSpacing: '0.08em' }}>最高海拔</span>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginTop: 46 }}>
          <span style={{ color: C.success, fontSize: 238, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 78, lineHeight: 1, fontWeight: 800, marginLeft: 12 }}>m</span>
        </div>
      </div> : null}
      {mountainLine ? (
        <span style={{ position: 'absolute', left: 72, right: 72, bottom: 520, color: C.fg, fontSize: 40, lineHeight: 1.2, fontWeight: 800, textAlign: 'center' }}>
          {mountainLine}
        </span>
      ) : null}
      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: 360 }}>
        <TransparentDataRow data={data} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 58 }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkComposite({ data, brandMarkSrc }: ShareTemplateProps) {
  return (
    <TransparentShell>
      {hasShareTrackPoint(data.trackPreview) ? (
        <TrailSvg glow={14} lineWidth={7} trackPreview={data.trackPreview} />
      ) : null}
      <BottomClassicBlock data={data} compact />
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
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
          background: 'linear-gradient(90deg, rgba(10, 12, 14, 0.68) 0%, rgba(10, 12, 14, 0.44) 42%, rgba(10, 12, 14, 0) 100%)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 70, top: 250, width: 435 }}>
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
        {location ? <span style={{ color: C.fg2, fontSize: 28, lineHeight: 1.15, fontWeight: 800, marginTop: 30 }}>{location}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 44 }}>
          <span style={{ color: C.success, fontSize: 138, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 46, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 42, marginTop: showAltitude ? 74 : 54 }}>
          <WatermarkMetric label="总距离" value={formatDistance(data.distance)} unit="km" />
          {data.visibleFields.duration ? <WatermarkMetric label="时长" value={data.duration || '--'} /> : null}
          {data.visibleFields.elevationGain ? <WatermarkMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" /> : null}
        </div>
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
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
      {showAltitude ? <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 64, right: 64, top: 180 }}>
        <span style={{ color: 'rgba(255, 255, 255, 0.32)', fontSize: 30, lineHeight: 1, fontWeight: 800, letterSpacing: '0.16em' }}>最高海拔</span>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 32 }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: 265, lineHeight: 0.86, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: 88, lineHeight: 1, fontWeight: 800, marginLeft: 12 }}>m</span>
        </div>
      </div> : null}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 72, right: 72, bottom: 315 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 42, lineHeight: 1.18, fontWeight: 800 }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 36 }}>
          <span style={{ color: C.success, fontSize: 104, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 42, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: 210, justifyContent: 'space-between' }}>
        <WatermarkMetric label="DISTANCE" value={formatDistance(data.distance)} unit="km" />
        {data.visibleFields.duration ? <WatermarkMetric label="TIME" value={data.duration || '--'} align="right" /> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
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
      <div style={{ display: 'flex', position: 'absolute', left: 432, top: 0, width: 648, height: 1920, overflow: 'hidden' }}>
        <div style={{ display: 'flex', position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(18,20,22,.48), rgba(18,20,22,.04) 45%, rgba(18,20,22,.32))' }} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 470, height: 1920, background: 'linear-gradient(145deg, rgba(22, 26, 29, 0.82) 0%, rgba(13, 16, 18, 0.78) 100%)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 64, top: 190, width: 340 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 36, lineHeight: 1.24, fontWeight: 800 }}>{mountainLine}</span> : null}
        {showAltitude ? <>
        <span style={{ color: C.fg2, fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '0.14em', marginTop: 64 }}>最高海拔</span>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 18 }}>
          <span style={{ color: C.success, fontSize: 106, lineHeight: 0.9, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 42, lineHeight: 1, fontWeight: 800, marginLeft: 9 }}>m</span>
        </div>
        <div style={{ display: 'flex', width: 52, height: 4, borderRadius: 999, background: C.success, marginTop: 58, marginBottom: 36 }} />
        </> : <div style={{ display: 'flex', height: 36, marginTop: 44 }} />}
        <WatermarkMetric label="总距离" value={formatDistance(data.distance)} unit="km" />
        {data.visibleFields.duration ? <WatermarkMetric label="时长" value={data.duration || '--'} /> : null}
        {data.visibleFields.elevationGain ? <WatermarkMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" /> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} brandMarkSrc={brandMarkSrc} />
      </div>
    </TransparentShell>
  )
}

function WatermarkMonoFilm({ data, brandMarkSrc }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const stats = fourStats(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <TransparentShell>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: 900, overflow: 'hidden' }}>
        <MonoFilmWatermarkTexture />
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: 430, background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,0.36) 54%, rgba(10,12,14,0.78) 100%)' }} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, top: 1260, bottom: 0, background: 'rgba(10,12,14,0.78)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', position: 'absolute', left: 78, right: 78, top: 770 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 42, lineHeight: 1.18, fontWeight: 800, textAlign: 'left' }}>{mountainLine}</span> : null}
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
          <div key={item.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: `${100 / Math.max(1, stats.length)}%`, borderLeft: index === 0 ? '0px solid transparent' : '2px solid rgba(245,247,248,.22)', padding: '0 12px' }}>
            <span style={{ color: C.fg2, fontSize: 19, lineHeight: 1, fontWeight: 800, letterSpacing: '0.12em' }}>{item.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
              <span style={{ color: C.fg, fontSize: 36, lineHeight: 1, fontWeight: 800 }}>{item.value}</span>
              {item.unit ? <span style={{ color: C.fg2, fontSize: 18, fontWeight: 800, marginLeft: 5 }}>{item.unit}</span> : null}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
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
      <div style={{ display: 'flex', position: 'absolute', left: 72, top: 150 }}>
        <SmallMetric label="总距离" value={formatDistance(data.distance)} unit="km" accent />
      </div>
      {data.visibleFields.elevationGain ? (
        <div style={{ display: 'flex', position: 'absolute', right: 72, top: 150 }}>
          <SmallMetric label="爬升" value={formatPlainNumber(data.elevationGain)} unit="m" align="right" accent />
        </div>
      ) : null}
      <div style={{ display: 'flex', position: 'absolute', left: 72, bottom: 430 }}>
        <MiniTrailCircle size={160} trackPreview={data.trackPreview} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 246, right: 246, bottom: 420 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 38, lineHeight: 1.2, fontWeight: 800, textAlign: 'center' }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 26 }}>
          <span style={{ color: C.success, fontSize: 132, lineHeight: 0.9, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 48, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', position: 'absolute', right: 72, bottom: 450, gap: 40 }}>
        {data.visibleFields.duration ? <SmallMetric label="时长" value={data.duration || '--'} align="right" /> : null}
        {data.visibleFields.date && data.date ? <SmallMetric label="日期" value={data.date} align="right" /> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
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
        起点 {formatPlainNumber(startAltitude)}m
      </span> : null}
      {showAltitude ? <span style={{ position: 'absolute', right: 120, top: 190, color: C.success, fontSize: 30, lineHeight: 1, fontWeight: 800 }}>
        {formatShareAltitude(data)}m
      </span> : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 72, right: 72, bottom: 430 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 40, lineHeight: 1.2, fontWeight: 800, textAlign: 'center' }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginTop: 28 }}>
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
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: 520, background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,0.42) 46%, rgba(10,12,14,0.82) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 58, right: 58, top: 66, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: C.fg, fontSize: 26, lineHeight: 1, fontWeight: 800 }}>Peak Trekker</span>
        {data.visibleFields.date && data.date ? <span style={{ color: C.fg2, fontSize: 24, lineHeight: 1, fontWeight: 800 }}>{data.date}</span> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 58, right: 58, bottom: 310 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 42, lineHeight: 1.2, fontWeight: 800 }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 24 }}>
          <span style={{ color: C.success, fontSize: 120, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 46, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 80, right: 80, bottom: 198, height: 58, alignItems: 'center', justifyContent: 'center' }}>
        {showAltitude ? <StoryMiniStat value={formatShareAltitude(data)} unit="m" /> : null}
        <StoryMiniStat value={formatDistance(data.distance)} unit="km" separator={showAltitude} />
        {data.visibleFields.duration ? <StoryMiniStat value={data.duration || '--'} separator /> : null}
        {data.visibleFields.elevationGain ? <StoryMiniStat value={formatPlainNumber(data.elevationGain)} unit="m" separator /> : null}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
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
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
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
      <span style={{ color: C.fg, fontSize: 26, lineHeight: 1, fontWeight: 800 }}>{value}</span>
      {unit ? <span style={{ color: C.fg2, fontSize: 17, lineHeight: 1, fontWeight: 800, marginLeft: 4 }}>{unit}</span> : null}
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
